import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActorType,
  CompanyReviewStatus,
  CompanyStatus,
  Prisma,
  ReportStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';

const RESTRICTED_TARGET_TYPE = 'COMPANY';
export const COMPANY_REVIEW_TARGET_TYPE = 'COMPANY_REVIEW';

/**
 * Both reporter relations are loaded because a report is filed by either a candidate or
 * a recruiter; `reporterType` says which one to read.
 */
const REPORT_INCLUDE = {
  evidenceFile: true,
  reporterCandidate: {
    select: { id: true, account: { select: { fullName: true, email: true } } },
  },
  reporterRecruiterAccount: {
    select: { id: true, email: true, company: { select: { id: true, name: true } } },
  },
  handledByAdmin: {
    select: { id: true, fullName: true, email: true },
  },
} satisfies Prisma.ReportInclude;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationLedger: ReputationLedgerService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateReportDto) {
    if (user.role !== ActorType.CANDIDATE) {
      throw new BadRequestException('Only Candidates can create reports.');
    }

    if (dto.evidenceFileId) {
      const file = await this.prisma.fileAsset.findUnique({
        where: { id: dto.evidenceFileId },
      });
      if (!file) {
        throw new NotFoundException('Evidence file not found');
      }
    }

    // Find candidate profile ID from candidateAccountId
    const candidateProfile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId: user.id },
    });
    if (!candidateProfile) {
      throw new NotFoundException('Candidate profile not found');
    }
    const reporterCandidateId = candidateProfile.id;

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          evidenceFileId: dto.evidenceFileId ?? null,
          reporterType: ActorType.CANDIDATE,
          reporterCandidateId,
          status: ReportStatus.PENDING,
        },
        include: REPORT_INCLUDE,
      });

      if (dto.targetType.toUpperCase() === RESTRICTED_TARGET_TYPE) {
        await this.activateRestrictedModeIfNeeded(tx, dto.targetId, dto.reason);
      }

      return report;
    });
  }

  /**
   * Files a report on behalf of a recruiter.
   *
   * Deliberately not reachable from `POST /reports`: that endpoint takes `targetType`
   * from the client, and a `COMPANY` report puts the company straight into Restricted
   * Mode with its reputation zeroed — so exposing it to recruiters would let one
   * restrict a competitor. Here the caller passes `targetType` from server code only,
   * and Restricted Mode is never triggered.
   */
  async createRecruiterReport(input: {
    reporterRecruiterAccountId: string;
    targetType: string;
    targetId: string;
    reason: string;
  }) {
    return this.prisma.report.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        reporterType: ActorType.RECRUITER,
        reporterRecruiterAccountId: input.reporterRecruiterAccountId,
        status: ReportStatus.PENDING,
      },
    });
  }

  /** A recruiter may only file one report per target. */
  async findRecruiterReport(input: {
    reporterRecruiterAccountId: string;
    targetType: string;
    targetId: string;
  }) {
    return this.prisma.report.findUnique({
      where: {
        targetType_targetId_reporterRecruiterAccountId: {
          targetType: input.targetType,
          targetId: input.targetId,
          reporterRecruiterAccountId: input.reporterRecruiterAccountId,
        },
      },
    });
  }

  /** Reports filed by one recruiter across a set of targets, for list screens. */
  async findRecruiterReportsByTargets(input: {
    reporterRecruiterAccountId: string;
    targetType: string;
    targetIds: string[];
  }) {
    if (input.targetIds.length === 0) return [];

    return this.prisma.report.findMany({
      where: {
        targetType: input.targetType,
        targetId: { in: input.targetIds },
        reporterRecruiterAccountId: input.reporterRecruiterAccountId,
      },
      select: { id: true, targetId: true, status: true, reason: true, createdAt: true },
    });
  }

  /**
   * Restricted Mode kích hoạt ngay khi có report mới nhắm vào 1 company (targetType=COMPANY),
   * kể cả khi report còn ở status PENDING chưa được admin xác nhận — theo đúng mô tả nghiệp vụ.
   * Điểm hiện tại được lưu snapshot để phục hồi nếu Appeal sau này được duyệt.
   *
   * Only ever called from the candidate `create` path. `createRecruiterReport` must never
   * reach this — a recruiter able to restrict a company could target a competitor.
   */
  private async activateRestrictedModeIfNeeded(
    tx: Prisma.TransactionClient,
    companyId: string,
    reportReason: string,
  ) {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { status: true, reputationScore: true },
    });
    if (!company || company.status === CompanyStatus.RESTRICTED) return;

    const currentScore = Number(company.reputationScore);

    await tx.company.update({
      where: { id: companyId },
      data: {
        status: CompanyStatus.RESTRICTED,
        scoreBeforeRestriction: company.reputationScore,
        restrictedAt: new Date(),
      },
    });

    await this.reputationLedger.applyDelta(
      tx,
      companyId,
      -currentScore,
      'RESTRICTED_BY_REPORT',
      `Bị hạn chế do có khiếu nại mới: ${reportReason}`,
    );
  }

  async findAllForAdmin(query: ListReportsQueryDto) {
    // Validate targetId if search term is a valid UUID
    let uuidSearch: string | undefined;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (query.q && uuidRegex.test(query.q.trim())) {
      uuidSearch = query.q.trim();
    }

    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.reporterRole ? { reporterType: query.reporterRole } : {}),
      ...(query.targetType
        ? { targetType: { equals: query.targetType, mode: 'insensitive' } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { reason: { contains: query.q, mode: 'insensitive' } },
              { targetType: { contains: query.q, mode: 'insensitive' } },
              ...(uuidSearch ? [{ targetId: { equals: uuidSearch } }] : []),
            ],
          }
        : {}),
    };

    const validSortFields = ['createdAt', 'updatedAt', 'targetType', 'status'];
    const sortBy = validSortFields.includes(query.sortBy || '') ? query.sortBy : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortBy!]: sortOrder };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: query.limit,
        orderBy,
        include: REPORT_INCLUDE,
      }),
      this.prisma.report.count({ where }),
    ]);

    // Attach target metadata dynamically
    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        const targetDetails = await this.resolveTargetDetails(item.targetType, item.targetId);
        return {
          ...item,
          targetDetails,
        };
      }),
    );

    const totalPages = Math.ceil(total / query.limit);

    return {
      items: itemsWithDetails,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
    };
  }

  async findOne(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: REPORT_INCLUDE,
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const targetDetails = await this.resolveTargetDetails(report.targetType, report.targetId);

    return {
      ...report,
      targetDetails,
    };
  }

  async updateStatus(id: string, adminId: string, status: ReportStatus) {
    const report = await this.findOne(id);

    // Resolving a report about a review is what actually hides that review, so this
    // transition mutates content and is guarded — unlike the other target types, where
    // the status is just a bookkeeping label an admin may revise freely.
    if (
      report.targetType.toUpperCase() === COMPANY_REVIEW_TARGET_TYPE &&
      status === ReportStatus.RESOLVED
    ) {
      if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.REVIEWING) {
        throw new BadRequestException('Báo cáo này đã được xử lý trước đó.');
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.companyReview.update({
          where: { id: report.targetId },
          data: { status: CompanyReviewStatus.HIDDEN },
        });

        return tx.report.update({
          where: { id },
          data: { status, handledByAdminId: adminId },
          include: REPORT_INCLUDE,
        });
      });
    }

    return this.prisma.report.update({
      where: { id },
      data: {
        status,
        handledByAdminId: adminId,
      },
      include: REPORT_INCLUDE,
    });
  }

  private async resolveTargetDetails(targetType: string, targetId: string) {
    try {
      switch (targetType.toUpperCase()) {
        case 'JOB_POST':
          return this.prisma.jobPost.findUnique({
            where: { id: targetId },
            select: {
              id: true,
              title: true,
              status: true,
              company: {
                select: {
                  name: true,
                },
              },
            },
          });
        case 'COMPANY':
          return this.prisma.company.findUnique({
            where: { id: targetId },
            select: {
              id: true,
              name: true,
              status: true,
              verificationStatus: true,
            },
          });
        case 'CANDIDATE':
          return this.prisma.candidateProfile.findUnique({
            where: { id: targetId },
            select: {
              id: true,
              account: {
                select: {
                  fullName: true,
                },
              },
            },
          });
        case 'POST':
          return this.prisma.post.findUnique({
            where: { id: targetId },
            select: {
              id: true,
              title: true,
              status: true,
            },
          });
        case COMPANY_REVIEW_TARGET_TYPE:
          return this.prisma.companyReview.findUnique({
            where: { id: targetId },
            select: {
              id: true,
              overallRating: true,
              summary: true,
              status: true,
              company: { select: { id: true, name: true } },
            },
          });
        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
