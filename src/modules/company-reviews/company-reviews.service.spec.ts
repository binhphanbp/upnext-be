import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType, CompanyReviewStatus, ReportStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { CompanyReviewsService } from './company-reviews.service';

describe('CompanyReviewsService', () => {
  let service: CompanyReviewsService;

  const prismaMock: any = {
    companyReview: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  const reportsServiceMock = {
    findRecruiterReport: jest.fn(),
    findRecruiterReportsByTargets: jest.fn(),
    createRecruiterReport: jest.fn(),
  };

  const recruiter: AuthenticatedUser = {
    id: 'recruiter-account-id',
    email: 'recruiter@test.dev',
    role: ActorType.RECRUITER,
    companyId: 'company-id',
    permissions: [],
  };

  function arrangeEmptyStats() {
    prismaMock.companyReview.count.mockResolvedValue(0);
    prismaMock.companyReview.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _avg: {
        overallRating: null,
        salaryBenefitsRating: null,
        trainingLearningRating: null,
        managementCareRating: null,
        cultureFunRating: null,
        officeWorkspaceRating: null,
        overtimeSatisfaction: null,
      },
    });
    prismaMock.companyReview.groupBy.mockResolvedValue([]);
    reportsServiceMock.findRecruiterReportsByTargets.mockResolvedValue([]);
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyReviewsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ReportsService, useValue: reportsServiceMock },
      ],
    }).compile();

    service = module.get(CompanyReviewsService);
    jest.clearAllMocks();
  });

  describe('listMyCompanyReviews', () => {
    it('rejects a recruiter who is not attached to a company', async () => {
      await expect(
        service.listMyCompanyReviews({ ...recruiter, companyId: null }, { page: 1, limit: 20 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('never exposes reviews the admin has hidden', async () => {
      prismaMock.companyReview.findMany.mockResolvedValue([]);
      arrangeEmptyStats();

      await service.listMyCompanyReviews(recruiter, { page: 1, limit: 20 });

      expect(prismaMock.companyReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-id',
            status: CompanyReviewStatus.APPROVED,
          }),
        }),
      );
    });

    it('stitches the caller-owned report onto each review', async () => {
      prismaMock.companyReview.findMany.mockResolvedValue([
        {
          id: 'review-1',
          overallRating: 2,
          candidateProfile: { id: 'profile-1', account: { fullName: 'Nguyễn Văn A' } },
        },
        {
          id: 'review-2',
          overallRating: 5,
          candidateProfile: { id: 'profile-2', account: { fullName: 'Trần Thị B' } },
        },
      ]);
      arrangeEmptyStats();
      // Reports live on the polymorphic Report table, so they arrive from a second query
      // keyed by targetId rather than through a Prisma relation.
      reportsServiceMock.findRecruiterReportsByTargets.mockResolvedValue([
        {
          id: 'report-id',
          targetId: 'review-1',
          status: ReportStatus.PENDING,
          reason: 'Nội dung sai sự thật',
          createdAt: new Date('2026-08-01'),
        },
      ]);

      const result = await service.listMyCompanyReviews(recruiter, { page: 1, limit: 20 });

      expect(reportsServiceMock.findRecruiterReportsByTargets).toHaveBeenCalledWith({
        reporterRecruiterAccountId: 'recruiter-account-id',
        targetType: 'COMPANY_REVIEW',
        targetIds: ['review-1', 'review-2'],
      });
      // Reporting twice is a 409, so the UI needs this to decide whether to offer it.
      expect(result.items[0]?.myReport).toEqual({
        id: 'report-id',
        status: ReportStatus.PENDING,
        reason: 'Nội dung sai sự thật',
        createdAt: new Date('2026-08-01'),
      });
      expect(result.items[1]?.myReport).toBeNull();
    });

    it('names the reviewer without leaking the rest of their profile', async () => {
      prismaMock.companyReview.findMany.mockResolvedValue([
        {
          id: 'review-1',
          overallRating: 2,
          candidateProfile: { id: 'profile-1', account: { fullName: 'Nguyễn Văn A' } },
        },
      ]);
      arrangeEmptyStats();
      reportsServiceMock.findRecruiterReportsByTargets.mockResolvedValue([]);

      const result = await service.listMyCompanyReviews(recruiter, { page: 1, limit: 20 });

      expect(result.items[0]?.reviewer).toEqual({ id: 'profile-1', fullName: 'Nguyễn Văn A' });
      // The raw profile carries phone/gender/birthdate/address — it must not be passed through.
      expect(result.items[0]).not.toHaveProperty('candidateProfile');
    });

    it('keeps the summary describing the whole company when a rating filter is applied', async () => {
      prismaMock.companyReview.findMany.mockResolvedValue([]);
      reportsServiceMock.findRecruiterReportsByTargets.mockResolvedValue([]);
      prismaMock.companyReview.count.mockResolvedValue(1);
      prismaMock.companyReview.aggregate.mockResolvedValue({
        _count: { _all: 4 },
        _avg: {
          overallRating: 3.666_666,
          salaryBenefitsRating: null,
          trainingLearningRating: null,
          managementCareRating: null,
          cultureFunRating: null,
          officeWorkspaceRating: null,
          overtimeSatisfaction: null,
        },
      });
      prismaMock.companyReview.groupBy.mockResolvedValue([
        { overallRating: 1, _count: { _all: 1 } },
        { overallRating: 5, _count: { _all: 3 } },
      ]);

      const result = await service.listMyCompanyReviews(recruiter, {
        page: 1,
        limit: 20,
        overallRating: 1,
      });

      // The list narrows to 1-star, but the header still reports all four reviews.
      expect(prismaMock.companyReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ overallRating: 1 }) }),
      );
      expect(prismaMock.companyReview.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.not.objectContaining({ overallRating: 1 }) }),
      );
      expect(result.summary.totalReviews).toBe(4);
      expect(result.summary.averageOverallRating).toBe(3.7);
      expect(result.summary.ratingDistribution).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 3 });
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });
  });

  describe('reportReview', () => {
    const dto = { reason: 'Đánh giá sai sự thật' };

    it('only lets a recruiter report a review of their own company', async () => {
      prismaMock.companyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        companyId: 'another-company',
      });

      await expect(service.reportReview('review-1', recruiter, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(reportsServiceMock.createRecruiterReport).not.toHaveBeenCalled();
    });

    it('writes to the shared reports table with a server-set target type', async () => {
      prismaMock.companyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        companyId: 'company-id',
      });
      reportsServiceMock.findRecruiterReport.mockResolvedValue(null);
      reportsServiceMock.createRecruiterReport.mockResolvedValue({ id: 'report-id' });

      await service.reportReview('review-1', recruiter, dto);

      // targetType must come from server code — a client-supplied 'COMPANY' would put a
      // company into Restricted Mode, which a recruiter must never be able to trigger.
      expect(reportsServiceMock.createRecruiterReport).toHaveBeenCalledWith({
        reporterRecruiterAccountId: 'recruiter-account-id',
        targetType: 'COMPANY_REVIEW',
        targetId: 'review-1',
        reason: dto.reason,
      });
    });

    it('rejects a second report from the same recruiter', async () => {
      prismaMock.companyReview.findUnique.mockResolvedValue({
        id: 'review-1',
        companyId: 'company-id',
      });
      reportsServiceMock.findRecruiterReport.mockResolvedValue({ id: 'existing-report' });

      await expect(service.reportReview('review-1', recruiter, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(reportsServiceMock.createRecruiterReport).not.toHaveBeenCalled();
    });
  });
});
