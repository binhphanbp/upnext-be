import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, SubscriptionFeature, SubscriptionUsageDirection } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from './subscription-quota.service';

/** The mock stands in for a transaction client; only the models used are present. */
const asTx = (mock: unknown) => mock as Prisma.TransactionClient;

const NOW = new Date('2026-07-31T00:00:00.000Z');
const PERIOD_END = new Date('2026-08-30T00:00:00.000Z');

const activeSubscription = {
  id: 'sub-1',
  planId: 'plan-1',
  companyId: 'company-1',
  startedAt: NOW,
  expiredAt: PERIOD_END,
  currentPeriodStart: NOW,
  currentPeriodEnd: PERIOD_END,
};

function buildMockPrisma() {
  const mock = {
    companySubscription: {
      findFirst: jest.fn().mockResolvedValue(activeSubscription),
      create: jest.fn(),
    },
    subscriptionPlan: { findFirst: jest.fn() },
    planFeature: {
      findUnique: jest.fn().mockResolvedValue({
        planId: 'plan-1',
        feature: SubscriptionFeature.JOB_POST,
        enabled: true,
        limitValue: 3,
      }),
      findMany: jest.fn(),
    },
    subscriptionQuotaCounter: {
      upsert: jest.fn().mockResolvedValue({
        id: 'counter-1',
        feature: SubscriptionFeature.JOB_POST,
        limitValue: 3,
        usedValue: 0,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    subscriptionUsage: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => Promise.resolve({ id: 'usage-1', ...data })),
    },
  };
  return mock;
}

const consumeInput = {
  companyId: 'company-1',
  feature: SubscriptionFeature.JOB_POST,
  referenceType: 'JOB_POST',
  referenceId: '11111111-1111-1111-1111-111111111111',
  idempotencyKey: 'job-post:company-1:req-1',
};

describe('SubscriptionQuotaService', () => {
  let service: SubscriptionQuotaService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    prisma = buildMockPrisma();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [SubscriptionQuotaService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SubscriptionQuotaService);
  });

  describe('consume', () => {
    it('consumes quota and writes a CONSUME ledger entry', async () => {
      const result = await service.consume(asTx(prisma), consumeInput);

      expect(result.replayed).toBe(false);
      expect(prisma.subscriptionQuotaCounter.updateMany).toHaveBeenCalledWith({
        where: { id: 'counter-1', usedValue: { lte: 2 } },
        data: { usedValue: { increment: 1 } },
      });
      expect(prisma.subscriptionUsage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            feature: SubscriptionFeature.JOB_POST,
            quantity: 1,
            direction: SubscriptionUsageDirection.CONSUME,
            idempotencyKey: consumeInput.idempotencyKey,
          }),
        }),
      );
    });

    it('scales the guard predicate with quantity so a batch cannot overshoot', async () => {
      await service.consume(asTx(prisma), { ...consumeInput, quantity: 3 });

      // limit 3, quantity 3 -> only allowed when nothing used yet
      expect(prisma.subscriptionQuotaCounter.updateMany).toHaveBeenCalledWith({
        where: { id: 'counter-1', usedValue: { lte: 0 } },
        data: { usedValue: { increment: 3 } },
      });
    });

    it('replays without consuming when the idempotency key was already used', async () => {
      prisma.subscriptionUsage.findUnique.mockResolvedValue({ id: 'usage-existing' });

      const result = await service.consume(asTx(prisma), consumeInput);

      expect(result.replayed).toBe(true);
      expect(result.usage).toEqual({ id: 'usage-existing' });
      expect(prisma.subscriptionQuotaCounter.updateMany).not.toHaveBeenCalled();
      expect(prisma.subscriptionUsage.create).not.toHaveBeenCalled();
    });

    it('throws QUOTA_EXHAUSTED when the conditional update matches no row', async () => {
      // count: 0 is exactly how Postgres reports "predicate failed", i.e. the
      // allowance was taken by a concurrent transaction or is already spent.
      prisma.subscriptionQuotaCounter.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.consume(asTx(prisma), consumeInput)).rejects.toThrow(ConflictException);
      expect(prisma.subscriptionUsage.create).not.toHaveBeenCalled();
    });

    it('does not gate an unlimited feature but still counts it', async () => {
      prisma.planFeature.findUnique.mockResolvedValue({
        planId: 'plan-1',
        feature: SubscriptionFeature.JOB_POST,
        enabled: true,
        limitValue: null,
      });
      prisma.subscriptionQuotaCounter.upsert.mockResolvedValue({
        id: 'counter-1',
        feature: SubscriptionFeature.JOB_POST,
        limitValue: null,
        usedValue: 999,
      });

      await service.consume(asTx(prisma), consumeInput);

      expect(prisma.subscriptionQuotaCounter.updateMany).not.toHaveBeenCalled();
      expect(prisma.subscriptionQuotaCounter.update).toHaveBeenCalledWith({
        where: { id: 'counter-1' },
        data: { usedValue: { increment: 1 } },
      });
      expect(prisma.subscriptionUsage.create).toHaveBeenCalled();
    });

    it('rejects a feature the plan does not include', async () => {
      prisma.planFeature.findUnique.mockResolvedValue({ enabled: false, limitValue: 0 });

      await expect(service.consume(asTx(prisma), consumeInput)).rejects.toThrow(ForbiddenException);
    });

    it('auto-provisions the free plan when the company never subscribed', async () => {
      // Every company is implicitly on the free tier, so a missing subscription
      // must not lock it out of features the free plan includes.
      prisma.companySubscription.findFirst.mockResolvedValue(null);
      prisma.subscriptionPlan.findFirst.mockResolvedValue({
        id: 'free-plan',
        code: 'RECRUITER_BASIC',
        price: 0,
        durationDays: 30,
        jobPostLimit: 0,
        boostCreditLimit: 0,
        talentContactLimit: 0,
        features: [{ feature: SubscriptionFeature.AI_JD_GENERATE, limitValue: 5 }],
      });
      prisma.companySubscription.create.mockResolvedValue({
        ...activeSubscription,
        id: 'sub-free',
        planId: 'free-plan',
      });

      await service.consume(asTx(prisma), consumeInput);

      expect(prisma.companySubscription.create).toHaveBeenCalled();
      expect(prisma.subscriptionQuotaCounter.createMany).toHaveBeenCalled();
      expect(prisma.subscriptionUsage.create).toHaveBeenCalled();
    });

    it('rejects only when no free plan is configured at all', async () => {
      prisma.companySubscription.findFirst.mockResolvedValue(null);
      prisma.subscriptionPlan.findFirst.mockResolvedValue(null);

      await expect(service.consume(asTx(prisma), consumeInput)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a non-positive quantity before touching any counter', async () => {
      await expect(service.consume(asTx(prisma), { ...consumeInput, quantity: 0 })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.subscriptionQuotaCounter.upsert).not.toHaveBeenCalled();
    });
  });

  describe('reverse', () => {
    const original = {
      id: 'usage-1',
      companySubscriptionId: 'sub-1',
      companyId: 'company-1',
      feature: SubscriptionFeature.JOB_POST,
      quantity: 2,
      direction: SubscriptionUsageDirection.CONSUME,
      referenceType: 'JOB_POST',
      referenceId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: 'job-post:company-1:req-1',
      createdAt: NOW,
      reversal: null,
    };

    it('gives the quota back and records a REVERSAL entry', async () => {
      prisma.subscriptionUsage.findUnique.mockResolvedValue(original);
      prisma.subscriptionQuotaCounter.findFirst.mockResolvedValue({
        id: 'counter-1',
        usedValue: 5,
      });

      await service.reverse(asTx(prisma), 'usage-1', 'job-deleted');

      expect(prisma.subscriptionQuotaCounter.update).toHaveBeenCalledWith({
        where: { id: 'counter-1' },
        data: { usedValue: { decrement: 2 } },
      });
      expect(prisma.subscriptionUsage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: SubscriptionUsageDirection.REVERSAL,
            reversedUsageId: 'usage-1',
          }),
        }),
      );
    });

    it('never decrements below zero', async () => {
      prisma.subscriptionUsage.findUnique.mockResolvedValue(original);
      prisma.subscriptionQuotaCounter.findFirst.mockResolvedValue({
        id: 'counter-1',
        usedValue: 1,
      });

      await service.reverse(asTx(prisma), 'usage-1', 'job-deleted');

      expect(prisma.subscriptionQuotaCounter.update).toHaveBeenCalledWith({
        where: { id: 'counter-1' },
        data: { usedValue: { decrement: 1 } },
      });
    });

    it('is idempotent: an already-reversed entry returns the existing reversal', async () => {
      prisma.subscriptionUsage.findUnique.mockResolvedValue({
        ...original,
        reversal: { id: 'usage-reversal' },
      });

      const result = await service.reverse(asTx(prisma), 'usage-1', 'job-deleted');

      expect(result).toEqual({ id: 'usage-reversal' });
      expect(prisma.subscriptionQuotaCounter.update).not.toHaveBeenCalled();
      expect(prisma.subscriptionUsage.create).not.toHaveBeenCalled();
    });
  });

  describe('peek', () => {
    it('reports used/remaining per feature, treating a missing counter as unused', async () => {
      prisma.planFeature.findMany.mockResolvedValue([
        { feature: SubscriptionFeature.JOB_POST, enabled: true, limitValue: 10 },
        { feature: SubscriptionFeature.AI_CV_MATCHING, enabled: true, limitValue: null },
        { feature: SubscriptionFeature.URGENT_LABEL, enabled: false, limitValue: 0 },
      ]);
      prisma.subscriptionQuotaCounter.findMany.mockResolvedValue([
        { feature: SubscriptionFeature.JOB_POST, usedValue: 4 },
      ]);

      const snapshot = await service.peek('company-1');

      expect(snapshot).toEqual([
        expect.objectContaining({ feature: SubscriptionFeature.JOB_POST, used: 4, remaining: 6 }),
        // unlimited -> remaining stays null rather than pretending to be a number
        expect.objectContaining({
          feature: SubscriptionFeature.AI_CV_MATCHING,
          used: 0,
          remaining: null,
        }),
        expect.objectContaining({
          feature: SubscriptionFeature.URGENT_LABEL,
          enabled: false,
          remaining: 0,
        }),
      ]);
    });
  });

  describe('assertFeatureEnabled', () => {
    it('passes when the plan includes the feature with an allowance', async () => {
      await expect(
        service.assertFeatureEnabled('company-1', SubscriptionFeature.JOB_POST),
      ).resolves.toBeUndefined();
    });

    it('blocks a disabled feature', async () => {
      prisma.planFeature.findUnique.mockResolvedValue({ enabled: false, limitValue: 5 });

      await expect(
        service.assertFeatureEnabled('company-1', SubscriptionFeature.CV_POOL_VIEW),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks a feature that is enabled but has a zero allowance', async () => {
      prisma.planFeature.findUnique.mockResolvedValue({ enabled: true, limitValue: 0 });

      await expect(
        service.assertFeatureEnabled('company-1', SubscriptionFeature.CV_POOL_VIEW),
      ).rejects.toThrow(ForbiddenException);
    });

    it('has no side effects -- a guard must not spend quota', async () => {
      await service.assertFeatureEnabled('company-1', SubscriptionFeature.JOB_POST);

      expect(prisma.subscriptionQuotaCounter.upsert).not.toHaveBeenCalled();
      expect(prisma.subscriptionQuotaCounter.updateMany).not.toHaveBeenCalled();
      expect(prisma.subscriptionUsage.create).not.toHaveBeenCalled();
    });
  });
});
