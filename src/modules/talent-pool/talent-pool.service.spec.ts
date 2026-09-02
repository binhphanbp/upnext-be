import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { TalentPoolService } from './talent-pool.service';

const PERIOD_START = new Date('2026-09-01T00:00:00.000Z');
const PERIOD_END = new Date('2026-10-01T00:00:00.000Z');

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
    company: { findUnique: jest.Mock };
    cvPoolDetailView: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
    cV: { findFirst: jest.Mock };
    fileAsset: { findMany: jest.Mock; findFirst: jest.Mock };
    talentPoolInvitation: { findUnique: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let quota: {
    consume: jest.Mock;
    getFeatureLimit: jest.Mock;
    resolveCurrentPeriod: jest.Mock;
    peek: jest.Mock;
  };
  const email = { sendApplicationInvitation: jest.fn().mockResolvedValue(undefined) };
  let service: TalentPoolService;

  function fullProfileRow(overrides: Record<string, unknown> = {}) {
    return {
      id: candidateProfileId,
      phoneNumber: '0900000000',
      address: '123 Đường ABC',
      preferredSearchCity: 'Hồ Chí Minh',
      description: 'Backend engineer',
      birthdate: new Date('1998-01-01'),
      account: { fullName: 'Nguyễn Văn A', email: 'a@example.com' },
      links: [{ type: 'github', url: 'https://github.com/a' }],
      skills: [],
      experiences: [],
      educations: [],
      projects: [],
      certifications: [],
      languages: [],
      jobPreference: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      candidateProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(fullProfileRow()),
      },
      company: { findUnique: jest.fn() },
      cvPoolDetailView: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'view-1' }),
      },
      cV: { findFirst: jest.fn().mockResolvedValue(null) },
      // `search()`/`viewDetail()` tra avatar qua `FileAsset` (purpose AVATAR) --
      // mặc định rỗng/null để test hành vi cũ không phải quan tâm avatar, trừ
      // khi một test cụ thể muốn assert avatarUrl.
      fileAsset: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      talentPoolInvitation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'inv-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    quota = {
      consume: jest.fn().mockResolvedValue({ usage: { id: 'usage-1' }, replayed: false }),
      getFeatureLimit: jest.fn().mockResolvedValue({ enabled: false, limit: 0 }),
      resolveCurrentPeriod: jest
        .fn()
        .mockResolvedValue({ periodStart: PERIOD_START, periodEnd: PERIOD_END }),
      peek: jest.fn().mockResolvedValue([]),
    };
    email.sendApplicationInvitation.mockClear();
    service = new TalentPoolService(
      prisma as unknown as PrismaService,
      quota as unknown as SubscriptionQuotaService,
      email as never,
    );
  });

  describe('getCapabilities', () => {
    it('đọc cả ba feature từ peek() và ánh xạ đúng tên', async () => {
      quota.peek = jest.fn().mockResolvedValue([
        {
          feature: 'cv_pool_view',
          enabled: true,
          limit: 5,
          used: 2,
          remaining: 3,
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
        },
        { feature: 'cv_pool_unlocked_profile', enabled: false, limit: 0, used: 0, remaining: 0 },
        {
          feature: 'cv_pool_ai_search',
          enabled: true,
          limit: 10,
          used: 1,
          remaining: 9,
          periodEnd: PERIOD_END,
        },
      ]);

      const result = await service.getCapabilities(companyId);

      expect(result.view).toMatchObject({ limit: 5, used: 2, remaining: 3, periodEnd: PERIOD_END });
      expect(result.unlocked).toBe(false);
      expect(result.aiSearch).toMatchObject({ enabled: true, limit: 10, remaining: 9 });
    });

    it('enabled=true nhưng limit=0 vẫn báo unlocked=false (cùng bẫy seed.ts)', async () => {
      quota.peek = jest
        .fn()
        .mockResolvedValue([
          { feature: 'cv_pool_unlocked_profile', enabled: true, limit: 0, used: 0, remaining: 0 },
        ]);

      expect((await service.getCapabilities(companyId)).unlocked).toBe(false);
    });

    it('không có dòng nào cho feature (plan không khai) vẫn trả về mặc định an toàn', async () => {
      quota.peek = jest.fn().mockResolvedValue([]);

      const result = await service.getCapabilities(companyId);

      expect(result.view).toMatchObject({ limit: null, used: 0, remaining: null });
      expect(result.unlocked).toBe(false);
      expect(result.aiSearch.enabled).toBe(false);
    });
  });

  describe('sendApplicationInvitation', () => {
    it('sends the saved company template to the candidate email without returning it', async () => {
      prisma.company.findUnique.mockResolvedValue({
        name: 'UpNext',
        applicationInvitationTemplate: 'Chào {candidateName} từ {companyName}',
      });
      prisma.candidateProfile.findFirst.mockResolvedValue({
        account: { fullName: 'Nguyễn Văn A', email: 'candidate@example.com' },
      });

      await expect(
        service.sendApplicationInvitation(companyId, candidateProfileId),
      ).resolves.toEqual({
        sent: true,
      });

      expect(email.sendApplicationInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'candidate@example.com',
          companyName: 'UpNext',
          html: expect.stringContaining('Chào Nguyễn Văn A từ UpNext'),
        }),
      );
      expect(prisma.talentPoolInvitation.create).toHaveBeenCalledWith({
        data: {
          companyId,
          candidateProfileId,
          message: null,
        },
      });
    });

    it('quăng ConflictException nếu đã gửi lời mời trước đó', async () => {
      prisma.talentPoolInvitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        sentAt: new Date(),
      });

      await expect(
        service.sendApplicationInvitation(companyId, candidateProfileId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('search', () => {
    it('KHÔNG kiểm quota trước khi duyệt danh sách -- danh sách miễn phí cho mọi công ty', async () => {
      // Bug đã sửa: bản cũ gate cả danh sách sau `assertFeatureEnabled`, nên
      // Free tier (limitValue cũ = 0) không vào được Kho CV.
      await service.search(companyId, {});

      expect(quota.consume).not.toHaveBeenCalled();
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

    it('loại ứng viên đã chặn công ty này', async () => {
      await service.search(companyId, {});

      const [args] = prisma.candidateProfile.findMany.mock.calls[0]!;
      expect(args.where.companyBlocks).toEqual({ none: { companyId, revokedAt: null } });
    });

    it('đếm tổng bằng đúng where của danh sách', async () => {
      await service.search(companyId, {});

      const [listArgs] = prisma.candidateProfile.findMany.mock.calls[0]!;
      const [countArgs] = prisma.candidateProfile.count.mock.calls[0]!;
      expect(countArgs.where).toEqual(listArgs.where);
    });

    it('đánh dấu viewedThisPeriod đúng theo CvPoolDetailView của KỲ HIỆN TẠI', async () => {
      prisma.candidateProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          description: null,
          preferredSearchCity: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          jobSearchStatus: 'OPEN_TO_WORK',
          account: { fullName: 'Ứng viên P1' },
          skills: [],
          experiences: [],
          jobPreference: null,
          cvs: [],
        },
        {
          id: 'p2',
          description: null,
          preferredSearchCity: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          jobSearchStatus: 'OPEN_TO_WORK',
          account: { fullName: 'Ứng viên P2' },
          skills: [],
          experiences: [],
          jobPreference: null,
          cvs: [],
        },
      ]);
      prisma.cvPoolDetailView.findMany.mockResolvedValue([{ candidateProfileId: 'p1' }]);

      const result = await service.search(companyId, {});

      expect(result.data.find((row) => row.candidateProfileId === 'p1')?.viewedThisPeriod).toBe(
        true,
      );
      expect(result.data.find((row) => row.candidateProfileId === 'p2')?.viewedThisPeriod).toBe(
        false,
      );
      // Tra theo đúng periodStart của kỳ hiện tại, không phải "đã từng xem bao giờ".
      expect(prisma.cvPoolDetailView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ periodStart: PERIOD_START }) }),
      );
    });

    it('không truy vấn CvPoolDetailView khi danh sách rỗng', async () => {
      await service.search(companyId, {});
      expect(prisma.cvPoolDetailView.findMany).not.toHaveBeenCalled();
    });

    it('danh sách hiện fullName -- KHÔNG che tên ở tầng duyệt (chỉ liên hệ mới bị che, và chỉ ở chi tiết)', async () => {
      prisma.candidateProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          description: null,
          preferredSearchCity: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          jobSearchStatus: 'OPEN_TO_WORK',
          account: { fullName: 'Trần Thị B' },
          skills: [],
          experiences: [],
          jobPreference: null,
          cvs: [],
        },
      ]);

      const result = await service.search(companyId, {});

      expect(result.data[0]?.fullName).toBe('Trần Thị B');
    });
  });

  describe('viewDetail', () => {
    it('từ chối hồ sơ chưa qua consent-gate, không tiêu quota', async () => {
      prisma.candidateProfile.findFirst.mockResolvedValue(null);

      await expect(service.viewDetail(companyId, recruiterId, candidateProfileId)).rejects.toThrow(
        NotFoundException,
      );
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('kiểm ứng viên chưa chặn công ty trước khi cho xem chi tiết', async () => {
      prisma.candidateProfile.findFirst.mockResolvedValue(null);

      await expect(service.viewDetail(companyId, recruiterId, candidateProfileId)).rejects.toThrow(
        NotFoundException,
      );

      const [args] = prisma.candidateProfile.findFirst.mock.calls[0]!;
      expect(args.where.companyBlocks).toEqual({ none: { companyId, revokedAt: null } });
    });

    it('tiêu đúng 1 quota và ghi CvPoolDetailView khi xem lần đầu trong kỳ', async () => {
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });

      await service.viewDetail(companyId, recruiterId, candidateProfileId);

      expect(quota.consume).toHaveBeenCalledTimes(1);
      expect(quota.consume).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          companyId,
          feature: 'cv_pool_view',
          idempotencyKey: `cv-pool-view:${companyId}:${candidateProfileId}:${PERIOD_START.getTime()}`,
        }),
      );
      expect(prisma.cvPoolDetailView.create).toHaveBeenCalledWith({
        data: {
          companyId,
          candidateProfileId,
          viewedByRecruiterId: recruiterId,
          periodStart: PERIOD_START,
        },
      });
    });

    it('đã xem trong CÙNG kỳ thì không tiêu quota lần hai', async () => {
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      prisma.cvPoolDetailView.findUnique.mockResolvedValue({ id: 'view-existing' });

      await service.viewDetail(companyId, recruiterId, candidateProfileId);

      expect(quota.consume).not.toHaveBeenCalled();
      expect(prisma.cvPoolDetailView.create).not.toHaveBeenCalled();
    });

    it('sang KỲ MỚI thì xem lại vẫn tiêu quota, dù đã xem ở kỳ trước', async () => {
      // Đây là khác biệt cố ý với `CvPoolUnlock` cũ (mở vĩnh viễn): mỗi tháng
      // là một hạn mức mới.
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      // `findUnique` được gọi với where khoá theo periodStart hiện tại -- kỳ
      // mới nên không có bản ghi nào khớp, dù công ty đã xem hồ sơ này tháng trước.
      prisma.cvPoolDetailView.findUnique.mockResolvedValue(null);

      await service.viewDetail(companyId, recruiterId, candidateProfileId);

      expect(quota.consume).toHaveBeenCalledTimes(1);
    });

    it('đua hai request xem cùng hồ sơ trong cùng kỳ: unique violation không làm hỏng request', async () => {
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      prisma.cvPoolDetailView.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.viewDetail(companyId, recruiterId, candidateProfileId),
      ).resolves.toBeDefined();
    });

    it('ném lại lỗi không phải P2002 từ việc ghi CvPoolDetailView', async () => {
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      prisma.cvPoolDetailView.create.mockRejectedValue(new Error('db down'));

      await expect(service.viewDetail(companyId, recruiterId, candidateProfileId)).rejects.toThrow(
        'db down',
      );
    });

    it('gói CHƯA unlock: CHỈ che email/phoneNumber -- tên/địa chỉ/link vẫn hiện', async () => {
      // Điều chỉnh so với bản thiết kế đầu (từng che cả 5 trường): sản phẩm
      // tham chiếu cho thấy tên, địa chỉ, ngày sinh, giới tính hiện ngay cả khi
      // chưa mua gói. Thứ đổi tiền là HAI KÊNH LIÊN HỆ TRỰC TIẾP, không phải
      // toàn bộ danh tính.
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      quota.getFeatureLimit.mockResolvedValue({ enabled: false, limit: 0 });

      const result = await service.viewDetail(companyId, recruiterId, candidateProfileId);

      expect(result.data.unlocked).toBe(false);
      expect(result.data.email).toBeNull();
      expect(result.data.phoneNumber).toBeNull();
      // Vẫn hiện: đây là điểm khác biệt cố ý với thiết kế Discovery đã bỏ.
      expect(result.data.fullName).toBe('Nguyễn Văn A');
      expect(result.data.address).toBe('123 Đường ABC');
      expect(result.data.links).toHaveLength(1);
    });

    it('gói ĐÃ unlock: hiện đầy đủ, không che gì', async () => {
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      quota.getFeatureLimit.mockResolvedValue({ enabled: true, limit: null });

      const result = await service.viewDetail(companyId, recruiterId, candidateProfileId);

      expect(result.data.unlocked).toBe(true);
      expect(result.data.fullName).toBe('Nguyễn Văn A');
      expect(result.data.email).toBe('a@example.com');
      expect(result.data.phoneNumber).toBe('0900000000');
      expect(result.data.links).toHaveLength(1);
    });

    it('enabled=true nhưng limitValue=0 vẫn KHÔNG unlock (bẫy seed.ts luôn ghi enabled:true)', async () => {
      // `prisma/seed.ts` ép `enabled: true` cho mọi dòng nó upsert kể cả dòng
      // Free có limitValue 0 -- nếu chỉ dựa vào `enabled`, seed.ts sẽ vô tình
      // unlock hồ sơ cho gói Free.
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      quota.getFeatureLimit.mockResolvedValue({ enabled: true, limit: 0 });

      const result = await service.viewDetail(companyId, recruiterId, candidateProfileId);

      expect(result.data.unlocked).toBe(false);
      // Field vẫn phải che đúng dù `enabled` bị seed.ts ép true.
      expect(result.data.email).toBeNull();
      expect(result.data.phoneNumber).toBeNull();
    });

    it('KHÔNG bao giờ che thông tin nghề nghiệp (skills/experience/education) dù chưa unlock', async () => {
      prisma.candidateProfile.findUniqueOrThrow.mockResolvedValue(
        fullProfileRow({
          skills: [
            {
              proficiencyLevel: 'ADVANCED',
              yearsOfExperience: '3',
              skill: { id: 's1', name: 'NestJS' },
            },
          ],
          experiences: [{ companyName: 'FooCorp', positionTitle: 'Backend Engineer' }],
        }),
      );
      prisma.candidateProfile.findFirst.mockResolvedValue({ id: candidateProfileId });
      quota.getFeatureLimit.mockResolvedValue({ enabled: false, limit: 0 });

      const result = await service.viewDetail(companyId, recruiterId, candidateProfileId);

      expect(result.data.skills).toHaveLength(1);
      expect(result.data.skills[0]).toMatchObject({ name: 'NestJS' });
      expect(result.data.experiences).toHaveLength(1);
      expect(result.data.experiences[0]).toMatchObject({ companyName: 'FooCorp' });
    });
  });

  describe('getCvDownload', () => {
    it('gói chưa unlock ⇒ 403, không truy vấn file', async () => {
      quota.getFeatureLimit.mockResolvedValue({ enabled: false, limit: 0 });

      await expect(service.getCvDownload(companyId, candidateProfileId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.cV.findFirst).not.toHaveBeenCalled();
    });

    it('đã unlock nhưng CHƯA xem chi tiết trong kỳ này ⇒ 403', async () => {
      quota.getFeatureLimit.mockResolvedValue({ enabled: true, limit: null });
      prisma.cvPoolDetailView.findUnique.mockResolvedValue(null);

      await expect(service.getCvDownload(companyId, candidateProfileId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.cV.findFirst).not.toHaveBeenCalled();
    });

    it('đã unlock + đã xem nhưng ứng viên không có file gốc (chỉ CV Builder) ⇒ 404', async () => {
      quota.getFeatureLimit.mockResolvedValue({ enabled: true, limit: null });
      prisma.cvPoolDetailView.findUnique.mockResolvedValue({ id: 'view-1' });
      prisma.cV.findFirst.mockResolvedValue({ versions: [{ sourceFile: null }] });

      await expect(service.getCvDownload(companyId, candidateProfileId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('đủ điều kiện ⇒ trả downloadUrl từ file gốc mới nhất của CV mặc định', async () => {
      quota.getFeatureLimit.mockResolvedValue({ enabled: true, limit: null });
      prisma.cvPoolDetailView.findUnique.mockResolvedValue({ id: 'view-1' });
      prisma.cV.findFirst.mockResolvedValue({
        versions: [
          {
            sourceFile: {
              publicUrl: 'https://cdn.example.com/cv.pdf',
              originalName: 'cv.pdf',
              mimeType: 'application/pdf',
            },
          },
        ],
      });

      const result = await service.getCvDownload(companyId, candidateProfileId);

      expect(result).toEqual({
        downloadUrl: 'https://cdn.example.com/cv.pdf',
        originalName: 'cv.pdf',
      });
      // Lấy CV mặc định, phiên bản mới nhất.
      const [args] = prisma.cV.findFirst.mock.calls[0]!;
      expect(args.where).toEqual({ candidateProfileId, isDefault: true });
      expect(args.select.versions.orderBy).toEqual({ versionNo: 'desc' });
      expect(args.select.versions.take).toBe(1);
    });
  });
});
