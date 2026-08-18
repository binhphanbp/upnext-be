import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, SubscriptionFeature, SubscriptionUsageDirection } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateSubscriptionQuotaService } from './candidate-subscription-quota.service';

const asTx = (mock: unknown) => mock as Prisma.TransactionClient;
const PERIOD_START = new Date('2026-08-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-08-31T00:00:00.000Z');

const activeSubscription = {
  id: 'candidate-subscription-1',
  planId: 'candidate-free',
  candidateProfileId: 'candidate-profile-1',
  startedAt: PERIOD_START,
  expiredAt: PERIOD_END,
  currentPeriodStart: PERIOD_START,
  currentPeriodEnd: PERIOD_END,
};

const consumeInput = {
  candidateProfileId: 'candidate-profile-1',
  feature: SubscriptionFeature.AI_COPILOT_RUN,
  referenceType: 'AI_COPILOT_RUN',
  referenceId: '11111111-1111-1111-1111-111111111111',
  idempotencyKey: 'copilot-run:candidate-profile-1:request-1',
};

function buildMockPrisma() {
  return {
    candidateSubscription: {
      findFirst: jest.fn().mockResolvedValue(activeSubscription),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ...activeSubscription, plan: { code: 'CANDIDATE_FREE' } }),
      create: jest.fn(),
    },
    subscriptionPlan: { findFirst: jest.fn() },
    planFeature: {
      findUnique: jest.fn().mockResolvedValue({
        planId: 'candidate-free',
        feature: SubscriptionFeature.AI_COPILOT_RUN,
        enabled: true,
        limitValue: 10,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    candidateSubscriptionQuotaCounter: {
      upsert: jest.fn().mockResolvedValue({
        id: 'candidate-counter-1',
        feature: SubscriptionFeature.AI_COPILOT_RUN,
        limitValue: 10,
        usedValue: 0,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    candidateSubscriptionUsage: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: object }) => ({ id: 'candidate-usage-1', ...data })),
    },
  };
}

describe('CandidateSubscriptionQuotaService', () => {
  let service: CandidateSubscriptionQuotaService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    prisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CandidateSubscriptionQuotaService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CandidateSubscriptionQuotaService);
  });

  it('consumes a candidate Copilot allowance and writes an auditable ledger entry', async () => {
    const result = await service.consume(asTx(prisma), consumeInput);

    expect(result.replayed).toBe(false);
    expect(prisma.candidateSubscriptionQuotaCounter.updateMany).toHaveBeenCalledWith({
      where: { id: 'candidate-counter-1', usedValue: { lte: 9 } },
      data: { usedValue: { increment: 1 } },
    });
    expect(prisma.candidateSubscriptionUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: SubscriptionUsageDirection.CONSUME,
          feature: SubscriptionFeature.AI_COPILOT_RUN,
          idempotencyKey: consumeInput.idempotencyKey,
        }),
      }),
    );
  });

  it('replays an idempotent request without charging quota twice', async () => {
    prisma.candidateSubscriptionUsage.findUnique.mockResolvedValue({ id: 'existing-usage' });

    const result = await service.consume(asTx(prisma), consumeInput);

    expect(result).toEqual({ usage: { id: 'existing-usage' }, replayed: true });
    expect(prisma.candidateSubscriptionQuotaCounter.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent or exhausted finite allowance before writing usage', async () => {
    prisma.candidateSubscriptionQuotaCounter.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.consume(asTx(prisma), consumeInput)).rejects.toThrow(ConflictException);
    expect(prisma.candidateSubscriptionUsage.create).not.toHaveBeenCalled();
  });

  it('rejects features that are absent or disabled in the candidate plan', async () => {
    prisma.planFeature.findUnique.mockResolvedValue({ enabled: false, limitValue: 0 });

    await expect(service.consume(asTx(prisma), consumeInput)).rejects.toThrow(ForbiddenException);
  });

  it('provisions the configured Candidate Free plan on first use', async () => {
    prisma.candidateSubscription.findFirst.mockResolvedValue(null);
    prisma.subscriptionPlan.findFirst.mockResolvedValue({
      id: 'candidate-free',
      code: 'CANDIDATE_FREE',
      durationDays: 30,
      features: [{ feature: SubscriptionFeature.AI_COPILOT_RUN, limitValue: 10 }],
    });
    prisma.candidateSubscription.create.mockResolvedValue({
      ...activeSubscription,
      planId: 'candidate-free',
    });

    await service.consume(asTx(prisma), consumeInput);

    expect(prisma.candidateSubscription.create).toHaveBeenCalled();
    expect(prisma.candidateSubscriptionQuotaCounter.createMany).toHaveBeenCalled();
  });

  it('reverses a failed AI run once and restores only the charged amount', async () => {
    prisma.candidateSubscriptionUsage.findUnique.mockResolvedValue({
      id: 'candidate-usage-1',
      candidateSubscriptionId: activeSubscription.id,
      candidateProfileId: activeSubscription.candidateProfileId,
      feature: SubscriptionFeature.AI_COPILOT_RUN,
      quantity: 2,
      direction: SubscriptionUsageDirection.CONSUME,
      referenceType: 'AI_COPILOT_RUN',
      referenceId: consumeInput.referenceId,
      idempotencyKey: consumeInput.idempotencyKey,
      createdAt: PERIOD_START,
      reversal: null,
    });
    prisma.candidateSubscriptionQuotaCounter.findFirst.mockResolvedValue({
      id: 'candidate-counter-1',
      usedValue: 1,
    });

    await service.reverse(asTx(prisma), 'candidate-usage-1', 'provider-failed');

    expect(prisma.candidateSubscriptionQuotaCounter.update).toHaveBeenCalledWith({
      where: { id: 'candidate-counter-1' },
      data: { usedValue: { decrement: 1 } },
    });
    expect(prisma.candidateSubscriptionUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: SubscriptionUsageDirection.REVERSAL,
          reversedUsageId: 'candidate-usage-1',
        }),
      }),
    );
  });
});
