import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { TalentPoolService } from './talent-pool.service';

describe('TalentPoolService', () => {
  const companyId = 'company-1';
  const recruiterId = 'recruiter-1';
  const candidateProfileId = 'candidate-1';

  let prisma: {
    candidateProfile: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    cvPoolUnlock: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let quota: { assertFeatureEnabled: jest.Mock; consume: jest.Mock };
  let service: TalentPoolService;

  beforeEach(() => {
    prisma = {
      candidateProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      cvPoolUnlock: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    quota = {
      assertFeatureEnabled: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue({ usage: { id: 'usage-1' }, replayed: false }),
    };
    service = new TalentPoolService(
      prisma as unknown as PrismaService,
      quota as unknown as SubscriptionQuotaService,
    );
  });

  describe('search', () => {
    it('kiểm tra quota còn trước khi truy vấn danh sách', async () => {
      quota.assertFeatureEnabled.mockRejectedValue(new ForbiddenException('no allowance'));

      await expect(service.search(companyId, {})).rejects.toThrow(ForbiddenException);
      expect(prisma.candidateProfile.findMany).not.toHaveBeenCalled();
    });

    it('chỉ query ứng viên thỏa cả ba lớp đồng ý', async () => {
      await service.search(companyId, {});

      const [args] = prisma.candidateProfile.findMany.mock.calls[0]!;
      expect(args.where).toMatchObject({
        jobSearchStatus: 'OPEN_TO_WORK',
        profileVisibility: 'PUBLIC',
        contactPreference: { is: { status: 'OPTED_IN' } },
      });
    });

    it('không tiêu quota khi chỉ duyệt danh sách', async () => {
      await service.search(companyId, {});
      expect(quota.consume).not.toHaveBeenCalled();
    });
  });

  describe('unlock', () => {
    it('trả lại thông tin miễn phí nếu đã mở trước đó, không tiêu quota lần hai', async () => {
      prisma.cvPoolUnlock.findUnique.mockResolvedValue({ id: 'unlock-1' });
      prisma.candidateProfile.findUniqueOrThrow.mockResolvedValue({
        id: candidateProfileId,
        phoneNumber: '0900000000',
        account: { fullName: 'Nguyễn Văn A', email: 'a@example.com' },
      });

      const result = await service.unlock(companyId, recruiterId, candidateProfileId);

      expect(quota.consume).not.toHaveBeenCalled();
      expect(result.data.fullName).toBe('Nguyễn Văn A');
    });

    it('từ chối mở hồ sơ chưa qua consent-gate', async () => {
      prisma.cvPoolUnlock.findUnique.mockResolvedValue(null);
      prisma.candidateProfile.findFirst.mockResolvedValue(null);

      await expect(service.unlock(companyId, recruiterId, candidateProfileId)).rejects.toThrow(
        NotFoundException,
      );
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('tiêu đúng 1 quota và ghi CvPoolUnlock khi mở lần đầu', async () => {
      prisma.cvPoolUnlock.findUnique.mockResolvedValue(null);
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      prisma.cvPoolUnlock.create.mockResolvedValue({ id: 'unlock-1' });
      prisma.candidateProfile.findUniqueOrThrow.mockResolvedValue({
        id: candidateProfileId,
        phoneNumber: '0900000000',
        account: { fullName: 'Nguyễn Văn A', email: 'a@example.com' },
      });

      await service.unlock(companyId, recruiterId, candidateProfileId);

      expect(quota.consume).toHaveBeenCalledTimes(1);
      expect(quota.consume).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          companyId,
          idempotencyKey: `cv-pool-unlock:${companyId}:${candidateProfileId}`,
        }),
      );
      expect(prisma.cvPoolUnlock.create).toHaveBeenCalledWith({
        data: { companyId, candidateProfileId, unlockedByRecruiterId: recruiterId },
      });
    });

    // §13.2: một lần crash giữa lúc tiêu quota và lúc ghi CvPoolUnlock không được
    // để candidate không bao giờ được đánh dấu đã mở. Retry sau đó phải vẫn ghi
    // được bản ghi, dù consume() báo replayed=true.
    it('vẫn ghi CvPoolUnlock khi consume() báo replayed (retry sau crash giữa transaction)', async () => {
      quota.consume.mockResolvedValue({ usage: { id: 'usage-1' }, replayed: true });
      prisma.cvPoolUnlock.findUnique.mockResolvedValue(null);
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      prisma.cvPoolUnlock.create.mockResolvedValue({ id: 'unlock-1' });
      prisma.candidateProfile.findUniqueOrThrow.mockResolvedValue({
        id: candidateProfileId,
        phoneNumber: '0900000000',
        account: { fullName: 'Nguyễn Văn A', email: 'a@example.com' },
      });

      await service.unlock(companyId, recruiterId, candidateProfileId);

      expect(prisma.cvPoolUnlock.create).toHaveBeenCalled();
    });

    it('đua hai request mở cùng hồ sơ: unique violation không làm hỏng request, không hoàn quota', async () => {
      prisma.cvPoolUnlock.findUnique.mockResolvedValue(null);
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      prisma.cvPoolUnlock.create.mockRejectedValue({ code: 'P2002' });
      prisma.candidateProfile.findUniqueOrThrow.mockResolvedValue({
        id: candidateProfileId,
        phoneNumber: '0900000000',
        account: { fullName: 'Nguyễn Văn A', email: 'a@example.com' },
      });

      const result = await service.unlock(companyId, recruiterId, candidateProfileId);

      expect(result.data.fullName).toBe('Nguyễn Văn A');
    });

    it('ném lại lỗi không phải P2002 từ việc ghi CvPoolUnlock', async () => {
      prisma.cvPoolUnlock.findUnique.mockResolvedValue(null);
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      prisma.cvPoolUnlock.create.mockRejectedValue(new Error('db down'));

      await expect(service.unlock(companyId, recruiterId, candidateProfileId)).rejects.toThrow(
        'db down',
      );
    });
  });
});
