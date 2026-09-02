import { CvScreeningRunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CvScreeningService } from './cv-screening.service';
import { CvScreeningWorkerService } from './cv-screening-worker.service';

describe('CvScreeningWorkerService', () => {
  const prisma = {
    cvScreeningRun: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const screening = {
    processClaimedRun: jest.fn(),
    finishClaimedRun: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('claims a persisted pending run before executing it', async () => {
    prisma.cvScreeningRun.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.cvScreeningRun.findFirst.mockResolvedValueOnce({ id: 'run-1', startedAt: null });
    screening.processClaimedRun.mockResolvedValue(undefined);
    const worker = new CvScreeningWorkerService(
      prisma as unknown as PrismaService,
      screening as unknown as CvScreeningService,
    );

    await worker.processNextRun();

    expect(prisma.cvScreeningRun.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'run-1', status: CvScreeningRunStatus.PENDING }),
        data: expect.objectContaining({
          status: CvScreeningRunStatus.PROCESSING,
          attemptCount: { increment: 1 },
        }),
      }),
    );
    expect(screening.processClaimedRun).toHaveBeenCalledWith(
      'run-1',
      expect.stringMatching(/^cv-screening:/),
    );
  });

  it('settles and refunds after the final failed attempt', async () => {
    prisma.cvScreeningRun.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.cvScreeningRun.findFirst
      .mockResolvedValueOnce({ id: 'run-2', startedAt: new Date() })
      .mockResolvedValueOnce({ attemptCount: 3 });
    screening.processClaimedRun.mockRejectedValue(new Error('AI gateway timeout'));
    screening.finishClaimedRun.mockResolvedValue(undefined);
    const worker = new CvScreeningWorkerService(
      prisma as unknown as PrismaService,
      screening as unknown as CvScreeningService,
    );

    await worker.processNextRun();

    expect(screening.finishClaimedRun).toHaveBeenCalledWith(
      'run-2',
      expect.stringMatching(/^cv-screening:/),
      CvScreeningRunStatus.FAILED,
      expect.stringContaining('AI gateway timeout'),
    );
  });
});
