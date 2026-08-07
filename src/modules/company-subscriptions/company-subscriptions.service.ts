import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscribeCompanyDto } from './dto/subscribe-company.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ActorType, Prisma, SubscriptionStatus } from '@prisma/client';

@Injectable()
export class CompanySubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(
    user: AuthenticatedUser,
    dto: SubscribeCompanyDto,
    transaction?: Prisma.TransactionClient,
  ) {
    let targetCompanyId: string;

    if (user.role === ActorType.ADMIN) {
      if (!dto.companyId) {
        throw new BadRequestException('companyId is required for admin');
      }
      targetCompanyId = dto.companyId;
    } else if (user.role === ActorType.RECRUITER) {
      if (!user.companyId) {
        throw new ForbiddenException('You are not associated with any company');
      }
      targetCompanyId = user.companyId;
    } else {
      throw new ForbiddenException('Only admins and recruiters can subscribe to plans');
    }

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

    return transaction ? activate(transaction) : this.prisma.$transaction(activate);
  }

  async getActiveSubscription(companyId: string) {
    const activeSub = await this.prisma.companySubscription.findFirst({
      where: {
        companyId: companyId,
        status: SubscriptionStatus.ACTIVE,
        expiredAt: { gt: new Date() },
      },
      include: { plan: true },
    });

    if (!activeSub) {
      throw new NotFoundException('No active subscription found for this company');
    }

    return activeSub;
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
