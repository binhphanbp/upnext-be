import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType, CompanyReviewStatus, ReportStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../common/email/email.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;

  const applyDelta = jest.fn();
  const emailServiceMock = {
    sendReportSubmittedToAdmin: jest.fn(),
    sendReportOutcomeToReporter: jest.fn(),
    sendCompanyRestrictedToRecruiter: jest.fn(),
    sendReviewHiddenToReviewer: jest.fn(),
  };
  const prismaMock: any = {
    report: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    companyReview: { update: jest.fn(), findUnique: jest.fn() },
    candidateProfile: { findUnique: jest.fn() },
    company: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    fileAsset: { findUnique: jest.fn(), count: jest.fn() },
    adminUser: { findMany: jest.fn().mockResolvedValue([]) },
    recruiterAccount: { findUnique: jest.fn() },
    jobPost: { findUnique: jest.fn(), findFirst: jest.fn() },
    post: { findUnique: jest.fn(), findFirst: jest.fn() },
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
        { provide: EmailService, useValue: emailServiceMock },
      ],
    }).compile();

    service = module.get(ReportsService);
    jest.clearAllMocks();
    prismaMock.adminUser.findMany.mockResolvedValue([]);
  });

  describe('create (candidate)', () => {
    beforeEach(() => {
      prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'candidate-profile-id' });
      prismaMock.report.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'report-id',
          ...data,
          reporterCandidate: { account: { fullName: 'Nguyễn Văn A', email: 'candidate@test.dev' } },
        }),
      );
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

    it('does not restrict the company while the report is still unverified', async () => {
      prismaMock.company.findUnique.mockResolvedValue({ status: 'ACTIVE', reputationScore: 40 });

      await service.create(candidate, {
        targetType: 'COMPANY',
        targetId: 'company-id',
        reason: 'Công ty lừa đảo',
      });

      // Otherwise one unverified complaint would zero a company's reputation.
      expect(prismaMock.company.update).not.toHaveBeenCalled();
      expect(applyDelta).not.toHaveBeenCalled();
    });

    it('emails every active admin about the new report', async () => {
      prismaMock.adminUser.findMany.mockResolvedValue([
        { email: 'admin@upnext.dev', fullName: 'Quản trị viên' },
      ]);
      prismaMock.jobPost.findUnique.mockResolvedValue({ id: 'job-post-id', title: 'Backend Dev' });

      await service.create(candidate, {
        targetType: 'JOB_POST',
        targetId: 'job-post-id',
        reason: 'Tin tuyển dụng sai sự thật',
      });

      expect(emailServiceMock.sendReportSubmittedToAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin@upnext.dev', targetLabel: 'Backend Dev' }),
      );
    });

    it('still creates the report when the notification fails', async () => {
      prismaMock.adminUser.findMany.mockRejectedValue(new Error('SMTP down'));

      // A moderation action must not depend on the mail server being up.
      await expect(
        service.create(candidate, {
          targetType: 'JOB_POST',
          targetId: 'job-post-id',
          reason: 'Tin tuyển dụng sai sự thật',
        }),
      ).resolves.toBeDefined();
    });

    it('refuses any candidate report aimed at a company review', async () => {
      // Only the reviewed company may report a review, through the RECRUITER-only
      // endpoint. `targetType` comes from the client here, so this is where that rule
      // has to hold — resolving such a report is what hides the review.
      await expect(
        service.create(candidate, {
          targetType: 'COMPANY_REVIEW',
          targetId: '11111111-1111-4111-8111-111111111111',
          reason: 'Đánh giá này sai sự thật',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.report.create).not.toHaveBeenCalled();
    });

    it('refuses a report a candidate files on their own profile', async () => {
      await expect(
        service.create(candidate, {
          targetType: 'CANDIDATE',
          targetId: 'candidate-profile-id',
          reason: 'Tự báo cáo chính mình',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.report.create).not.toHaveBeenCalled();
    });

    it('still accepts a report on another candidate profile', async () => {
      await expect(
        service.create(candidate, {
          targetType: 'CANDIDATE',
          targetId: 'another-candidate-profile',
          reason: 'Hồ sơ giả mạo',
        }),
      ).resolves.toBeDefined();
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
          evidenceFileId: null,
          reporterType: ActorType.RECRUITER,
          reporterRecruiterAccountId: 'recruiter-account-id',
          status: ReportStatus.PENDING,
          evidences: { create: [] },
        },
      });
      // A recruiter able to trigger Restricted Mode could knock out a competitor.
      expect(prismaMock.company.update).not.toHaveBeenCalled();
      expect(applyDelta).not.toHaveBeenCalled();
    });

    it('stores every evidence image in order and mirrors the first onto the legacy column', async () => {
      prismaMock.report.create.mockResolvedValue({ id: 'report-id' });
      prismaMock.fileAsset.count.mockResolvedValue(3);

      await service.createRecruiterReport({
        reporterRecruiterAccountId: 'recruiter-account-id',
        targetType: 'COMPANY_REVIEW',
        targetId: 'review-id',
        reason: 'Đánh giá sai sự thật',
        // The same file sent twice would violate the (report, file) unique index.
        evidenceFileIds: ['file-a', 'file-b', 'file-a', 'file-c'],
      });

      expect(prismaMock.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          evidenceFileId: 'file-a',
          evidences: {
            create: [
              { fileId: 'file-a', position: 0 },
              { fileId: 'file-b', position: 1 },
              { fileId: 'file-c', position: 2 },
            ],
          },
        }),
      });
    });

    it('refuses more evidence images than the cap allows', async () => {
      prismaMock.fileAsset.count.mockResolvedValue(6);

      await expect(
        service.createRecruiterReport({
          reporterRecruiterAccountId: 'recruiter-account-id',
          targetType: 'COMPANY_REVIEW',
          targetId: 'review-id',
          reason: 'Đánh giá sai sự thật',
          evidenceFileIds: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.report.create).not.toHaveBeenCalled();
    });

    it('refuses an evidence id that points at no file', async () => {
      prismaMock.fileAsset.count.mockResolvedValue(1);

      await expect(
        service.createRecruiterReport({
          reporterRecruiterAccountId: 'recruiter-account-id',
          targetType: 'COMPANY_REVIEW',
          targetId: 'review-id',
          reason: 'Đánh giá sai sự thật',
          evidenceFileIds: ['real-file', 'ghost-file'],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.report.create).not.toHaveBeenCalled();
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

    it('restricts the company only when the admin approves the report', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-id',
        targetType: 'COMPANY',
        targetId: 'company-id',
        reason: 'Công ty lừa đảo',
        status: ReportStatus.PENDING,
      });
      prismaMock.company.findUnique.mockResolvedValue({ status: 'ACTIVE', reputationScore: 40 });
      prismaMock.report.update.mockResolvedValue({ id: 'report-id' });

      await service.updateStatus('report-id', 'admin-id', ReportStatus.RESOLVED);

      expect(prismaMock.company.update).toHaveBeenCalled();
      expect(applyDelta).toHaveBeenCalled();
    });

    it('emails the company and the reporter once the restriction lands', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-id',
        targetType: 'COMPANY',
        targetId: 'company-id',
        reason: 'Công ty lừa đảo',
        status: ReportStatus.PENDING,
        reporterCandidate: {
          account: { fullName: 'Nguyễn Văn A', email: 'candidate@test.dev' },
        },
      });
      prismaMock.company.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        reputationScore: 40,
        name: 'Công ty ABC',
        recruiterAccounts: [{ email: 'hr@abc.dev', fullName: 'HR ABC' }],
      });
      prismaMock.report.update.mockResolvedValue({ id: 'report-id' });

      await service.updateStatus('report-id', 'admin-id', ReportStatus.RESOLVED);

      expect(emailServiceMock.sendCompanyRestrictedToRecruiter).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'hr@abc.dev', companyName: 'Công ty ABC' }),
      );
      expect(emailServiceMock.sendReportOutcomeToReporter).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'candidate@test.dev', approved: true }),
      );
    });

    it('does not restrict the company when the admin rejects the report', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-id',
        targetType: 'COMPANY',
        targetId: 'company-id',
        reason: 'Công ty lừa đảo',
        status: ReportStatus.PENDING,
      });
      prismaMock.company.findUnique.mockResolvedValue({ status: 'ACTIVE', reputationScore: 40 });
      prismaMock.report.update.mockResolvedValue({ id: 'report-id' });

      await service.updateStatus('report-id', 'admin-id', ReportStatus.REJECTED);

      expect(prismaMock.company.update).not.toHaveBeenCalled();
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

  describe('findActiveCandidateReport', () => {
    it('returns hasActiveReport true when candidate has a PENDING report', async () => {
      prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'candidate-profile-id' });
      prismaMock.report.findFirst.mockResolvedValue({
        id: 'report-id-1',
        status: ReportStatus.PENDING,
        createdAt: new Date(),
      });

      const result = await service.findActiveCandidateReport(
        'candidate-account-id',
        'COMPANY',
        'company-id',
      );

      expect(result.hasActiveReport).toBe(true);
      expect(result.report?.id).toBe('report-id-1');
    });

    it('returns hasActiveReport false when candidate has no active report', async () => {
      prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'candidate-profile-id' });
      prismaMock.report.findFirst.mockResolvedValue(null);

      const result = await service.findActiveCandidateReport(
        'candidate-account-id',
        'COMPANY',
        'company-id',
      );

      expect(result.hasActiveReport).toBe(false);
    });
  });
});
