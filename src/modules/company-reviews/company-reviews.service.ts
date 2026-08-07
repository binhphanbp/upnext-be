import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyReviewStatus, Prisma, ReportStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toPagination } from '../../common/dto/pagination-query.dto';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { UpdateCompanyReviewDto } from './dto/update-company-review.dto';
import { CreateCompanyReviewReportDto } from './dto/create-company-review-report.dto';
import { ListCompanyReviewReportsQueryDto } from './dto/list-company-review-reports-query.dto';
import { ListMyCompanyReviewsQueryDto } from './dto/list-my-company-reviews-query.dto';

const RATING_FIELDS = [
  'overallRating',
  'salaryBenefitsRating',
  'trainingLearningRating',
  'managementCareRating',
  'cultureFunRating',
  'officeWorkspaceRating',
  'overtimeSatisfaction',
] as const;

const PUBLIC_REVIEW_SELECT = {
  id: true,
  overallRating: true,
  summary: true,
  overtimeSatisfaction: true,
  overtimeReason: true,
  whatILove: true,
  improvementSuggestion: true,
  salaryBenefitsRating: true,
  trainingLearningRating: true,
  managementCareRating: true,
  cultureFunRating: true,
  officeWorkspaceRating: true,
  createdAt: true,
} satisfies Prisma.CompanyReviewSelect;

type PublicCompanyReview = Prisma.CompanyReviewGetPayload<{ select: typeof PUBLIC_REVIEW_SELECT }>;

function roundToOneDecimal(value: number | null) {
  return value === null ? null : Math.round(value * 10) / 10;
}

@Injectable()
export class CompanyReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getProfile(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) throw new NotFoundException('Không tìm thấy hồ sơ ứng viên.');
    return profile;
  }

  async createReview(candidateAccountId: string, companyId: string, dto: CreateCompanyReviewDto) {
    const profile = await this.getProfile(candidateAccountId);

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Không tìm thấy công ty.');

    const existing = await this.prisma.companyReview.findUnique({
      where: { candidateProfileId_companyId: { candidateProfileId: profile.id, companyId } },
    });
    if (existing) {
      throw new ConflictException('Bạn đã đánh giá công ty này rồi.');
    }

    return this.prisma.companyReview.create({
      data: {
        ...dto,
        candidateProfileId: profile.id,
        companyId,
        status: CompanyReviewStatus.APPROVED,
      },
    });
  }

  async getMyReview(candidateAccountId: string, companyId: string) {
    const profile = await this.getProfile(candidateAccountId);
    return this.prisma.companyReview.findUnique({
      where: { candidateProfileId_companyId: { candidateProfileId: profile.id, companyId } },
    });
  }

  async listReviews(companyId: string) {
    const reviews = await this.prisma.companyReview.findMany({
      where: { companyId, status: CompanyReviewStatus.APPROVED },
      select: PUBLIC_REVIEW_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: reviews,
      summary: this.buildSummary(reviews),
    };
  }

  /**
   * Recruiter-facing list of the reviews left on their own company.
   *
   * Hidden reviews are excluded, exactly as on the public page, so a recruiter never
   * sees content visitors cannot. Candidate identity is never joined in — reviews are
   * anonymous by design. Each row carries the caller's own report, if any, because the
   * report endpoint rejects duplicates and the UI has to know before offering the action.
   */
  async listMyCompanyReviews(
    recruiterUser: AuthenticatedUser,
    query: ListMyCompanyReviewsQueryDto,
  ) {
    if (!recruiterUser.companyId) {
      throw new ForbiddenException('Tài khoản của bạn chưa thuộc công ty nào.');
    }

    const companyWhere: Prisma.CompanyReviewWhereInput = {
      companyId: recruiterUser.companyId,
      status: CompanyReviewStatus.APPROVED,
    };
    const listWhere: Prisma.CompanyReviewWhereInput = query.overallRating
      ? { ...companyWhere, overallRating: query.overallRating }
      : companyWhere;

    const [items, total, aggregate, byRating] = await Promise.all([
      this.prisma.companyReview.findMany({
        where: listWhere,
        select: {
          ...PUBLIC_REVIEW_SELECT,
          reports: {
            where: { reporterRecruiterAccountId: recruiterUser.id },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, reason: true, createdAt: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        ...toPagination(query),
      }),
      this.prisma.companyReview.count({ where: listWhere }),
      // The summary describes the whole company, so it deliberately ignores the filter.
      this.prisma.companyReview.aggregate({
        where: companyWhere,
        _count: { _all: true },
        _avg: {
          overallRating: true,
          salaryBenefitsRating: true,
          trainingLearningRating: true,
          managementCareRating: true,
          cultureFunRating: true,
          officeWorkspaceRating: true,
          overtimeSatisfaction: true,
        },
      }),
      this.prisma.companyReview.groupBy({
        by: ['overallRating'],
        where: companyWhere,
        _count: { _all: true },
      }),
    ]);

    const ratingDistribution: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const group of byRating) {
      ratingDistribution[String(group.overallRating)] = group._count._all;
    }

    return {
      items: items.map(({ reports, ...review }) => ({
        ...review,
        myReport: reports[0] ?? null,
      })),
      summary: {
        totalReviews: aggregate._count._all,
        averageOverallRating: roundToOneDecimal(aggregate._avg.overallRating),
        averageBySection: {
          salaryBenefits: roundToOneDecimal(aggregate._avg.salaryBenefitsRating),
          trainingLearning: roundToOneDecimal(aggregate._avg.trainingLearningRating),
          managementCare: roundToOneDecimal(aggregate._avg.managementCareRating),
          cultureFun: roundToOneDecimal(aggregate._avg.cultureFunRating),
          officeWorkspace: roundToOneDecimal(aggregate._avg.officeWorkspaceRating),
          overtimeSatisfaction: roundToOneDecimal(aggregate._avg.overtimeSatisfaction),
        },
        ratingDistribution,
      },
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private buildSummary(reviews: PublicCompanyReview[]) {
    const totalReviews = reviews.length;
    const averages: Record<string, number | null> = {};

    for (const field of RATING_FIELDS) {
      const values = reviews
        .map((review) => review[field])
        .filter((value): value is number => typeof value === 'number');
      averages[field] = values.length
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
        : null;
    }

    return {
      totalReviews,
      averageOverallRating: averages.overallRating,
      averageBySection: {
        salaryBenefits: averages.salaryBenefitsRating,
        trainingLearning: averages.trainingLearningRating,
        managementCare: averages.managementCareRating,
        cultureFun: averages.cultureFunRating,
        officeWorkspace: averages.officeWorkspaceRating,
        overtimeSatisfaction: averages.overtimeSatisfaction,
      },
    };
  }

  private async getOwnedReview(reviewId: string, candidateAccountId: string) {
    const profile = await this.getProfile(candidateAccountId);

    const review = await this.prisma.companyReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');

    if (review.candidateProfileId !== profile.id) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên đánh giá này.');
    }

    return review;
  }

  async updateReview(reviewId: string, candidateAccountId: string, dto: UpdateCompanyReviewDto) {
    await this.getOwnedReview(reviewId, candidateAccountId);

    return this.prisma.companyReview.update({
      where: { id: reviewId },
      data: dto,
    });
  }

  async deleteReview(reviewId: string, candidateAccountId: string) {
    await this.getOwnedReview(reviewId, candidateAccountId);

    await this.prisma.companyReview.delete({
      where: { id: reviewId },
    });
  }

  async reportReview(
    reviewId: string,
    recruiterUser: AuthenticatedUser,
    dto: CreateCompanyReviewReportDto,
  ) {
    const review = await this.prisma.companyReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');

    if (!recruiterUser.companyId || recruiterUser.companyId !== review.companyId) {
      throw new ForbiddenException('Bạn chỉ có thể báo cáo đánh giá của công ty mình.');
    }

    const existing = await this.prisma.companyReviewReport.findUnique({
      where: {
        companyReviewId_reporterRecruiterAccountId: {
          companyReviewId: reviewId,
          reporterRecruiterAccountId: recruiterUser.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException('Bạn đã báo cáo đánh giá này rồi.');
    }

    return this.prisma.companyReviewReport.create({
      data: {
        companyReviewId: reviewId,
        reporterRecruiterAccountId: recruiterUser.id,
        reason: dto.reason,
      },
    });
  }

  async listReviewReports(query: ListCompanyReviewReportsQueryDto) {
    const where: Prisma.CompanyReviewReportWhereInput = query.status ? { status: query.status } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.companyReviewReport.findMany({
        where,
        include: {
          companyReview: { include: { company: { select: { id: true, name: true } } } },
          reporterRecruiterAccount: { select: { id: true, email: true, companyId: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...toPagination(query),
      }),
      this.prisma.companyReviewReport.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  private async getPendingReport(reportId: string) {
    const report = await this.prisma.companyReviewReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Không tìm thấy báo cáo.');

    if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.REVIEWING) {
      throw new BadRequestException('Báo cáo này đã được xử lý trước đó.');
    }

    return report;
  }

  async hideReportedReview(reportId: string, adminId: string) {
    const report = await this.getPendingReport(reportId);

    return this.prisma.$transaction(async (tx) => {
      await tx.companyReview.update({
        where: { id: report.companyReviewId },
        data: { status: CompanyReviewStatus.HIDDEN },
      });

      return tx.companyReviewReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.RESOLVED, handledByAdminId: adminId },
      });
    });
  }

  async dismissReviewReport(reportId: string, adminId: string) {
    await this.getPendingReport(reportId);

    return this.prisma.companyReviewReport.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.REJECTED,
        handledByAdminId: adminId,
      },
    });
  }
}
