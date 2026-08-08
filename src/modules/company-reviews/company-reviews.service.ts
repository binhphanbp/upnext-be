import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyReviewStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toPagination } from '../../common/dto/pagination-query.dto';
import {
  COMPANY_REVIEW_TARGET_TYPE,
  ReportsService,
} from '../reports/reports.service';
import { CreateCompanyReviewDto } from './dto/create-company-review.dto';
import { UpdateCompanyReviewDto } from './dto/update-company-review.dto';
import { CreateCompanyReviewReportDto } from './dto/create-company-review-report.dto';
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

/**
 * Reviews are attributed, not anonymous — but only the reviewer's name is exposed.
 * The profile also holds phoneNumber, gender, birthdate, address and jobSearchStatus,
 * none of which belong on a public page, so this selects the name and nothing else.
 */
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
  candidateProfile: {
    select: {
      id: true,
      account: { select: { fullName: true } },
    },
  },
} satisfies Prisma.CompanyReviewSelect;

type PublicCompanyReview = Prisma.CompanyReviewGetPayload<{ select: typeof PUBLIC_REVIEW_SELECT }>;

function roundToOneDecimal(value: number | null) {
  return value === null ? null : Math.round(value * 10) / 10;
}

/** Flattens the reviewer to just an id and a display name for the client. */
function toReviewer(review: PublicCompanyReview) {
  return {
    id: review.candidateProfile.id,
    fullName: review.candidateProfile.account.fullName,
  };
}

function withReviewer(review: PublicCompanyReview) {
  const { candidateProfile: _candidateProfile, ...rest } = review;
  return { ...rest, reviewer: toReviewer(review) };
}

function computeOverallRatingFromDto(dto: Record<string, any>): number {
  const ratings = [
    dto.salaryBenefitsRating,
    dto.trainingLearningRating,
    dto.managementCareRating,
    dto.cultureFunRating,
    dto.officeWorkspaceRating,
    dto.overtimeSatisfaction,
  ].filter((v): v is number => typeof v === 'number' && v > 0);

  if (ratings.length === 0) return dto.overallRating || 1;
  const sum = ratings.reduce((acc, r) => acc + r, 0);
  return Math.max(1, Math.min(5, Math.round(sum / ratings.length)));
}

@Injectable()
export class CompanyReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

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

    const calculatedOverall = computeOverallRatingFromDto(dto);

    return this.prisma.companyReview.create({
      data: {
        ...dto,
        overallRating: calculatedOverall,
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
      items: reviews.map(withReviewer),
      summary: this.buildSummary(reviews),
    };
  }

  /**
   * Recruiter-facing list of the reviews left on their own company.
   *
   * Hidden reviews are excluded, exactly as on the public page, so a recruiter never
   * sees content visitors cannot. The reviewer's name is shown — the same name the public
   * page shows, nothing more. Each row carries the caller's own report, if any, because
   * the report endpoint rejects duplicates and the UI has to know before offering the action.
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
        select: PUBLIC_REVIEW_SELECT,
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

    // Reports live on the polymorphic `Report` table, so there is no relation to include
    // — they are fetched for this page's reviews and stitched on afterwards.
    const myReports = await this.reportsService.findRecruiterReportsByTargets({
      reporterRecruiterAccountId: recruiterUser.id,
      targetType: COMPANY_REVIEW_TARGET_TYPE,
      targetIds: items.map((review) => review.id),
    });
    const myReportByReviewId = new Map(myReports.map((report) => [report.targetId, report]));

    return {
      items: items.map((review) => {
        const report = myReportByReviewId.get(review.id);
        return {
          ...withReviewer(review),
          myReport: report
            ? {
                id: report.id,
                status: report.status,
                reason: report.reason,
                createdAt: report.createdAt,
              }
            : null,
        };
      }),
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
    const existing = await this.getOwnedReview(reviewId, candidateAccountId);

    const merged = { ...existing, ...dto };
    const calculatedOverall = computeOverallRatingFromDto(merged);

    return this.prisma.companyReview.update({
      where: { id: reviewId },
      data: {
        ...dto,
        overallRating: calculatedOverall,
      },
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

    const existing = await this.reportsService.findRecruiterReport({
      reporterRecruiterAccountId: recruiterUser.id,
      targetType: COMPANY_REVIEW_TARGET_TYPE,
      targetId: reviewId,
    });
    if (existing) {
      throw new ConflictException('Bạn đã báo cáo đánh giá này rồi.');
    }

    // Authorization stays here; the write goes through the shared reports table so the
    // admin has one moderation queue. `targetType` is supplied by this server code, not
    // by the request — see createRecruiterReport for why that matters.
    return this.reportsService.createRecruiterReport({
      reporterRecruiterAccountId: recruiterUser.id,
      targetType: COMPANY_REVIEW_TARGET_TYPE,
      targetId: reviewId,
      reason: dto.reason,
      evidenceFileId: dto.evidenceFileId,
    });
  }

}
