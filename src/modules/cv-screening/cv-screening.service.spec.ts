import { CvScreeningRunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { CvScreeningService } from './cv-screening.service';
import { GeminiScoringService } from './gemini-scoring.service';

describe('CvScreeningService quota settlement', () => {
  const tx = {
    cvScreeningRun: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    applicationAiScore: { count: jest.fn() },
    subscriptionUsage: { findUnique: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const quota = { reverse: jest.fn(), consume: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<void>) =>
      callback(tx),
    );
  });

  it('reverses the reservation then charges only persisted scores for a partial run', async () => {
    tx.cvScreeningRun.findFirst.mockResolvedValue({
      id: 'run-1',
      companyId: 'company-1',
      recruiterAccountId: 'recruiter-1',
      totalApplications: 5,
    });
    tx.applicationAiScore.count.mockResolvedValue(2);
    tx.subscriptionUsage.findUnique.mockResolvedValue({ id: 'reservation-1' });
    tx.cvScreeningRun.updateMany.mockResolvedValue({ count: 1 });
    quota.reverse.mockResolvedValue(undefined);
    quota.consume.mockResolvedValue(undefined);
    const service = new CvScreeningService(
      prisma as unknown as PrismaService,
      {} as GeminiScoringService,
      quota as unknown as SubscriptionQuotaService,
    );

    await service.finishClaimedRun('run-1', 'worker-1', CvScreeningRunStatus.COMPLETED);

    expect(quota.reverse).toHaveBeenCalledWith(tx, 'reservation-1', 'cv-screening-partial_failed');
    expect(quota.consume).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        quantity: 2,
        idempotencyKey: 'cv-screening:run-1:settled:2',
      }),
    );
    expect(tx.cvScreeningRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CvScreeningRunStatus.PARTIAL_FAILED,
          processedCount: 5,
          failedCount: 3,
        }),
      }),
    );
  });
});
