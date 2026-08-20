import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  PlanAudience,
  Prisma,
  SubscriptionStatus,
  SubscriptionUsageDirection,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { activeSubscriptionRaceError, isActiveSubscriptionRace } from './active-subscription-race';
import { SubscriptionFeature } from './feature-registry';

export type QuotaConsumeInput = {
  companyId: string;
  feature: SubscriptionFeature;
  /** Units to consume. Defaults to 1. */
  quantity?: number;
  referenceType: string;
  /** Must be a UUID -- the row this consumption is attributable to. */
  referenceId: string;
  /**
   * Stable key for the caller's logical operation. Replaying the same key never
   * consumes twice, so a retried request is safe.
   */
  idempotencyKey: string;
  createdByRecruiterId?: string | null;
};

export type QuotaSnapshot = {
  /** Read straight off `PlanFeature.feature` -- not narrowed to `SubscriptionFeature`
   * because the column is a plain VarChar(60), not a closed enum (D2). */
  feature: string;
  enabled: boolean;
  /** null = unlimited */
  limit: number | null;
  used: number;
  /** null = unlimited */
  remaining: number | null;
  periodStart: Date;
  periodEnd: Date;
};

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

@Injectable()
export class SubscriptionQuotaService {
  private readonly logger = new Logger(SubscriptionQuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the company's currently effective entitlement for read models.
   *
   * This intentionally uses the same reconciliation and free-plan provisioning
   * path as quota enforcement. A recruiter must not see a misleading 404 simply
   * because they have not consumed a metered feature yet or their previous plan
   * expired between page loads.
   */
  async getActiveSubscription(companyId: string) {
    const subscription = await this.resolveActiveSubscription(this.prisma, companyId);

    return this.prisma.companySubscription.findUniqueOrThrow({
      where: { id: subscription.id },
      include: { plan: true },
    });
  }

  /**
   * Cheap pre-check for guards: does the company's active plan expose this
   * feature at all? Deliberately does not touch counters -- it must not have
   * side effects, because a guard runs before the action is known to succeed.
   */
  async assertFeatureEnabled(companyId: string, feature: SubscriptionFeature) {
    const subscription = await this.resolveActiveSubscription(this.prisma, companyId);
    const planFeature = await this.prisma.planFeature.findUnique({
      where: { planId_feature: { planId: subscription.planId, feature } },
    });

    if (!planFeature?.enabled) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_IN_PLAN',
        message: `Your current plan does not include ${feature}`,
        feature,
      });
    }

    if (planFeature.limitValue !== null && planFeature.limitValue <= 0) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_IN_PLAN',
        message: `Your current plan has no allowance for ${feature}`,
        feature,
      });
    }
  }

  /**
   * Consumes quota and writes the usage ledger entry. MUST be called inside the
   * same transaction as the action being metered, so a failed action cannot
   * leave quota spent.
   */
  async consume(tx: Prisma.TransactionClient, input: QuotaConsumeInput) {
    const quantity = input.quantity ?? 1;
    if (quantity <= 0) {
      throw new ConflictException({
        code: 'INVALID_QUOTA_QUANTITY',
        message: 'Quota quantity must be greater than zero',
      });
    }

    // Replay guard: the same logical operation never consumes twice.
    const existing = await tx.subscriptionUsage.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return { usage: existing, replayed: true as const };
    }

    const subscription = await this.resolveActiveSubscription(tx, input.companyId);
    const counter = await this.getOrCreateCounter(tx, subscription, input.feature);

    if (counter.limitValue !== null) {
      // Conditional update is what makes concurrent consumption race-safe:
      // Postgres evaluates the predicate under the row lock it takes to write.
      const consumed = await tx.subscriptionQuotaCounter.updateMany({
        where: { id: counter.id, usedValue: { lte: counter.limitValue - quantity } },
        data: { usedValue: { increment: quantity } },
      });

      if (!consumed.count) {
        throw new ConflictException({
          code: 'QUOTA_EXHAUSTED',
          message: `Quota exhausted for ${input.feature}`,
          feature: input.feature,
          limit: counter.limitValue,
          used: counter.usedValue,
        });
      }
    } else {
      // Unlimited: still counted so usage reporting and AI cost analysis work.
      await tx.subscriptionQuotaCounter.update({
        where: { id: counter.id },
        data: { usedValue: { increment: quantity } },
      });
    }

    const usage = await tx.subscriptionUsage.create({
      data: {
        companySubscriptionId: subscription.id,
        companyId: input.companyId,
        feature: input.feature,
        quantity,
        direction: SubscriptionUsageDirection.CONSUME,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        idempotencyKey: input.idempotencyKey,
        createdByRecruiterId: input.createdByRecruiterId ?? null,
      },
    });

    return { usage, replayed: false as const };
  }

  /**
   * Gives back previously consumed quota, e.g. when a metered action is undone.
   * Uses the existing `reversedUsageId` link so the ledger stays auditable.
   */
  async reverse(tx: Prisma.TransactionClient, usageId: string, reason: string) {
    const original = await tx.subscriptionUsage.findUnique({
      where: { id: usageId },
      include: { reversal: true },
    });

    if (!original) {
      throw new ConflictException({
        code: 'USAGE_NOT_FOUND',
        message: 'Cannot reverse an unknown usage entry',
      });
    }
    if (original.reversal) {
      return original.reversal;
    }
    if (original.direction !== SubscriptionUsageDirection.CONSUME) {
      throw new ConflictException({
        code: 'USAGE_NOT_REVERSIBLE',
        message: 'Only CONSUME entries can be reversed',
      });
    }

    const counter = await tx.subscriptionQuotaCounter.findFirst({
      where: {
        companySubscriptionId: original.companySubscriptionId,
        feature: original.feature,
        periodStart: { lte: original.createdAt },
        periodEnd: { gt: original.createdAt },
      },
    });

    if (counter) {
      await tx.subscriptionQuotaCounter.update({
        where: { id: counter.id },
        data: { usedValue: { decrement: Math.min(original.quantity, counter.usedValue) } },
      });
    } else {
      this.logger.warn(
        `Reversing usage ${usageId} but its quota period no longer exists; ledger updated without counter change`,
      );
    }

    return tx.subscriptionUsage.create({
      data: {
        companySubscriptionId: original.companySubscriptionId,
        companyId: original.companyId,
        feature: original.feature,
        quantity: original.quantity,
        direction: SubscriptionUsageDirection.REVERSAL,
        referenceType: original.referenceType,
        referenceId: original.referenceId,
        idempotencyKey: `reversal:${original.idempotencyKey}:${reason}`.slice(0, 180),
        reversedUsageId: original.id,
      },
    });
  }

  /**
   * Reads a plan allowance without consuming anything.
   *
   * For capacity-style features such as HR seats, the limit is a ceiling on how
   * many things may exist at once -- not a per-period credit. Consuming those
   * through `consume()` would mean removing a member never frees the seat until
   * the cycle rolls over.
   */
  async getFeatureLimit(companyId: string, feature: SubscriptionFeature) {
    const subscription = await this.resolveActiveSubscription(this.prisma, companyId);
    const planFeature = await this.prisma.planFeature.findUnique({
      where: { planId_feature: { planId: subscription.planId, feature } },
    });

    return {
      enabled: planFeature?.enabled ?? false,
      limit: planFeature?.limitValue ?? null,
    };
  }

  /** Everything the UI needs to render "đã dùng / hạn mức" per feature. */
  async peek(companyId: string): Promise<QuotaSnapshot[]> {
    const subscription = await this.resolveActiveSubscription(this.prisma, companyId);
    const { periodStart, periodEnd } = this.resolvePeriod(subscription);

    const [planFeatures, counters] = await Promise.all([
      this.prisma.planFeature.findMany({ where: { planId: subscription.planId } }),
      this.prisma.subscriptionQuotaCounter.findMany({
        where: { companySubscriptionId: subscription.id, periodStart },
      }),
    ]);

    const usedByFeature = new Map(counters.map((counter) => [counter.feature, counter.usedValue]));

    return planFeatures.map((planFeature) => {
      const used = usedByFeature.get(planFeature.feature) ?? 0;
      return {
        feature: planFeature.feature,
        enabled: planFeature.enabled,
        limit: planFeature.limitValue,
        used,
        remaining:
          planFeature.limitValue === null ? null : Math.max(0, planFeature.limitValue - used),
        periodStart,
        periodEnd,
      };
    });
  }

  /**
   * Every company is on a plan: one that never subscribed is implicitly on the
   * free plan, which is auto-provisioned here on first use. Without this a
   * company that never bought anything would be locked out of features the free
   * tier is supposed to include.
   */
  private async provisionFreeSubscription(client: PrismaClientLike, companyId: string) {
    const freePlan = await client.subscriptionPlan.findFirst({
      where: {
        audience: PlanAudience.RECRUITER,
        status: SubscriptionStatus.ACTIVE,
        price: 0,
      },
      orderBy: { sortOrder: 'asc' },
      include: { features: true },
    });

    if (!freePlan) {
      throw new ForbiddenException({
        code: 'NO_ACTIVE_SUBSCRIPTION',
        message: 'An active subscription is required and no free plan is configured',
      });
    }

    const now = new Date();
    const expiredAt = new Date(now.getTime() + freePlan.durationDays * 24 * 60 * 60 * 1000);

    const subscription = await client.companySubscription.create({
      data: {
        planId: freePlan.id,
        companyId,
        jobPostLimit: freePlan.jobPostLimit,
        boostCreditTotal: freePlan.boostCreditLimit,
        talentContactLimit: freePlan.talentContactLimit,
        startedAt: now,
        expiredAt,
        currentPeriodStart: now,
        currentPeriodEnd: expiredAt,
        source: 'FREE_PROVISION',
        status: SubscriptionStatus.ACTIVE,
      },
    });

    if (freePlan.features.length > 0) {
      await client.subscriptionQuotaCounter.createMany({
        data: freePlan.features.map((feature) => ({
          companySubscriptionId: subscription.id,
          feature: feature.feature,
          limitValue: feature.limitValue,
          usedValue: 0,
          periodStart: now,
          periodEnd: expiredAt,
        })),
        skipDuplicates: true,
      });
    }

    this.logger.log(`Auto-provisioned free plan ${freePlan.code ?? freePlan.id} for ${companyId}`);
    return subscription;
  }

  private async resolveActiveSubscription(client: PrismaClientLike, companyId: string) {
    await this.reconcileExpiredSubscriptions(client, companyId);
    const subscription = await client.companySubscription.findFirst({
      where: {
        companyId,
        status: SubscriptionStatus.ACTIVE,
        expiredAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!subscription) {
      return this.provisionFreeOrAdoptWinner(client, companyId);
    }

    return subscription;
  }

  /**
   * Hai request đồng thời cho cùng một công ty đều thấy "chưa có gói" và đều cấp
   * gói Free; partial unique index chặn người thua bằng `P2002`, và nếu không ai
   * xử lý thì khách nhận 500 cho một tình huống hoàn toàn bình thường.
   *
   * Cách chữa phụ thuộc việc đang ở trong transaction hay không, và đây là chỗ
   * duy nhất biết được điều đó:
   *
   * - **Ngoài transaction** (đường đọc: `peek`, `getFeatureLimit`, ...): đọc lại
   *   và dùng bản ghi của người thắng. Người dùng không thấy gì cả — đúng, vì
   *   kết quả cuối cùng giống hệt như khi họ thắng.
   * - **Trong transaction** (`consume`): Postgres đã **hủy** transaction ngay khi
   *   unique violation xảy ra, nên mọi truy vấn tiếp theo trên cùng `tx` đều lỗi.
   *   Không tự chữa được; chỉ đổi thành 409 để client thử lại — lần sau sẽ thấy
   *   bản ghi của người thắng.
   */
  private async provisionFreeOrAdoptWinner(client: PrismaClientLike, companyId: string) {
    try {
      return await this.provisionFreeSubscription(client, companyId);
    } catch (error) {
      if (!isActiveSubscriptionRace(error)) throw error;
      if (client !== this.prisma) throw activeSubscriptionRaceError();

      const winner = await this.prisma.companySubscription.findFirst({
        where: {
          companyId,
          status: SubscriptionStatus.ACTIVE,
          expiredAt: { gt: new Date() },
        },
        orderBy: { startedAt: 'desc' },
      });
      if (winner) return winner;
      throw activeSubscriptionRaceError();
    }
  }

  /**
   * Keep the persisted lifecycle state truthful at the same boundary where
   * entitlement is checked.  Relying only on `expiredAt` in a query makes the
   * UI/history report an old plan as ACTIVE forever; a background job can be
   * added later for reporting, but access must not depend on it.
   */
  private async reconcileExpiredSubscriptions(client: PrismaClientLike, companyId: string) {
    const now = new Date();
    const expired = await client.companySubscription.findMany({
      where: {
        companyId,
        status: SubscriptionStatus.ACTIVE,
        expiredAt: { lte: now },
      },
      select: { id: true, planId: true, cancelAtPeriodEnd: true },
    });

    for (const subscription of expired) {
      const status = subscription.cancelAtPeriodEnd
        ? SubscriptionStatus.CANCELLED
        : SubscriptionStatus.EXPIRED;
      const updated = await client.companySubscription.updateMany({
        where: { id: subscription.id, status: SubscriptionStatus.ACTIVE, expiredAt: { lte: now } },
        data: { status },
      });
      if (!updated.count) continue;

      await client.subscriptionLifecycleEvent.create({
        data: {
          audience: PlanAudience.RECRUITER,
          ownerId: companyId,
          eventType:
            status === SubscriptionStatus.CANCELLED
              ? 'SUBSCRIPTION_CANCELLED'
              : 'SUBSCRIPTION_EXPIRED',
          subscriptionPlanId: subscription.planId,
          metadata: { subscriptionId: subscription.id, effectiveAt: now.toISOString() },
        },
      });
    }
  }

  /**
   * Counters are created lazily per period, so rolling into a new cycle needs no
   * scheduled job -- the first consumption of the cycle creates a fresh row.
   */
  private async getOrCreateCounter(
    tx: Prisma.TransactionClient,
    subscription: {
      id: string;
      planId: string;
      startedAt: Date;
      expiredAt: Date;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
    },
    feature: SubscriptionFeature,
  ) {
    const { periodStart, periodEnd } = this.resolvePeriod(subscription);
    const planFeature = await tx.planFeature.findUnique({
      where: { planId_feature: { planId: subscription.planId, feature } },
    });

    if (!planFeature?.enabled) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_IN_PLAN',
        message: `Your current plan does not include ${feature}`,
        feature,
      });
    }

    return tx.subscriptionQuotaCounter.upsert({
      where: {
        companySubscriptionId_feature_periodStart: {
          companySubscriptionId: subscription.id,
          feature,
          periodStart,
        },
      },
      // Keep the limit in sync if the admin edited the plan mid-period.
      update: { limitValue: planFeature.limitValue },
      create: {
        companySubscriptionId: subscription.id,
        feature,
        limitValue: planFeature.limitValue,
        usedValue: 0,
        periodStart,
        periodEnd,
      },
    });
  }

  private resolvePeriod(subscription: {
    startedAt: Date;
    expiredAt: Date;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  }) {
    return {
      periodStart: subscription.currentPeriodStart ?? subscription.startedAt,
      periodEnd: subscription.currentPeriodEnd ?? subscription.expiredAt,
    };
  }
}
