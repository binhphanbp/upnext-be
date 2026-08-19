import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  PlanAudience,
  Prisma,
  SubscriptionFeature,
  SubscriptionStatus,
  SubscriptionUsageDirection,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type CandidateQuotaConsumeInput = {
  candidateProfileId: string;
  feature: SubscriptionFeature;
  quantity?: number;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
};

export type CandidateQuotaSnapshot = {
  feature: SubscriptionFeature;
  enabled: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  periodStart: Date;
  periodEnd: Date;
};

type PrismaClientLike = Prisma.TransactionClient | PrismaService;

/**
 * Candidate-facing quota engine. It intentionally mirrors the recruiter
 * engine's transactional properties while keeping ownership and audit rows
 * isolated. A caller must invoke consume/reverse in the same transaction as
 * the metered action.
 */
@Injectable()
export class CandidateSubscriptionQuotaService {
  private readonly logger = new Logger(CandidateSubscriptionQuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserve one candidate entitlement outside a wider database transaction.
   *
   * AI calls are necessarily asynchronous and must never keep a database
   * transaction open while a provider streams. This small wrapper preserves
   * the atomic counter + ledger write, while callers can compensate with
   * `reverseUsage` if the external operation fails before delivering a result.
   */
  async reserve(input: CandidateQuotaConsumeInput) {
    return this.prisma.$transaction((tx) => this.consume(tx, input));
  }

  /** Reverse a reservation made by `reserve`, exactly once. */
  async reverseUsage(usageId: string, reason: string) {
    return this.prisma.$transaction((tx) => this.reverse(tx, usageId, reason));
  }

  async consume(tx: Prisma.TransactionClient, input: CandidateQuotaConsumeInput) {
    const quantity = input.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new ConflictException({
        code: 'INVALID_QUOTA_QUANTITY',
        message: 'Quota quantity must be a positive integer',
      });
    }

    const replay = await tx.candidateSubscriptionUsage.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (replay) return { usage: replay, replayed: true as const };

    const subscription = await this.resolveActiveSubscription(tx, input.candidateProfileId);
    const counter = await this.getOrCreateCounter(tx, subscription, input.feature);

    if (counter.limitValue !== null) {
      const consumed = await tx.candidateSubscriptionQuotaCounter.updateMany({
        where: { id: counter.id, usedValue: { lte: counter.limitValue - quantity } },
        data: { usedValue: { increment: quantity } },
      });
      if (!consumed.count) {
        throw new ConflictException({
          code: 'QUOTA_EXHAUSTED',
          message: 'Bạn đã dùng hết lượt của tính năng này trong chu kỳ hiện tại.',
          feature: input.feature,
          limit: counter.limitValue,
          used: counter.usedValue,
        });
      }
    } else {
      await tx.candidateSubscriptionQuotaCounter.update({
        where: { id: counter.id },
        data: { usedValue: { increment: quantity } },
      });
    }

    const usage = await tx.candidateSubscriptionUsage.create({
      data: {
        candidateSubscriptionId: subscription.id,
        candidateProfileId: input.candidateProfileId,
        feature: input.feature,
        quantity,
        direction: SubscriptionUsageDirection.CONSUME,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { usage, replayed: false as const };
  }

  async reverse(tx: Prisma.TransactionClient, usageId: string, reason: string) {
    const original = await tx.candidateSubscriptionUsage.findUnique({
      where: { id: usageId },
      include: { reversal: true },
    });
    if (!original) {
      throw new ConflictException({
        code: 'USAGE_NOT_FOUND',
        message: 'Usage entry was not found',
      });
    }
    if (original.reversal) return original.reversal;
    if (original.direction !== SubscriptionUsageDirection.CONSUME) {
      throw new ConflictException({
        code: 'USAGE_NOT_REVERSIBLE',
        message: 'Only consume usage can be reversed',
      });
    }

    const counter = await tx.candidateSubscriptionQuotaCounter.findFirst({
      where: {
        candidateSubscriptionId: original.candidateSubscriptionId,
        feature: original.feature,
        periodStart: { lte: original.createdAt },
        periodEnd: { gt: original.createdAt },
      },
    });
    if (counter) {
      await tx.candidateSubscriptionQuotaCounter.update({
        where: { id: counter.id },
        data: { usedValue: { decrement: Math.min(counter.usedValue, original.quantity) } },
      });
    } else {
      this.logger.warn(`Reversing candidate usage ${usageId} without a quota counter`);
    }

    return tx.candidateSubscriptionUsage.create({
      data: {
        candidateSubscriptionId: original.candidateSubscriptionId,
        candidateProfileId: original.candidateProfileId,
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

  async peek(candidateProfileId: string): Promise<CandidateQuotaSnapshot[]> {
    const subscription = await this.resolveActiveSubscription(this.prisma, candidateProfileId);
    const { periodStart, periodEnd } = this.resolvePeriod(subscription);
    const [planFeatures, counters] = await Promise.all([
      this.prisma.planFeature.findMany({ where: { planId: subscription.planId } }),
      this.prisma.candidateSubscriptionQuotaCounter.findMany({
        where: { candidateSubscriptionId: subscription.id, periodStart },
      }),
    ]);
    const used = new Map(counters.map((counter) => [counter.feature, counter.usedValue]));
    return planFeatures.map((feature) => {
      const consumed = used.get(feature.feature) ?? 0;
      return {
        feature: feature.feature,
        enabled: feature.enabled,
        limit: feature.limitValue,
        used: consumed,
        remaining: feature.limitValue === null ? null : Math.max(0, feature.limitValue - consumed),
        periodStart,
        periodEnd,
      };
    });
  }

  async activePlan(candidateProfileId: string) {
    const subscription = await this.resolveActiveSubscription(this.prisma, candidateProfileId);
    return this.prisma.candidateSubscription.findUniqueOrThrow({
      where: { id: subscription.id },
      include: { plan: true },
    });
  }

  private async provisionFreeSubscription(client: PrismaClientLike, candidateProfileId: string) {
    const plan = await client.subscriptionPlan.findFirst({
      where: {
        audience: PlanAudience.CANDIDATE,
        status: SubscriptionStatus.ACTIVE,
        price: 0,
      },
      orderBy: { sortOrder: 'asc' },
      include: { features: true },
    });
    if (!plan) {
      throw new ForbiddenException({
        code: 'NO_ACTIVE_SUBSCRIPTION',
        message: 'Chưa có gói miễn phí đang hoạt động cho ứng viên.',
      });
    }

    const startedAt = new Date();
    const expiredAt = new Date(startedAt.getTime() + plan.durationDays * 86_400_000);
    const subscription = await client.candidateSubscription.create({
      data: {
        planId: plan.id,
        candidateProfileId,
        startedAt,
        expiredAt,
        currentPeriodStart: startedAt,
        currentPeriodEnd: expiredAt,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    if (plan.features.length) {
      await client.candidateSubscriptionQuotaCounter.createMany({
        data: plan.features.map((feature) => ({
          candidateSubscriptionId: subscription.id,
          feature: feature.feature,
          limitValue: feature.limitValue,
          periodStart: startedAt,
          periodEnd: expiredAt,
        })),
      });
    }
    this.logger.log(`Auto-provisioned ${plan.code ?? plan.id} for candidate ${candidateProfileId}`);
    return subscription;
  }

  private async resolveActiveSubscription(client: PrismaClientLike, candidateProfileId: string) {
    const subscription = await client.candidateSubscription.findFirst({
      where: {
        candidateProfileId,
        status: SubscriptionStatus.ACTIVE,
        expiredAt: { gt: new Date() },
      },
      orderBy: { startedAt: 'desc' },
    });
    return subscription ?? this.provisionFreeSubscription(client, candidateProfileId);
  }

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
    if (!planFeature?.enabled || (planFeature.limitValue !== null && planFeature.limitValue <= 0)) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_IN_PLAN',
        message: 'Tính năng này chưa có trong gói của bạn.',
        feature,
      });
    }
    return tx.candidateSubscriptionQuotaCounter.upsert({
      where: {
        candidateSubscriptionId_feature_periodStart: {
          candidateSubscriptionId: subscription.id,
          feature,
          periodStart,
        },
      },
      update: { limitValue: planFeature.limitValue },
      create: {
        candidateSubscriptionId: subscription.id,
        feature,
        limitValue: planFeature.limitValue,
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
