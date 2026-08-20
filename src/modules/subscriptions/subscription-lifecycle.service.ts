import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PlanAudience,
  Prisma,
  SubscriptionCheckoutStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { AppConfig } from '../../common/config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CandidateSandboxCheckoutDto } from './dto/candidate-sandbox-checkout.dto';
import { RecruiterSandboxCheckoutDto } from '../company-subscriptions/dto/recruiter-sandbox-checkout.dto';
import { activeSubscriptionRaceError, isActiveSubscriptionRace } from './active-subscription-race';

const DAY_MS = 86_400_000;

/**
 * Owns subscription state transitions.  It is intentionally payment-provider
 * agnostic: SANDBOX is a controlled lifecycle, not a fake invoice payment.
 */
@Injectable()
export class SubscriptionLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async candidateSandboxCheckout(
    candidateProfileId: string,
    actor: AuthenticatedUser,
    dto: CandidateSandboxCheckoutDto,
  ) {
    this.assertSandboxEnabled();

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        id: dto.planId,
        audience: PlanAudience.CANDIDATE,
        status: SubscriptionStatus.ACTIVE,
        isPublic: true,
        price: { gt: 0 },
      },
      include: { features: true },
    });
    if (!plan) {
      throw new NotFoundException({
        code: 'SUBSCRIPTION_PLAN_NOT_AVAILABLE',
        message: 'Gói đã chọn hiện không khả dụng cho ứng viên.',
      });
    }

    const now = new Date();
    const snapshot: Prisma.InputJsonValue = {
      code: plan.code,
      name: plan.subscriptionName,
      audience: plan.audience,
      price: plan.price.toString(),
      currency: 'VND',
      durationDays: plan.durationDays,
      features: plan.features.map((feature) => ({
        feature: feature.feature,
        enabled: feature.enabled,
        limit: feature.limitValue,
      })),
    };

    return this.prisma
      .$transaction(async (tx) => {
        const checkout = await tx.subscriptionCheckout.upsert({
          where: {
            audience_ownerId_idempotencyKey: {
              audience: PlanAudience.CANDIDATE,
              ownerId: candidateProfileId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          update: {},
          create: {
            audience: PlanAudience.CANDIDATE,
            ownerId: candidateProfileId,
            subscriptionPlanId: plan.id,
            planSnapshot: snapshot,
            amount: plan.price,
            currency: 'VND',
            provider: 'SANDBOX',
            idempotencyKey: dto.idempotencyKey,
            actorType: actor.role,
            actorId: actor.id,
          },
        });

        if (checkout.subscriptionPlanId !== plan.id) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message:
              'Khóa xác nhận này đã được dùng cho một gói khác. Hãy thử lại từ màn hình gói.',
          });
        }

        const claimed = await tx.subscriptionCheckout.updateMany({
          where: { id: checkout.id, status: SubscriptionCheckoutStatus.PENDING },
          data: { status: SubscriptionCheckoutStatus.COMPLETED, completedAt: now },
        });

        if (!claimed.count) {
          if (checkout.status === SubscriptionCheckoutStatus.CANCELLED) {
            throw new ConflictException({
              code: 'CHECKOUT_CANCELLED',
              message: 'Yêu cầu nâng cấp này đã bị hủy.',
            });
          }
          const completed = checkout.subscriptionId
            ? await tx.candidateSubscription.findFirst({
                where: { id: checkout.subscriptionId, candidateProfileId },
                include: { plan: true },
              })
            : null;
          if (!completed)
            throw new ConflictException('Checkout is still being completed. Please retry.');
          return { data: this.toSubscriptionResponse(completed, checkout.id), replayed: true };
        }

        // Chỉ "Free -> trả phí" được phép bắt đầu chu kỳ mới với bộ đếm về 0.  Mọi
        // chuyển dịch giữa hai gói TRẢ PHÍ phải giữ nguyên chu kỳ và mang theo số đã
        // dùng, và điều đó chưa được cài.  Nếu cho đi tiếp ở đây thì mua lại gói trở
        // thành cách reset hạn mức: mỗi checkout tạo một hàng mới với usedValue = 0.
        // Kiểm tra nằm trong cùng transaction với thao tác ghi, sau nhánh replay, nên
        // một retry hợp lệ vẫn trả về subscription cũ thay vì gặp lỗi này.
        const current = await tx.candidateSubscription.findFirst({
          where: {
            candidateProfileId,
            status: SubscriptionStatus.ACTIVE,
            expiredAt: { gt: now },
          },
          orderBy: { startedAt: 'desc' },
          select: { planId: true, plan: { select: { price: true } } },
        });
        if (current && Number(current.plan.price) > 0) {
          throw new ConflictException(
            current.planId === plan.id
              ? {
                  code: 'SUBSCRIPTION_ALREADY_ACTIVE',
                  message:
                    'Bạn đang dùng gói này. Gia hạn sẽ được áp dụng khi hết chu kỳ hiện tại.',
                }
              : {
                  code: 'SUBSCRIPTION_CHANGE_NOT_SUPPORTED',
                  message:
                    'Đổi gói giữa chu kỳ chưa được hỗ trợ. Vui lòng chờ hết chu kỳ hiện tại rồi chọn gói mới.',
                },
          );
        }

        const expiresAt = new Date(now.getTime() + plan.durationDays * DAY_MS);
        await tx.candidateSubscription.updateMany({
          where: { candidateProfileId, status: SubscriptionStatus.ACTIVE },
          data: { status: SubscriptionStatus.INACTIVE },
        });
        const subscription = await tx.candidateSubscription.create({
          data: {
            candidateProfileId,
            planId: plan.id,
            startedAt: now,
            expiredAt: expiresAt,
            currentPeriodStart: now,
            currentPeriodEnd: expiresAt,
            source: 'SANDBOX_CHECKOUT',
            planSnapshot: snapshot,
            status: SubscriptionStatus.ACTIVE,
          },
          include: { plan: true },
        });
        await tx.subscriptionCheckout.update({
          where: { id: checkout.id },
          data: { subscriptionId: subscription.id },
        });
        if (plan.features.length) {
          await tx.candidateSubscriptionQuotaCounter.createMany({
            data: plan.features.map((feature) => ({
              candidateSubscriptionId: subscription.id,
              feature: feature.feature,
              limitValue: feature.limitValue,
              periodStart: now,
              periodEnd: expiresAt,
            })),
            skipDuplicates: true,
          });
        }
        await tx.subscriptionLifecycleEvent.createMany({
          data: [
            {
              audience: PlanAudience.CANDIDATE,
              ownerId: candidateProfileId,
              eventType: 'CHECKOUT_COMPLETED',
              subscriptionPlanId: plan.id,
              checkoutId: checkout.id,
              actorType: actor.role,
              actorId: actor.id,
              metadata: { provider: 'SANDBOX', idempotencyKey: dto.idempotencyKey },
            },
            {
              audience: PlanAudience.CANDIDATE,
              ownerId: candidateProfileId,
              eventType: 'SUBSCRIPTION_ACTIVATED',
              subscriptionPlanId: plan.id,
              checkoutId: checkout.id,
              actorType: actor.role,
              actorId: actor.id,
              metadata: { subscriptionId: subscription.id, source: 'SANDBOX_CHECKOUT' },
            },
          ],
        });

        return { data: this.toSubscriptionResponse(subscription, checkout.id), replayed: false };
      })
      .catch(this.rethrowActivationRace);
  }

  /**
   * Sandbox checkout for a recruiter's current company.  This deliberately
   * mirrors the candidate lifecycle rather than using the legacy admin grant
   * endpoint: the caller can only purchase a public recruiter plan for the
   * company carried by their JWT, and every retry is idempotent.
   */
  async recruiterSandboxCheckout(
    companyId: string,
    actor: AuthenticatedUser,
    dto: RecruiterSandboxCheckoutDto,
  ) {
    this.assertSandboxEnabled();

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        id: dto.planId,
        audience: PlanAudience.RECRUITER,
        status: SubscriptionStatus.ACTIVE,
        isPublic: true,
        price: { gt: 0 },
      },
      include: { features: true },
    });
    if (!plan) {
      throw new NotFoundException({
        code: 'SUBSCRIPTION_PLAN_NOT_AVAILABLE',
        message: 'Gói đã chọn hiện không khả dụng cho nhà tuyển dụng.',
      });
    }

    const now = new Date();
    const snapshot: Prisma.InputJsonValue = {
      code: plan.code,
      name: plan.subscriptionName,
      audience: plan.audience,
      price: plan.price.toString(),
      currency: 'VND',
      durationDays: plan.durationDays,
      features: plan.features.map((feature) => ({
        feature: feature.feature,
        enabled: feature.enabled,
        limit: feature.limitValue,
      })),
    };

    return this.prisma
      .$transaction(async (tx) => {
        const checkout = await tx.subscriptionCheckout.upsert({
          where: {
            audience_ownerId_idempotencyKey: {
              audience: PlanAudience.RECRUITER,
              ownerId: companyId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          update: {},
          create: {
            audience: PlanAudience.RECRUITER,
            ownerId: companyId,
            subscriptionPlanId: plan.id,
            planSnapshot: snapshot,
            amount: plan.price,
            currency: 'VND',
            provider: 'SANDBOX',
            idempotencyKey: dto.idempotencyKey,
            actorType: actor.role,
            actorId: actor.id,
          },
        });

        if (checkout.subscriptionPlanId !== plan.id) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message:
              'Khóa xác nhận này đã được dùng cho một gói khác. Hãy thử lại từ màn hình gói.',
          });
        }

        const claimed = await tx.subscriptionCheckout.updateMany({
          where: { id: checkout.id, status: SubscriptionCheckoutStatus.PENDING },
          data: { status: SubscriptionCheckoutStatus.COMPLETED, completedAt: now },
        });
        if (!claimed.count) {
          if (checkout.status === SubscriptionCheckoutStatus.CANCELLED) {
            throw new ConflictException({
              code: 'CHECKOUT_CANCELLED',
              message: 'Yêu cầu nâng cấp này đã bị hủy.',
            });
          }
          const completed = checkout.subscriptionId
            ? await tx.companySubscription.findFirst({
                where: { id: checkout.subscriptionId, companyId },
                include: { plan: true },
              })
            : null;
          if (!completed)
            throw new ConflictException('Checkout is still being completed. Please retry.');
          return { data: this.toSubscriptionResponse(completed, checkout.id), replayed: true };
        }

        // Cùng lý do như phía candidate: chỉ Free -> trả phí được reset bộ đếm.  Xem
        // ghi chú trong candidateSandboxCheckout.
        const current = await tx.companySubscription.findFirst({
          where: {
            companyId,
            status: SubscriptionStatus.ACTIVE,
            expiredAt: { gt: now },
          },
          orderBy: { startedAt: 'desc' },
          select: { planId: true, plan: { select: { price: true } } },
        });
        if (current && Number(current.plan.price) > 0) {
          throw new ConflictException(
            current.planId === plan.id
              ? {
                  code: 'SUBSCRIPTION_ALREADY_ACTIVE',
                  message:
                    'Công ty đang dùng gói này. Gia hạn sẽ được áp dụng khi hết chu kỳ hiện tại.',
                }
              : {
                  code: 'SUBSCRIPTION_CHANGE_NOT_SUPPORTED',
                  message:
                    'Đổi gói giữa chu kỳ chưa được hỗ trợ. Vui lòng chờ hết chu kỳ hiện tại rồi chọn gói mới.',
                },
          );
        }

        const expiresAt = new Date(now.getTime() + plan.durationDays * DAY_MS);
        await tx.companySubscription.updateMany({
          where: { companyId, status: SubscriptionStatus.ACTIVE },
          data: { status: SubscriptionStatus.INACTIVE },
        });
        const subscription = await tx.companySubscription.create({
          data: {
            companyId,
            planId: plan.id,
            jobPostLimit: plan.jobPostLimit,
            boostCreditTotal: plan.boostCreditLimit,
            talentContactLimit: plan.talentContactLimit,
            startedAt: now,
            expiredAt: expiresAt,
            currentPeriodStart: now,
            currentPeriodEnd: expiresAt,
            source: 'SANDBOX_CHECKOUT',
            planSnapshot: snapshot,
            status: SubscriptionStatus.ACTIVE,
          },
          include: { plan: true },
        });
        await tx.subscriptionCheckout.update({
          where: { id: checkout.id },
          data: { subscriptionId: subscription.id },
        });
        if (plan.features.length) {
          await tx.subscriptionQuotaCounter.createMany({
            data: plan.features.map((feature) => ({
              companySubscriptionId: subscription.id,
              feature: feature.feature,
              limitValue: feature.limitValue,
              usedValue: 0,
              periodStart: now,
              periodEnd: expiresAt,
            })),
            skipDuplicates: true,
          });
        }
        await tx.subscriptionLifecycleEvent.createMany({
          data: [
            {
              audience: PlanAudience.RECRUITER,
              ownerId: companyId,
              eventType: 'CHECKOUT_COMPLETED',
              subscriptionPlanId: plan.id,
              checkoutId: checkout.id,
              actorType: actor.role,
              actorId: actor.id,
              metadata: { provider: 'SANDBOX', idempotencyKey: dto.idempotencyKey },
            },
            {
              audience: PlanAudience.RECRUITER,
              ownerId: companyId,
              eventType: 'SUBSCRIPTION_ACTIVATED',
              subscriptionPlanId: plan.id,
              checkoutId: checkout.id,
              actorType: actor.role,
              actorId: actor.id,
              metadata: { subscriptionId: subscription.id, source: 'SANDBOX_CHECKOUT' },
            },
          ],
        });
        return { data: this.toSubscriptionResponse(subscription, checkout.id), replayed: false };
      })
      .catch(this.rethrowActivationRace);
  }

  async requestCandidateCancellation(candidateProfileId: string, actor: AuthenticatedUser) {
    const subscription = await this.requireCandidateActiveSubscription(candidateProfileId);
    if (subscription.cancelAtPeriodEnd) return { data: this.toSubscriptionResponse(subscription) };
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.candidateSubscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true, cancelRequestedAt: now },
        include: { plan: true },
      });
      await tx.subscriptionLifecycleEvent.create({
        data: {
          audience: PlanAudience.CANDIDATE,
          ownerId: candidateProfileId,
          eventType: 'CANCELLATION_REQUESTED',
          subscriptionPlanId: value.planId,
          actorType: actor.role,
          actorId: actor.id,
          metadata: { subscriptionId: value.id, effectiveAt: value.expiredAt.toISOString() },
        },
      });
      return value;
    });
    return { data: this.toSubscriptionResponse(updated) };
  }

  async revokeCandidateCancellation(candidateProfileId: string, actor: AuthenticatedUser) {
    const subscription = await this.requireCandidateActiveSubscription(candidateProfileId);
    if (!subscription.cancelAtPeriodEnd) return { data: this.toSubscriptionResponse(subscription) };
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.candidateSubscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false, cancelRequestedAt: null },
        include: { plan: true },
      });
      await tx.subscriptionLifecycleEvent.create({
        data: {
          audience: PlanAudience.CANDIDATE,
          ownerId: candidateProfileId,
          eventType: 'CANCELLATION_REVOKED',
          subscriptionPlanId: value.planId,
          actorType: actor.role,
          actorId: actor.id,
          metadata: { subscriptionId: value.id },
        },
      });
      return value;
    });
    return { data: this.toSubscriptionResponse(updated) };
  }

  async requestRecruiterCancellation(companyId: string, actor: AuthenticatedUser) {
    const subscription = await this.requireRecruiterActiveSubscription(companyId);
    if (subscription.cancelAtPeriodEnd) return { data: this.toSubscriptionResponse(subscription) };
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.companySubscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true, cancelRequestedAt: now },
        include: { plan: true },
      });
      await tx.subscriptionLifecycleEvent.create({
        data: {
          audience: PlanAudience.RECRUITER,
          ownerId: companyId,
          eventType: 'CANCELLATION_REQUESTED',
          subscriptionPlanId: value.planId,
          actorType: actor.role,
          actorId: actor.id,
          metadata: { subscriptionId: value.id, effectiveAt: value.expiredAt.toISOString() },
        },
      });
      return value;
    });
    return { data: this.toSubscriptionResponse(updated) };
  }

  async revokeRecruiterCancellation(companyId: string, actor: AuthenticatedUser) {
    const subscription = await this.requireRecruiterActiveSubscription(companyId);
    if (!subscription.cancelAtPeriodEnd) return { data: this.toSubscriptionResponse(subscription) };
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.companySubscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false, cancelRequestedAt: null },
        include: { plan: true },
      });
      await tx.subscriptionLifecycleEvent.create({
        data: {
          audience: PlanAudience.RECRUITER,
          ownerId: companyId,
          eventType: 'CANCELLATION_REVOKED',
          subscriptionPlanId: value.planId,
          actorType: actor.role,
          actorId: actor.id,
          metadata: { subscriptionId: value.id },
        },
      });
      return value;
    });
    return { data: this.toSubscriptionResponse(updated) };
  }

  /**
   * Người thua cuộc đua kích hoạt nhận `P2002` từ partial unique index. Đó không
   * phải sự cố — một request khác vừa kích hoạt xong cho đúng chủ sở hữu này —
   * nên nó phải là 409 kèm mã đọc được, không phải 500.
   *
   * Không tự chữa bằng cách đọc lại: transaction đã bị Postgres hủy tại thời điểm
   * unique violation, nên mọi truy vấn tiếp theo trên `tx` đó đều lỗi.
   */
  private readonly rethrowActivationRace = (error: unknown): never => {
    if (isActiveSubscriptionRace(error)) throw activeSubscriptionRaceError();
    throw error;
  };

  private assertSandboxEnabled() {
    if (
      this.config.get('appEnv') === 'production' ||
      !this.config.get('subscriptionSandboxCheckoutEnabled')
    ) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_SANDBOX_DISABLED',
        message: 'Tính năng nâng cấp gói đang được chuẩn bị. Vui lòng thử lại sau.',
      });
    }
  }

  private async requireCandidateActiveSubscription(candidateProfileId: string) {
    const subscription = await this.prisma.candidateSubscription.findFirst({
      where: {
        candidateProfileId,
        status: SubscriptionStatus.ACTIVE,
        expiredAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_SUBSCRIPTION',
        message: 'Bạn chưa có gói đang hiệu lực.',
      });
    }
    return subscription;
  }

  private async requireRecruiterActiveSubscription(companyId: string) {
    const subscription = await this.prisma.companySubscription.findFirst({
      where: {
        companyId,
        status: SubscriptionStatus.ACTIVE,
        expiredAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_SUBSCRIPTION',
        message: 'Công ty chưa có gói đang hiệu lực.',
      });
    }
    return subscription;
  }

  private toSubscriptionResponse(
    subscription: {
      id: string;
      startedAt: Date;
      expiredAt: Date;
      cancelAtPeriodEnd: boolean;
      cancelRequestedAt: Date | null;
      source: string;
      plan: { code: string | null; subscriptionName: string };
    },
    checkoutId?: string,
  ) {
    return {
      subscriptionId: subscription.id,
      checkoutId,
      plan: { code: subscription.plan.code, name: subscription.plan.subscriptionName },
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiredAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelRequestedAt: subscription.cancelRequestedAt,
      source: subscription.source,
    };
  }
}
