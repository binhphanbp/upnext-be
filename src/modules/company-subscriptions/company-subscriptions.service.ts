import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscribeCompanyDto } from './dto/subscribe-company.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ActorType, PlanAudience, Prisma, SubscriptionStatus } from '@prisma/client';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import {
  activeSubscriptionRaceError,
  isActiveSubscriptionRace,
} from '../subscriptions/active-subscription-race';

@Injectable()
export class CompanySubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: SubscriptionQuotaService,
  ) {}

  async subscribe(
    user: AuthenticatedUser,
    dto: SubscribeCompanyDto,
    transaction?: Prisma.TransactionClient,
  ) {
    if (user.role !== ActorType.ADMIN) {
      throw new ForbiddenException('Only administrators can grant a subscription manually');
    }
    if (!dto.companyId) {
      throw new BadRequestException('companyId is required for admin');
    }
    const targetCompanyId = dto.companyId;

    const client = transaction ?? this.prisma;
    const company = await client.company.findUnique({ where: { id: targetCompanyId } });
    if (!company) throw new NotFoundException('Company not found');

    const plan = await client.subscriptionPlan.findUnique({
      where: { id: dto.planId },
      include: { features: true },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (plan.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException('This subscription plan is not active');
    }
    if (plan.audience !== PlanAudience.RECRUITER) {
      throw new BadRequestException('This plan is not available for recruiters');
    }

    const now = new Date();
    const expiredAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    const activate = async (tx: Prisma.TransactionClient) => {
      await tx.companySubscription.updateMany({
        where: {
          companyId: targetCompanyId,
          status: SubscriptionStatus.ACTIVE,
        },
        data: {
          status: SubscriptionStatus.INACTIVE,
        },
      });

      const subscription = await tx.companySubscription.create({
        data: {
          planId: plan.id,
          companyId: targetCompanyId,
          jobPostLimit: plan.jobPostLimit,
          boostCreditTotal: plan.boostCreditLimit,
          talentContactLimit: plan.talentContactLimit,
          startedAt: now,
          expiredAt: expiredAt,
          currentPeriodStart: now,
          currentPeriodEnd: expiredAt,
          source: 'ADMIN_GRANT',
          planSnapshot: {
            code: plan.code,
            name: plan.subscriptionName,
            audience: plan.audience,
            price: plan.price.toString(),
            currency: 'VND',
            durationDays: plan.durationDays,
          },
          status: SubscriptionStatus.ACTIVE,
        },
        include: {
          plan: true,
        },
      });

      // Materialise the quota window up front so the first metered action does
      // not have to race to create counters. SubscriptionQuotaService can still
      // create them lazily for periods that roll over later.
      if (plan.features.length > 0) {
        await tx.subscriptionQuotaCounter.createMany({
          data: plan.features.map((feature) => ({
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

      return subscription;
    };

    // Admin grant cũng đụng cùng partial unique index nếu có hai lần gán đồng thời.
    // Khi caller đưa transaction của họ vào thì để lỗi propagate -- transaction đó
    // đã bị Postgres hủy, và chủ của nó mới biết cách xử lý.
    if (transaction) return activate(transaction);
    return this.prisma.$transaction(activate).catch((error: unknown) => {
      if (isActiveSubscriptionRace(error)) throw activeSubscriptionRaceError();
      throw error;
    });
  }

  async getActiveSubscription(companyId: string) {
    return this.quota.getActiveSubscription(companyId);
  }

  async getHistory(user: AuthenticatedUser) {
    if (user.role === ActorType.ADMIN) {
      return this.prisma.companySubscription.findMany({
        include: { company: true, plan: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!user.companyId) throw new ForbiddenException('Not associated with a company');
    return this.prisma.companySubscription.findMany({
      where: { companyId: user.companyId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
