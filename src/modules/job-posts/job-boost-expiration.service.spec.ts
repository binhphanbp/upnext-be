import { JobBoostStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JobBoostExpirationService } from './job-boost-expiration.service';

describe('JobBoostExpirationService', () => {
  let prisma: {
    jobBoost: { findMany: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: JobBoostExpirationService;

  beforeEach(() => {
    prisma = {
      jobBoost: { findMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    service = new JobBoostExpirationService(prisma as unknown as PrismaService);
  });

  it('chỉ chuyển boost ACTIVE đã qua endsAt, không đụng SCHEDULED/ENDED/CANCELLED', async () => {
    prisma.jobBoost.findMany.mockResolvedValue([{ id: 'boost-1' }]);
    prisma.jobBoost.updateMany.mockResolvedValue({ count: 1 });

    await service.endExpiredBoosts();

    const [findArgs] = prisma.jobBoost.findMany.mock.calls[0]!;
    expect(findArgs.where.status).toBe(JobBoostStatus.ACTIVE);
    expect(prisma.jobBoost.updateMany).toHaveBeenCalledWith({
      where: { id: 'boost-1', status: JobBoostStatus.ACTIVE, endsAt: { lte: expect.any(Date) } },
      data: { status: JobBoostStatus.ENDED },
    });
  });

  it('không làm gì khi không có boost nào hết hạn', async () => {
    prisma.jobBoost.findMany.mockResolvedValue([]);

    await service.endExpiredBoosts();

    expect(prisma.jobBoost.updateMany).not.toHaveBeenCalled();
  });
});
