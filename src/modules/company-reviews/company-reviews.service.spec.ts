import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType, CompanyReviewStatus, ReportStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CompanyReviewsService } from './company-reviews.service';

describe('CompanyReviewsService', () => {
  let service: CompanyReviewsService;

  const prismaMock: any = {
    companyReview: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
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
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompanyReviewsService, { provide: PrismaService, useValue: prismaMock }],
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

    it('flattens the caller-owned report onto each review', async () => {
      const report = {
        id: 'report-id',
        status: ReportStatus.PENDING,
        reason: 'Nội dung sai sự thật',
        createdAt: new Date('2026-08-01'),
      };
      prismaMock.companyReview.findMany.mockResolvedValue([
        { id: 'review-1', overallRating: 2, reports: [report] },
        { id: 'review-2', overallRating: 5, reports: [] },
      ]);
      arrangeEmptyStats();

      const result = await service.listMyCompanyReviews(recruiter, { page: 1, limit: 20 });

      // Reporting twice is a 409, so the UI needs this to decide whether to offer it.
      expect(result.items[0]).toEqual({ id: 'review-1', overallRating: 2, myReport: report });
      expect(result.items[1]).toEqual({ id: 'review-2', overallRating: 5, myReport: null });
    });

    it('keeps the summary describing the whole company when a rating filter is applied', async () => {
      prismaMock.companyReview.findMany.mockResolvedValue([]);
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
});
