import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { JobPostsService } from './job-posts.service';
import { JobBoostService } from './job-boost.service';
import { ActorType, CompanyVerificationStatus, JobStatus, ModerationStatus } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('JobPostsService', () => {
  let service: JobPostsService;

  const prismaMock: any = {
    company: {
      findUnique: jest.fn(),
    },
    recruiterAccount: {
      findUnique: jest.fn(),
    },
    jobPost: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    candidateProfile: {
      findUnique: jest.fn(),
    },
    jobView: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    companyMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    jobPostAccessRevocation: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const notificationsServiceMock: any = {
    createNotification: jest.fn(),
  };

  const jobBoostServiceMock: any = {
    invalidateActiveBoostForJob: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobPostsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
        {
          provide: JobBoostService,
          useValue: jobBoostServiceMock,
        },
      ],
    }).compile();

    service = module.get<JobPostsService>(JobPostsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const recruiter = { id: 'recruiter-id', role: ActorType.RECRUITER } as AuthenticatedUser;
    const dto = { title: 'Senior React Developer', description: 'Mô tả công việc.' };

    it('lets a verified company create a draft without a business licence file or subscription quota', async () => {
      prismaMock.recruiterAccount.findUnique.mockResolvedValue({
        id: 'recruiter-id',
        company: {
          id: 'company-id',
          verificationStatus: CompanyVerificationStatus.VERIFIED,
          businessLicenseFileId: null,
        },
      });
      prismaMock.jobPost.create.mockResolvedValue({ id: 'job-id' });

      await expect(service.create(recruiter, dto)).resolves.toEqual({ id: 'job-id' });
      expect(prismaMock.jobPost.create).toHaveBeenCalled();
    });

    it('still asks an unverified company for its business licence', async () => {
      prismaMock.recruiterAccount.findUnique.mockResolvedValue({
        id: 'recruiter-id',
        company: {
          id: 'company-id',
          verificationStatus: CompanyVerificationStatus.UNVERIFIED,
          businessLicenseFileId: null,
        },
      });

      await expect(service.create(recruiter, dto)).rejects.toThrow(
        'Company business license is required before creating job posts',
      );
      expect(prismaMock.jobPost.create).not.toHaveBeenCalled();
    });
  });

  describe('recordView', () => {
    beforeEach(() => {
      prismaMock.jobPost.findFirst.mockResolvedValue({ id: 'job-id' });
    });

    it('records one anonymous view with the browser visitor key', async () => {
      prismaMock.jobView.findFirst.mockResolvedValue(null);
      prismaMock.jobView.create.mockResolvedValue({ id: 'view-id' });

      await expect(
        service.recordView('job-id', '203.0.113.1', 'test-agent', undefined, 'visitor-123'),
      ).resolves.toEqual({ id: 'view-id' });

      expect(prismaMock.jobView.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            jobPostId: 'job-id',
            OR: [{ visitorKey: 'visitor-123' }],
          }),
        }),
      );
      expect(prismaMock.jobView.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobPostId: 'job-id',
          visitorKey: 'visitor-123',
        }),
      });
    });

    it('does not count a repeated view from the same visitor within 24 hours', async () => {
      prismaMock.jobView.findFirst.mockResolvedValue({ id: 'existing-view' });

      await expect(
        service.recordView('job-id', '203.0.113.1', 'test-agent', undefined, 'visitor-123'),
      ).resolves.toEqual({ id: 'existing-view' });

      expect(prismaMock.jobView.create).not.toHaveBeenCalled();
    });
  });

  describe('getCompanyJobPosts', () => {
    it('returns all non-deleted job posts in the recruiter company', async () => {
      prismaMock.recruiterAccount.findUnique.mockResolvedValue({ companyId: 'company-id' });
      prismaMock.jobPost.findMany.mockResolvedValue([]);

      await service.getCompanyJobPosts('recruiter-id');

      expect(prismaMock.jobPost.findMany).toHaveBeenCalledWith({
        where: {
          companyId: 'company-id',
          deletedAt: null,
          OR: [
            { createdByRecruiterId: 'recruiter-id' },
            {
              accessRevocations: {
                none: { recruiterAccountId: 'recruiter-id' },
              },
            },
          ],
        },
        include: expect.objectContaining({
          createdByRecruiter: expect.any(Object),
        }),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('rejects a recruiter without a company', async () => {
      prismaMock.recruiterAccount.findUnique.mockResolvedValue(null);

      await expect(service.getCompanyJobPosts('recruiter-id')).rejects.toThrow(BadRequestException);
      expect(prismaMock.jobPost.findMany).not.toHaveBeenCalled();
    });
  });

  describe('job-post member access', () => {
    const manager: AuthenticatedUser = {
      id: 'manager-id',
      email: 'manager@example.com',
      role: ActorType.RECRUITER,
      companyId: 'company-id',
      permissions: ['jobs:manage'],
    };

    it('marks a company member as revoked while keeping the job creator accessible', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        title: 'Backend Developer',
        companyId: 'company-id',
        createdByRecruiterId: 'creator-id',
        accessRevocations: [],
      });
      prismaMock.companyMember.findMany.mockResolvedValue([
        {
          id: 'creator-member-id',
          status: 'ACTIVE',
          recruiterAccount: {
            id: 'creator-id',
            email: 'creator@example.com',
            status: 'ACTIVE',
            profile: { fullName: 'Creator', avatarUrl: null },
          },
          role: { id: 'role-1', code: 'OWNER', name: 'Owner' },
        },
        {
          id: 'member-id',
          status: 'ACTIVE',
          recruiterAccount: {
            id: 'member-account-id',
            email: 'member@example.com',
            status: 'ACTIVE',
            profile: { fullName: 'Member', avatarUrl: null },
          },
          role: { id: 'role-2', code: 'HR', name: 'HR' },
        },
      ]);
      prismaMock.jobPostAccessRevocation.findMany.mockResolvedValue([
        { recruiterAccountId: 'member-account-id', revokedAt: new Date('2026-07-26') },
      ]);

      const result = await service.listJobPostAccessMembers('job-id', manager);

      expect(result.members).toEqual([
        expect.objectContaining({
          recruiterAccountId: 'creator-id',
          isJobCreator: true,
          hasAccess: true,
        }),
        expect.objectContaining({
          recruiterAccountId: 'member-account-id',
          isJobCreator: false,
          hasAccess: false,
        }),
      ]);
    });

    it('creates a revocation for a company member', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        title: 'Backend Developer',
        companyId: 'company-id',
        createdByRecruiterId: 'creator-id',
        accessRevocations: [],
      });
      prismaMock.companyMember.findFirst.mockResolvedValue({
        id: 'member-id',
        recruiterAccountId: 'member-account-id',
      });

      await service.updateJobPostMemberAccess('job-id', 'member-account-id', false, manager);

      expect(prismaMock.jobPostAccessRevocation.upsert).toHaveBeenCalledWith({
        where: {
          jobPostId_recruiterAccountId: {
            jobPostId: 'job-id',
            recruiterAccountId: 'member-account-id',
          },
        },
        update: {
          revokedByRecruiterId: 'manager-id',
          revokedAt: expect.any(Date),
        },
        create: {
          jobPostId: 'job-id',
          recruiterAccountId: 'member-account-id',
          revokedByRecruiterId: 'manager-id',
        },
      });
    });
  });

  describe('approveJobPost', () => {
    it('should throw NotFoundException if job post does not exist', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(null);

      await expect(
        service.approveJobPost('job-id', { moderationNote: 'Looks good' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if job post is not PENDING', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        moderationStatus: ModerationStatus.APPROVED,
      });

      await expect(
        service.approveJobPost('job-id', { moderationNote: 'Looks good' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully approve a pending job post and send a notification', async () => {
      const jobPost = {
        id: 'job-id',
        title: 'Developer',
        createdByRecruiterId: 'recruiter-id',
        moderationStatus: ModerationStatus.PENDING,
      };

      prismaMock.jobPost.findFirst.mockResolvedValue(jobPost);
      prismaMock.jobPost.update.mockResolvedValue({
        ...jobPost,
        moderationStatus: ModerationStatus.APPROVED,
        moderationNote: 'Looks good',
        reason: null,
      });

      const result = await service.approveJobPost('job-id', { moderationNote: 'Looks good' });

      expect(prismaMock.jobPost.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-id', deletedAt: null },
      });
      expect(prismaMock.jobPost.update).toHaveBeenCalledWith({
        where: { id: 'job-id' },
        data: {
          moderationStatus: ModerationStatus.APPROVED,
          moderationNote: 'Looks good',
          reason: null,
        },
        include: expect.any(Object),
      });
      expect(notificationsServiceMock.createNotification).toHaveBeenCalledWith({
        recipientId: 'recruiter-id',
        recipientType: 'RECRUITER',
        title: 'Tin tuyển dụng đã được phê duyệt',
        body: 'Tin tuyển dụng "Developer" của bạn đã được duyệt thành công.',
        targetId: 'job-id',
        targetType: 'JOB_POST',
      });
      expect(result.message).toBe('Phê duyệt tin tuyển dụng thành công.');
      expect(result.jobPost.moderationStatus).toBe(ModerationStatus.APPROVED);
    });
  });

  describe('rejectJobPost', () => {
    it('should throw NotFoundException if job post does not exist', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(null);

      await expect(
        service.rejectJobPost('job-id', { reason: 'Incorrect details' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if job post is not PENDING', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        moderationStatus: ModerationStatus.REJECTED,
      });

      await expect(
        service.rejectJobPost('job-id', { reason: 'Incorrect details' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully reject a pending job post and send a notification', async () => {
      const jobPost = {
        id: 'job-id',
        title: 'Developer',
        createdByRecruiterId: 'recruiter-id',
        moderationStatus: ModerationStatus.PENDING,
      };

      prismaMock.jobPost.findFirst.mockResolvedValue(jobPost);
      prismaMock.jobPost.update.mockResolvedValue({
        ...jobPost,
        moderationStatus: ModerationStatus.REJECTED,
        reason: 'Incorrect details',
        moderationNote: null,
      });

      const result = await service.rejectJobPost('job-id', { reason: 'Incorrect details' });

      expect(prismaMock.jobPost.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-id', deletedAt: null },
      });
      expect(prismaMock.jobPost.update).toHaveBeenCalledWith({
        where: { id: 'job-id' },
        data: {
          moderationStatus: ModerationStatus.REJECTED,
          reason: 'Incorrect details',
          moderationNote: null,
        },
        include: expect.any(Object),
      });
      expect(notificationsServiceMock.createNotification).toHaveBeenCalledWith({
        recipientId: 'recruiter-id',
        recipientType: 'RECRUITER',
        title: 'Tin tuyển dụng đã bị từ chối',
        body: 'Lý do: Incorrect details',
        targetId: 'job-id',
        targetType: 'JOB_POST',
      });
      expect(result.message).toBe('Từ chối duyệt tin tuyển dụng thành công.');
      expect(result.jobPost.moderationStatus).toBe(ModerationStatus.REJECTED);
    });
  });

  describe('findAll', () => {
    it('only returns published AND approved job posts', async () => {
      prismaMock.jobPost.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(prismaMock.jobPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PUBLISHED',
            moderationStatus: ModerationStatus.APPROVED,
          }),
        }),
      );
    });

    it('adds keyword and city constraints for personalized public search', async () => {
      prismaMock.jobPost.findMany.mockResolvedValue([]);

      await service.findAll({ keyword: 'React', location: 'TP. Hồ Chí Minh' });

      const where = prismaMock.jobPost.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { title: { contains: 'React', mode: 'insensitive' } },
            { description: { contains: 'React', mode: 'insensitive' } },
          ]),
        }),
      ]);
      expect(where.jobPostLocations.some.jobLocation.OR).toEqual(
        expect.arrayContaining([
          { city: { contains: 'Hồ Chí Minh', mode: 'insensitive' } },
          { city: { contains: 'TP. Hồ Chí Minh', mode: 'insensitive' } },
        ]),
      );
    });

    it('does not add an automatic location constraint for all locations', async () => {
      prismaMock.jobPost.findMany.mockResolvedValue([]);

      await service.findAll({ location: 'Tất cả địa điểm' });

      const where = prismaMock.jobPost.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('jobPostLocations');
    });
  });

  describe('findOne', () => {
    it('requires moderationStatus=APPROVED to return a job post', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(null);

      await expect(service.findOne('job-id')).rejects.toThrow(NotFoundException);
      expect(prismaMock.jobPost.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'job-id',
            status: 'PUBLISHED',
            moderationStatus: ModerationStatus.APPROVED,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('sets moderationStatus to APPROVED when editing a job post', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        createdByRecruiterId: 'recruiter-id',
        companyId: 'company-id',
        status: 'PUBLISHED',
        moderationStatus: ModerationStatus.APPROVED,
      });
      prismaMock.jobPost.update.mockResolvedValue({});

      await service.update('job-id', 'recruiter-id', { title: 'New title' });

      expect(prismaMock.jobPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'New title',
            moderationStatus: ModerationStatus.APPROVED,
            reason: null,
            moderationNote: null,
          }),
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('lets a verified, reputable company publish a draft without an active subscription', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        createdByRecruiterId: 'recruiter-id',
        companyId: 'company-id',
        status: JobStatus.DRAFT,
        moderationStatus: ModerationStatus.APPROVED,
      });
      prismaMock.company.findUnique.mockResolvedValue({
        verificationStatus: CompanyVerificationStatus.VERIFIED,
        reputationScore: '100',
      });
      prismaMock.jobPost.update.mockResolvedValue({ id: 'job-id', status: JobStatus.PUBLISHED });

      await expect(
        service.updateStatus('job-id', 'recruiter-id', JobStatus.PUBLISHED),
      ).resolves.toEqual({ id: 'job-id', status: JobStatus.PUBLISHED });

      expect(prismaMock.company.findUnique).toHaveBeenCalledWith({
        where: { id: 'company-id' },
        select: { verificationStatus: true, reputationScore: true },
      });
      expect(prismaMock.jobPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-id' },
          data: expect.objectContaining({ status: JobStatus.PUBLISHED }),
        }),
      );
    });

    it('rejects publishing a job post that is neither DRAFT nor CLOSED', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        createdByRecruiterId: 'recruiter-id',
        companyId: 'company-id',
        status: 'PUBLISHED',
        moderationStatus: ModerationStatus.APPROVED,
      });

      await expect(
        service.updateStatus('job-id', 'recruiter-id', JobStatus.PUBLISHED),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects closing a job post that is not currently published', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        createdByRecruiterId: 'recruiter-id',
        companyId: 'company-id',
        status: 'DRAFT',
        moderationStatus: ModerationStatus.PENDING,
      });

      await expect(
        service.updateStatus('job-id', 'recruiter-id', JobStatus.CLOSED),
      ).rejects.toThrow(BadRequestException);
    });

    it('ends any live boost when a published job post is closed', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        createdByRecruiterId: 'recruiter-id',
        companyId: 'company-id',
        status: JobStatus.PUBLISHED,
        moderationStatus: ModerationStatus.APPROVED,
      });
      prismaMock.jobPost.update.mockResolvedValue({ id: 'job-id', status: JobStatus.CLOSED });

      await service.updateStatus('job-id', 'recruiter-id', JobStatus.CLOSED);

      expect(jobBoostServiceMock.invalidateActiveBoostForJob).toHaveBeenCalledWith(
        'job-id',
        'JOB_CLOSED',
      );
    });

    it('does not touch any boost when publishing (only closing ends one)', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        createdByRecruiterId: 'recruiter-id',
        companyId: 'company-id',
        status: JobStatus.DRAFT,
        moderationStatus: ModerationStatus.APPROVED,
      });
      prismaMock.company.findUnique.mockResolvedValue({
        verificationStatus: CompanyVerificationStatus.VERIFIED,
        reputationScore: '100',
      });
      prismaMock.jobPost.update.mockResolvedValue({ id: 'job-id', status: JobStatus.PUBLISHED });

      await service.updateStatus('job-id', 'recruiter-id', JobStatus.PUBLISHED);

      expect(jobBoostServiceMock.invalidateActiveBoostForJob).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('ends any live boost when a job post is deleted', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({
        id: 'job-id',
        createdByRecruiterId: 'recruiter-id',
        companyId: 'company-id',
        status: JobStatus.PUBLISHED,
        moderationStatus: ModerationStatus.APPROVED,
      });
      prismaMock.jobPost.update.mockResolvedValue({ id: 'job-id' });

      await service.remove('job-id', 'recruiter-id');

      expect(jobBoostServiceMock.invalidateActiveBoostForJob).toHaveBeenCalledWith(
        'job-id',
        'JOB_CLOSED',
      );
    });
  });

  describe('updateVisibility', () => {
    it('should throw NotFoundException if job post does not exist', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(null);

      await expect(service.updateVisibility('job-id', { isHidden: true })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should successfully update job post visibility', async () => {
      const jobPost = {
        id: 'job-id',
        title: 'Developer',
        isHidden: false,
      };

      prismaMock.jobPost.findFirst.mockResolvedValue(jobPost);
      prismaMock.jobPost.update.mockResolvedValue({
        ...jobPost,
        isHidden: true,
      });

      const result = await service.updateVisibility('job-id', { isHidden: true });

      expect(prismaMock.jobPost.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-id', deletedAt: null },
      });
      expect(prismaMock.jobPost.update).toHaveBeenCalledWith({
        where: { id: 'job-id' },
        data: {
          isHidden: true,
        },
        include: expect.any(Object),
      });
      expect(result.message).toBe('Cập nhật trạng thái ẩn tin tuyển dụng thành công.');
      expect(result.jobPost.isHidden).toBe(true);
    });

    it('ends any live boost when a job post is hidden', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({ id: 'job-id', isHidden: false });
      prismaMock.jobPost.update.mockResolvedValue({ id: 'job-id', isHidden: true });

      await service.updateVisibility('job-id', { isHidden: true });

      expect(jobBoostServiceMock.invalidateActiveBoostForJob).toHaveBeenCalledWith(
        'job-id',
        'JOB_HIDDEN',
      );
    });

    it('does not touch any boost when unhiding a job post', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue({ id: 'job-id', isHidden: true });
      prismaMock.jobPost.update.mockResolvedValue({ id: 'job-id', isHidden: false });

      await service.updateVisibility('job-id', { isHidden: false });

      expect(jobBoostServiceMock.invalidateActiveBoostForJob).not.toHaveBeenCalled();
    });
  });
});
