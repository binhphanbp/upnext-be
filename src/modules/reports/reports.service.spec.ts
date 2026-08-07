import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType, CompanyReviewStatus, ReportStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;

  const applyDelta = jest.fn();
  const prismaMock: any = {
    report: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    companyReview: { update: jest.fn(), findUnique: jest.fn() },
    candidateProfile: { findUnique: jest.fn() },
    company: { findUnique: jest.fn(), update: jest.fn() },
    fileAsset: { findUnique: jest.fn() },
    jobPost: { findUnique: jest.fn() },
    post: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prismaMock)),
  };

  const candidate: AuthenticatedUser = {
    id: 'candidate-account-id',
    email: 'candidate@test.dev',
    role: ActorType.CANDIDATE,
    permissions: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ReputationLedgerService, useValue: { applyDelta } },
      ],
    }).compile();

    service = module.get(ReportsService);
    jest.clearAllMocks();
  });

  describe('create (candidate)', () => {
    beforeEach(() => {
      prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'candidate-profile-id' });
      prismaMock.report.create.mockResolvedValue({ id: 'report-id' });
    });

    it('records the reporter as a candidate', async () => {
      await service.create(candidate, {
        targetType: 'JOB_POST',
        targetId: 'job-post-id',
        reason: 'Tin tuyển dụng sai sự thật',
      });

      expect(prismaMock.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reporterType: ActorType.CANDIDATE,
            reporterCandidateId: 'candidate-profile-id',
          }),
        }),
      );
    });

    it('puts a company into Restricted Mode when a candidate reports the company', async () => {
      prismaMock.company.findUnique.mockResolvedValue({ status: 'ACTIVE', reputationScore: 40 });

      await service.create(candidate, {
        targetType: 'COMPANY',
        targetId: 'company-id',
        reason: 'Công ty lừa đảo',
      });

      expect(prismaMock.company.update).toHaveBeenCalled();
      expect(applyDelta).toHaveBeenCalled();
    });
  });

  describe('createRecruiterReport', () => {
    it('records the reporter as a recruiter and never restricts a company', async () => {
      prismaMock.report.create.mockResolvedValue({ id: 'report-id' });

      await service.createRecruiterReport({
        reporterRecruiterAccountId: 'recruiter-account-id',
        targetType: 'COMPANY_REVIEW',
        targetId: 'review-id',
        reason: 'Đánh giá sai sự thật',
      });

      expect(prismaMock.report.create).toHaveBeenCalledWith({
        data: {
          targetType: 'COMPANY_REVIEW',
          targetId: 'review-id',
          reason: 'Đánh giá sai sự thật',
          reporterType: ActorType.RECRUITER,
          reporterRecruiterAccountId: 'recruiter-account-id',
          status: ReportStatus.PENDING,
        },
      });
      // A recruiter able to trigger Restricted Mode could knock out a competitor.
      expect(prismaMock.company.update).not.toHaveBeenCalled();
      expect(applyDelta).not.toHaveBeenCalled();
    });
  });

  describe('findAllForAdmin', () => {
    it('filters by who filed the report', async () => {
      prismaMock.report.findMany.mockResolvedValue([]);
      prismaMock.report.count.mockResolvedValue(0);

      await service.findAllForAdmin({
        page: 1,
        limit: 20,
        reporterRole: ActorType.RECRUITER,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(prismaMock.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ reporterType: ActorType.RECRUITER }),
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('hides the review when a company-review report is resolved', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-id',
        targetType: 'COMPANY_REVIEW',
        targetId: 'review-id',
        status: ReportStatus.PENDING,
      });
      prismaMock.companyReview.findUnique.mockResolvedValue({ id: 'review-id' });
      prismaMock.report.update.mockResolvedValue({ id: 'report-id' });

      await service.updateStatus('report-id', 'admin-id', ReportStatus.RESOLVED);

      expect(prismaMock.companyReview.update).toHaveBeenCalledWith({
        where: { id: 'review-id' },
        data: { status: CompanyReviewStatus.HIDDEN },
      });
    });

    it('refuses to resolve a company-review report that was already handled', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-id',
        targetType: 'COMPANY_REVIEW',
        targetId: 'review-id',
        status: ReportStatus.RESOLVED,
      });
      prismaMock.companyReview.findUnique.mockResolvedValue({ id: 'review-id' });

      await expect(
        service.updateStatus('report-id', 'admin-id', ReportStatus.RESOLVED),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.companyReview.update).not.toHaveBeenCalled();
    });

    it('leaves content untouched for other target types', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-id',
        targetType: 'JOB_POST',
        targetId: 'job-post-id',
        status: ReportStatus.PENDING,
      });
      prismaMock.jobPost.findUnique.mockResolvedValue({ id: 'job-post-id' });
      prismaMock.report.update.mockResolvedValue({ id: 'report-id' });

      await service.updateStatus('report-id', 'admin-id', ReportStatus.RESOLVED);

      expect(prismaMock.companyReview.update).not.toHaveBeenCalled();
    });

    it('still lets an admin revise the status of a non-review report', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-id',
        targetType: 'JOB_POST',
        targetId: 'job-post-id',
        status: ReportStatus.RESOLVED,
      });
      prismaMock.jobPost.findUnique.mockResolvedValue({ id: 'job-post-id' });
      prismaMock.report.update.mockResolvedValue({ id: 'report-id' });

      // The guard is scoped to the content-mutating branch only.
      await expect(
        service.updateStatus('report-id', 'admin-id', ReportStatus.PENDING),
      ).resolves.toBeDefined();
    });
  });
});
