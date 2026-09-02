import { CvScreeningRunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { CvScreeningService } from './cv-screening.service';
import { EmbeddingService } from './embedding.service';
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
      {} as EmbeddingService,
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

  it('settles a cancelled run as CANCELLED, not PARTIAL_FAILED, once cancelRequestedAt is set', async () => {
    tx.cvScreeningRun.findFirst.mockResolvedValue({
      id: 'run-2',
      companyId: 'company-1',
      recruiterAccountId: 'recruiter-1',
      totalApplications: 5,
      cancelRequestedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    tx.applicationAiScore.count.mockResolvedValue(2);
    tx.subscriptionUsage.findUnique.mockResolvedValue({ id: 'reservation-2' });
    tx.cvScreeningRun.updateMany.mockResolvedValue({ count: 1 });
    quota.reverse.mockResolvedValue(undefined);
    quota.consume.mockResolvedValue(undefined);
    const service = new CvScreeningService(
      prisma as unknown as PrismaService,
      {} as GeminiScoringService,
      quota as unknown as SubscriptionQuotaService,
      {} as EmbeddingService,
    );

    await service.finishClaimedRun('run-2', 'worker-1', CvScreeningRunStatus.CANCELLED);

    expect(tx.cvScreeningRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: CvScreeningRunStatus.CANCELLED }),
      }),
    );
    // Cancelling still keeps whatever was already scored -- only the unscored
    // remainder is refunded, same settlement path as a partial failure.
    expect(quota.consume).toHaveBeenCalledWith(tx, expect.objectContaining({ quantity: 2 }));
  });

  it('reconciles to COMPLETED, not CANCELLED, when the cancel raced the last batch finishing', async () => {
    tx.cvScreeningRun.findFirst.mockResolvedValue({
      id: 'run-3',
      companyId: 'company-1',
      recruiterAccountId: 'recruiter-1',
      totalApplications: 5,
      cancelRequestedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    tx.applicationAiScore.count.mockResolvedValue(5);
    tx.cvScreeningRun.updateMany.mockResolvedValue({ count: 1 });
    const service = new CvScreeningService(
      prisma as unknown as PrismaService,
      {} as GeminiScoringService,
      quota as unknown as SubscriptionQuotaService,
      {} as EmbeddingService,
    );

    await service.finishClaimedRun('run-3', 'worker-1', CvScreeningRunStatus.CANCELLED);

    expect(tx.cvScreeningRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: CvScreeningRunStatus.COMPLETED }),
      }),
    );
    expect(quota.reverse).not.toHaveBeenCalled();
  });
});

describe('CvScreeningService.cancelRun', () => {
  const prisma = {
    $transaction: jest.fn(),
    cvScreeningRun: { updateMany: jest.fn(), findUnique: jest.fn() },
  };
  const quota = { reverse: jest.fn() };
  let service: CvScreeningService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CvScreeningService(
      prisma as unknown as PrismaService,
      {} as GeminiScoringService,
      quota as unknown as SubscriptionQuotaService,
      {} as EmbeddingService,
    );
    // `getAuthorizedRun` -> `resolveRecruiter` + a direct `cvScreeningRun.findUnique`.
    // Only the ownership check matters here, so stub it minimally rather than
    // wiring the full recruiter/company lookup chain.
    jest
      .spyOn(service as unknown as { getAuthorizedRun: () => Promise<unknown> }, 'getAuthorizedRun')
      .mockResolvedValue({ id: 'run-1', companyId: 'company-1' });
  });

  it('cancels a PENDING run outright and refunds the full reservation', async () => {
    const tx = {
      cvScreeningRun: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      subscriptionUsage: { findUnique: jest.fn().mockResolvedValue({ id: 'reservation-1' }) },
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    const result = await service.cancelRun('recruiter-1', 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: CvScreeningRunStatus.CANCELLED });
    expect(quota.reverse).toHaveBeenCalledWith(tx, 'reservation-1', 'cv-screening-cancelled');
  });

  it('flags a PROCESSING run instead of cancelling it outright, leaving in-flight work to finish', async () => {
    const tx = { cvScreeningRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    prisma.cvScreeningRun.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.cancelRun('recruiter-1', 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'CANCEL_REQUESTED' });
    expect(quota.reverse).not.toHaveBeenCalled();
  });

  it('is idempotent: cancelling an already-flagged PROCESSING run again still succeeds', async () => {
    const tx = { cvScreeningRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    prisma.cvScreeningRun.updateMany.mockResolvedValue({ count: 0 });
    prisma.cvScreeningRun.findUnique.mockResolvedValue({
      status: CvScreeningRunStatus.PROCESSING,
      cancelRequestedAt: new Date(),
    });

    const result = await service.cancelRun('recruiter-1', 'run-1');

    expect(result).toEqual({ runId: 'run-1', status: 'CANCEL_REQUESTED' });
  });

  it('rejects cancelling a run that already reached a terminal state', async () => {
    const tx = { cvScreeningRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    prisma.cvScreeningRun.updateMany.mockResolvedValue({ count: 0 });
    prisma.cvScreeningRun.findUnique.mockResolvedValue({
      status: CvScreeningRunStatus.COMPLETED,
      cancelRequestedAt: null,
    });

    await expect(service.cancelRun('recruiter-1', 'run-1')).rejects.toMatchObject({
      response: { code: 'CV_SCREENING_RUN_NOT_CANCELLABLE' },
    });
  });
});

describe('CvScreeningService.startRun -- embedding pre-filter', () => {
  const pool = [
    { id: 'app-1', cvVersionId: 'cv-1' },
    { id: 'app-2', cvVersionId: 'cv-2' },
    { id: 'app-3', cvVersionId: 'cv-3' },
    { id: 'app-4', cvVersionId: 'cv-4' },
  ];

  function buildService() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      cvScreeningRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: 'run-new', ...data }),
          ),
      },
    };
    const prisma = {
      recruiterAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'recruiter-1', companyId: 'company-1' }),
      },
      jobPost: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          companyId: 'company-1',
          createdByRecruiterId: 'recruiter-1',
          accessRevocations: [],
        }),
      },
      application: {
        count: jest.fn().mockResolvedValue(pool.length),
        findMany: jest.fn().mockResolvedValue(pool),
      },
      cvScreeningCompanyConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const embedding = {
      getOrCreateJobEmbedding: jest.fn().mockResolvedValue({ vector: [1, 0] }),
      getOrCreateCvEmbeddings: jest.fn().mockResolvedValue(new Map()),
      rankCvEmbeddings: jest.fn(),
    };
    const quota = { consume: jest.fn().mockResolvedValue(undefined) };
    const service = new CvScreeningService(
      prisma as unknown as PrismaService,
      {} as GeminiScoringService,
      quota as unknown as SubscriptionQuotaService,
      embedding as unknown as EmbeddingService,
    );
    return { service, prisma, tx, embedding, quota };
  }

  it('ranks by embedding similarity and only scores the top N when a limit is given', async () => {
    const { service, tx, embedding, quota } = buildService();
    embedding.rankCvEmbeddings.mockResolvedValue([
      { cvVersionId: 'cv-3', semanticScore: 91 },
      { cvVersionId: 'cv-1', semanticScore: 80 },
    ]);

    const result = await service.startRun('recruiter-1', { jobPostId: 'job-1', limit: 2 });

    expect(embedding.getOrCreateJobEmbedding).toHaveBeenCalledWith('job-1');
    expect(embedding.getOrCreateCvEmbeddings).toHaveBeenCalledWith([
      'cv-1',
      'cv-2',
      'cv-3',
      'cv-4',
    ]);
    expect(embedding.rankCvEmbeddings).toHaveBeenCalledWith(
      [1, 0],
      ['cv-1', 'cv-2', 'cv-3', 'cv-4'],
      2,
      null,
    );
    // Order and identity follow the ranking (cv-3 first), not submission order.
    expect(tx.cvScreeningRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationIds: ['app-3', 'app-1'],
          totalApplications: 2,
        }),
      }),
    );
    // Billed for the 2 CVs actually selected to be scored, not the pool of 4.
    expect(quota.consume).toHaveBeenCalledWith(tx, expect.objectContaining({ quantity: 2 }));
    expect(result.runId).toBe('run-new');
  });

  it('scores the whole pool and skips embedding lookups entirely when no limit is given', async () => {
    const { service, tx, embedding } = buildService();

    await service.startRun('recruiter-1', { jobPostId: 'job-1' });

    expect(embedding.getOrCreateJobEmbedding).not.toHaveBeenCalled();
    expect(tx.cvScreeningRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationIds: ['app-1', 'app-2', 'app-3', 'app-4'],
          totalApplications: 4,
        }),
      }),
    );
  });

  it('falls back to the most recent N when embedding ranking fails, instead of blocking the run', async () => {
    const { service, tx, embedding } = buildService();
    embedding.rankCvEmbeddings.mockRejectedValue(new Error('AI_SERVICE_UNAVAILABLE'));

    await service.startRun('recruiter-1', { jobPostId: 'job-1', limit: 2 });

    expect(tx.cvScreeningRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationIds: ['app-1', 'app-2'],
          totalApplications: 2,
        }),
      }),
    );
  });

  it("falls back to the company's configured default Top N and similarity threshold when the request omits limit", async () => {
    const { service, prisma, tx, embedding } = buildService();
    prisma.cvScreeningCompanyConfig.findUnique.mockResolvedValue({
      defaultTopN: 2,
      minSimilarityScore: 60,
      customInstructions: null,
    });
    embedding.rankCvEmbeddings.mockResolvedValue([{ cvVersionId: 'cv-3', semanticScore: 91 }]);

    await service.startRun('recruiter-1', { jobPostId: 'job-1' });

    expect(embedding.rankCvEmbeddings).toHaveBeenCalledWith(
      [1, 0],
      ['cv-1', 'cv-2', 'cv-3', 'cv-4'],
      2,
      60,
    );
    expect(tx.cvScreeningRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ limit: 2 }),
      }),
    );
  });

  it("an explicit request limit overrides the company's configured default", async () => {
    const { service, prisma, embedding } = buildService();
    prisma.cvScreeningCompanyConfig.findUnique.mockResolvedValue({
      defaultTopN: 2,
      minSimilarityScore: 60,
      customInstructions: null,
    });
    embedding.rankCvEmbeddings.mockResolvedValue([]);

    await service.startRun('recruiter-1', { jobPostId: 'job-1', limit: 3 });

    // limit=3 (request) wins over defaultTopN=2 (company config); minScore
    // still comes from the company config since the request has no such field.
    expect(embedding.rankCvEmbeddings).toHaveBeenCalledWith(
      [1, 0],
      ['cv-1', 'cv-2', 'cv-3', 'cv-4'],
      3,
      60,
    );
  });
});
