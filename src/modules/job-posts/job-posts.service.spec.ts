import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JobPostsService } from './job-posts.service';
import { ModerationStatus } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('JobPostsService', () => {
  let service: JobPostsService;

  const prismaMock: any = {
    jobPost: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const notificationsServiceMock: any = {
    createNotification: jest.fn(),
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
      ],
    }).compile();

    service = module.get<JobPostsService>(JobPostsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

  describe('updateVisibility', () => {
    it('should throw NotFoundException if job post does not exist', async () => {
      prismaMock.jobPost.findFirst.mockResolvedValue(null);

      await expect(
        service.updateVisibility('job-id', { isHidden: true }),
      ).rejects.toThrow(NotFoundException);
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
  });
});
