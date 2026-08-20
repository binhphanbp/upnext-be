import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActorType, JobBoostStatus, JobBoostType, JobStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { JobBoostService } from './job-boost.service';

describe('JobBoostService', () => {
  const user: AuthenticatedUser = {
    id: 'recruiter-1',
    email: 'recruiter@example.test',
    companyId: 'company-1',
    role: ActorType.RECRUITER,
    permissions: [],
  };

  let prisma: {
    jobPost: { findFirst: jest.Mock };
    jobBoost: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    subscriptionUsage: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let quota: { consume: jest.Mock; reverse: jest.Mock };
  let service: JobBoostService;

  beforeEach(() => {
    prisma = {
      jobPost: { findFirst: jest.fn() },
      jobBoost: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      subscriptionUsage: { findFirst: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    quota = {
      consume: jest
        .fn()
        .mockResolvedValue({ usage: { companySubscriptionId: 'sub-1' }, replayed: false }),
      reverse: jest.fn().mockResolvedValue(undefined),
    };
    service = new JobBoostService(
      prisma as unknown as PrismaService,
      quota as unknown as SubscriptionQuotaService,
    );
  });

  describe('createBoost', () => {
    it('từ chối khi tin không thuộc công ty của recruiter (không tìm thấy)', async () => {
      prisma.jobPost.findFirst.mockResolvedValue(null);

      await expect(
        service.createBoost('job-1', user, JobBoostType.FEATURED),
      ).rejects.toThrow(NotFoundException);
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('từ chối đẩy tin chưa PUBLISHED', async () => {
      prisma.jobPost.findFirst.mockResolvedValue({
        id: 'job-1',
        status: JobStatus.DRAFT,
        companyId: user.companyId,
      });

      await expect(
        service.createBoost('job-1', user, JobBoostType.FEATURED),
      ).rejects.toMatchObject({ response: { code: 'JOB_NOT_PUBLISHED' } });
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('từ chối khi tin đã có lượt đẩy còn hiệu lực', async () => {
      prisma.jobPost.findFirst.mockResolvedValue({
        id: 'job-1',
        status: JobStatus.PUBLISHED,
        companyId: user.companyId,
      });
      prisma.jobBoost.findFirst.mockResolvedValue({
        id: 'existing-boost',
        endsAt: new Date('2026-09-01T00:00:00.000Z'),
      });

      await expect(
        service.createBoost('job-1', user, JobBoostType.FEATURED),
      ).rejects.toMatchObject({ response: { code: 'JOB_BOOST_ALREADY_ACTIVE' } });
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('tiêu 1 featured_job và tạo JobBoost với id trùng referenceId đã tiêu quota', async () => {
      prisma.jobPost.findFirst.mockResolvedValue({
        id: 'job-1',
        status: JobStatus.PUBLISHED,
        companyId: user.companyId,
      });
      prisma.jobBoost.findFirst.mockResolvedValue(null);
      prisma.jobBoost.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data),
      );

      const boost = await service.createBoost('job-1', user, JobBoostType.URGENT);

      expect(quota.consume).toHaveBeenCalledTimes(1);
      const [, consumeArgs] = quota.consume.mock.calls[0]!;
      // `referenceId` của lượt tiêu quota phải khớp đúng `id` của JobBoost vừa
      // tạo -- đây là cơ chế duy nhất cancelBoost() dùng để hoàn đúng lượt.
      expect(consumeArgs.referenceId).toBe(boost.id);
      expect(boost).toMatchObject({
        type: JobBoostType.URGENT,
        status: JobBoostStatus.ACTIVE,
        companySubscriptionId: 'sub-1',
        creditCost: 1,
      });
    });
  });

  describe('cancelBoost', () => {
    it('không hủy được lượt đã ENDED', async () => {
      prisma.jobBoost.findFirst.mockResolvedValue({
        id: 'boost-1',
        status: JobBoostStatus.ENDED,
        companyId: user.companyId,
        companySubscriptionId: 'sub-1',
      });

      await expect(service.cancelBoost('boost-1', user)).rejects.toMatchObject({
        response: { code: 'JOB_BOOST_NOT_CANCELLABLE' },
      });
      expect(quota.reverse).not.toHaveBeenCalled();
    });

    it('hoàn đúng lượt quota gắn với boost này -- tra theo referenceId, không phải "gần nhất"', async () => {
      prisma.jobBoost.findFirst.mockResolvedValue({
        id: 'boost-1',
        status: JobBoostStatus.ACTIVE,
        companyId: user.companyId,
        companySubscriptionId: 'sub-1',
      });
      prisma.jobBoost.updateMany.mockResolvedValue({ count: 1 });
      prisma.subscriptionUsage.findFirst.mockResolvedValue({ id: 'usage-1' });
      prisma.jobBoost.findUniqueOrThrow.mockResolvedValue({ id: 'boost-1' });

      await service.cancelBoost('boost-1', user);

      expect(prisma.subscriptionUsage.findFirst).toHaveBeenCalledWith({
        where: { referenceType: 'JOB_BOOST', referenceId: 'boost-1' },
      });
      expect(quota.reverse).toHaveBeenCalledWith(prisma, 'usage-1', 'job-boost-cancelled');
    });

    it('từ chối khi công ty khác cố hủy', async () => {
      prisma.jobBoost.findFirst.mockResolvedValue(null);

      await expect(service.cancelBoost('boost-1', user)).rejects.toThrow(NotFoundException);
    });
  });

  it('yêu cầu recruiter phải gắn với một công ty', async () => {
    const noCompanyUser = { ...user, companyId: undefined };

    await expect(
      service.createBoost('job-1', noCompanyUser, JobBoostType.FEATURED),
    ).rejects.toThrow(ForbiddenException);
  });
});
