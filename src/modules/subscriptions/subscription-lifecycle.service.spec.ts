import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  PlanAudience,
  SubscriptionCheckoutStatus,
  SubscriptionFeature,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateSandboxCheckoutDto } from './dto/candidate-sandbox-checkout.dto';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

const actor = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'candidate@example.test',
  role: ActorType.CANDIDATE,
  permissions: [],
};

const dto: CandidateSandboxCheckoutDto = {
  planId: '22222222-2222-2222-2222-222222222222',
  idempotencyKey: 'candidate-upgrade-0001',
};

const publicPlan = {
  id: dto.planId,
  code: 'CANDIDATE_PRO',
  subscriptionName: 'Candidate Pro',
  audience: PlanAudience.CANDIDATE,
  price: { toString: () => '99000' },
  durationDays: 30,
  features: [{ feature: SubscriptionFeature.AI_COPILOT_RUN, enabled: true, limitValue: 100 }],
};

function buildPrisma() {
  const tx = {
    subscriptionCheckout: {
      upsert: jest.fn().mockResolvedValue({
        id: 'checkout-1',
        subscriptionPlanId: dto.planId,
        status: SubscriptionCheckoutStatus.PENDING,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'checkout-1' }),
    },
    candidateSubscription: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({
        id: 'candidate-subscription-1',
        startedAt: new Date('2026-08-19T00:00:00.000Z'),
        expiredAt: new Date('2026-09-18T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        cancelRequestedAt: null,
        source: 'SANDBOX_CHECKOUT',
        plan: { code: 'CANDIDATE_PRO', subscriptionName: 'Candidate Pro' },
      }),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    candidateSubscriptionQuotaCounter: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionLifecycleEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn(),
    },
  };
  return {
    subscriptionPlan: { findFirst: jest.fn().mockResolvedValue(publicPlan) },
    candidateSubscription: tx.candidateSubscription,
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    tx,
  };
}

describe('SubscriptionLifecycleService', () => {
  it('keeps sandbox checkout disabled unless rollout explicitly enables it', async () => {
    const prisma = buildPrisma();
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(false) } as unknown as ConfigService,
    );

    await expect(service.candidateSandboxCheckout('profile-1', actor, dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.subscriptionPlan.findFirst).not.toHaveBeenCalled();
  });

  it('activates exactly one candidate plan, materializes allowance, and records evidence', async () => {
    const prisma = buildPrisma();
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );

    const result = await service.candidateSandboxCheckout('profile-1', actor, dto);

    expect(result.replayed).toBe(false);
    expect(prisma.tx.candidateSubscription.updateMany).toHaveBeenCalledWith({
      where: { candidateProfileId: 'profile-1', status: SubscriptionStatus.ACTIVE },
      data: { status: SubscriptionStatus.INACTIVE },
    });
    expect(prisma.tx.candidateSubscriptionQuotaCounter.createMany).toHaveBeenCalled();
    expect(prisma.tx.subscriptionCheckout.update).toHaveBeenCalledWith({
      where: { id: 'checkout-1' },
      data: { subscriptionId: 'candidate-subscription-1' },
    });
    expect(prisma.tx.subscriptionLifecycleEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ eventType: 'CHECKOUT_COMPLETED' }),
        ]),
      }),
    );
  });

  it('replays the subscription linked to the original checkout, not a newer active plan', async () => {
    const prisma = buildPrisma();
    prisma.tx.subscriptionCheckout.upsert.mockResolvedValue({
      id: 'checkout-1',
      subscriptionPlanId: dto.planId,
      subscriptionId: 'original-subscription',
      status: SubscriptionCheckoutStatus.COMPLETED,
    });
    prisma.tx.subscriptionCheckout.updateMany.mockResolvedValue({ count: 0 });
    prisma.tx.candidateSubscription.findFirst.mockResolvedValue({
      id: 'original-subscription',
      startedAt: new Date('2026-08-19T00:00:00.000Z'),
      expiredAt: new Date('2026-09-18T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
      source: 'SANDBOX_CHECKOUT',
      plan: { code: 'CANDIDATE_PRO', subscriptionName: 'Candidate Pro' },
    });
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );

    const result = await service.candidateSandboxCheckout('profile-1', actor, dto);

    expect(result.replayed).toBe(true);
    expect(prisma.tx.candidateSubscription.findFirst).toHaveBeenCalledWith({
      where: { id: 'original-subscription', candidateProfileId: 'profile-1' },
      include: { plan: true },
    });
    expect(prisma.tx.candidateSubscription.create).not.toHaveBeenCalled();
  });

  it('does not offer private, inactive, free, or recruiter plans as a candidate checkout', async () => {
    const prisma = buildPrisma();
    prisma.subscriptionPlan.findFirst.mockResolvedValue(null);
    const service = new SubscriptionLifecycleService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
    );

    await expect(service.candidateSandboxCheckout('profile-1', actor, dto)).rejects.toThrow(
      NotFoundException,
    );
  });
});
