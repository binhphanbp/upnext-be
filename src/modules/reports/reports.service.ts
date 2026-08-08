import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActorType,
  CompanyReviewStatus,
  CompanyStatus,
  Prisma,
  ReportStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REPUTATION_CONFIG } from '../reputation/reputation.config';
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
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationLedger: ReputationLedgerService,
    private readonly emailService: EmailService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateReportDto) {
    if (user.role !== ActorType.CANDIDATE) {
      throw new BadRequestException('Only Candidates can create reports.');
    }

    if (dto.evidenceFileId) {
      await this.assertEvidenceFileExists(dto.evidenceFileId);
    }

    // Find candidate profile ID from candidateAccountId
    const candidateProfile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId: user.id },
    });
    if (!candidateProfile) {
      throw new NotFoundException('Candidate profile not found');
    }
    const reporterCandidateId = candidateProfile.id;
    const targetId = await this.resolveTargetId(dto.targetType, dto.targetId);

    // Filing a report no longer restricts anything — that only happens once an admin
    // resolves it (see updateStatus). A single unverified complaint used to be enough to
    // zero a company's reputation, which made the report button a weapon.
    const report = await this.prisma.report.create({
      data: {
        targetType: dto.targetType,
        targetId,
        reason: dto.reason,
        evidenceFileId: dto.evidenceFileId ?? null,
        reporterType: ActorType.CANDIDATE,
        reporterCandidateId,
        status: ReportStatus.PENDING,
      },
      include: REPORT_INCLUDE,
    });

    await this.notifyAdminsOfNewReport({
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      reporterLabel:
        report.reporterCandidate?.account.fullName ??
        report.reporterCandidate?.account.email ??
        'Ứng viên',
    });

    return report;
  }

  /** Checks if candidate has an active (PENDING/REVIEWING) report for the target. */
  async findActiveCandidateReport(candidateAccountId: string, targetType: string, targetIdOrSlug: string) {
    const candidateProfile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      select: { id: true },
    });
    if (!candidateProfile) {
      return { hasActiveReport: false };
    }

    const targetId = await this.resolveTargetId(targetType, targetIdOrSlug);

    const activeReport = await this.prisma.report.findFirst({
      where: {
        reporterType: ActorType.CANDIDATE,
        reporterCandidateId: candidateProfile.id,
        targetType,
        targetId,
        status: { in: [ReportStatus.PENDING, ReportStatus.REVIEWING] },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasActiveReport: Boolean(activeReport),
      report: activeReport
        ? {
            id: activeReport.id,
            status: activeReport.status,
            createdAt: activeReport.createdAt,
          }
        : null,
    };
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
    evidenceFileId?: string | null;
  }) {
    if (input.evidenceFileId) {
      await this.assertEvidenceFileExists(input.evidenceFileId);
    }

    const report = await this.prisma.report.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        evidenceFileId: input.evidenceFileId ?? null,
        reporterType: ActorType.RECRUITER,
        reporterRecruiterAccountId: input.reporterRecruiterAccountId,
        status: ReportStatus.PENDING,
      },
    });

    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: input.reporterRecruiterAccountId },
      select: { email: true, company: { select: { name: true } } },
    });

    await this.notifyAdminsOfNewReport({
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      reporterLabel: recruiter?.company?.name
        ? `${recruiter.email} (${recruiter.company.name})`
        : (recruiter?.email ?? 'Nhà tuyển dụng'),
    });

    return report;
  }

  /** Guards against a dangling FK turning into a 500 on insert. */
  private async assertEvidenceFileExists(evidenceFileId: string) {
    const file = await this.prisma.fileAsset.findUnique({ where: { id: evidenceFileId } });
    if (!file) {
      throw new NotFoundException('Evidence file not found');
    }
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
   * Restricted Mode chỉ kích hoạt khi admin duyệt (RESOLVED) một báo cáo nhắm vào company.
   * Điểm hiện tại được lưu snapshot để phục hồi nếu Appeal sau này được duyệt
   * (xem AppealsService.liftRestriction).
   *
   * Only ever reached from the admin `updateStatus` path — never from report creation, so
   * an unverified complaint cannot restrict anyone.
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

      const updated = await this.prisma.$transaction(async (tx) => {
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

      await this.notifyReportOutcome(report, status);
      return updated;
    }

    // Approving a report against a company is what puts it into Restricted Mode. Same
    // guard as above: this mutates the company, so it must not run twice.
    if (report.targetType.toUpperCase() === RESTRICTED_TARGET_TYPE && status === ReportStatus.RESOLVED) {
      if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.REVIEWING) {
        throw new BadRequestException('Báo cáo này đã được xử lý trước đó.');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        await this.activateRestrictedModeIfNeeded(tx, report.targetId, report.reason);

        return tx.report.update({
          where: { id },
          data: { status, handledByAdminId: adminId },
          include: REPORT_INCLUDE,
        });
      });

      await this.notifyReportOutcome(report, status);
      return updated;
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status,
        handledByAdminId: adminId,
      },
      include: REPORT_INCLUDE,
    });

    await this.notifyReportOutcome(report, status);
    return updated;
  }

  /**
   * Notifications are best-effort: a moderation action must not fail because SMTP is
   * down, and none of these run inside the transaction that changed the data.
   */
  private async notify(what: string, send: () => Promise<void>) {
    try {
      await send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không gửi được email ${what}: ${message}`);
    }
  }

  /** Human-readable name of a reported target, for email subjects and detail rows. */
  private async describeTarget(targetType: string, targetId: string) {
    const details = await this.resolveTargetDetails(targetType, targetId);
    if (!details) return `${targetType} ${targetId}`;

    if ('title' in details && details.title) return details.title;
    if ('name' in details && details.name) return details.name;
    if ('summary' in details) {
      return `Đánh giá ${details.overallRating}★ về ${details.company.name}`;
    }
    if ('account' in details) return details.account.fullName;
    return `${targetType} ${targetId}`;
  }

  private async notifyAdminsOfNewReport(input: {
    targetType: string;
    targetId: string;
    reason: string;
    reporterLabel: string;
  }) {
    await this.notify('báo cáo mới tới admin', async () => {
      const [admins, targetLabel] = await Promise.all([
        this.prisma.adminUser.findMany({
          where: { status: 'ACTIVE', role: { status: 'ACTIVE' } },
          select: { email: true, fullName: true },
        }),
        this.describeTarget(input.targetType, input.targetId),
      ]);

      await Promise.all(
        admins.map((admin) =>
          this.emailService.sendReportSubmittedToAdmin({
            to: admin.email,
            adminName: admin.fullName,
            targetLabel,
            reporterLabel: input.reporterLabel,
            reason: input.reason,
          }),
        ),
      );
    });
  }

  /** Tells the reporter how their report was handled, and the affected party what changed. */
  private async notifyReportOutcome(
    report: Prisma.ReportGetPayload<{ include: typeof REPORT_INCLUDE }>,
    status: ReportStatus,
  ) {
    if (status !== ReportStatus.RESOLVED && status !== ReportStatus.REJECTED) return;

    const approved = status === ReportStatus.RESOLVED;
    const targetType = report.targetType.toUpperCase();

    await this.notify('kết quả báo cáo tới người báo cáo', async () => {
      const reporterEmail =
        report.reporterCandidate?.account.email ?? report.reporterRecruiterAccount?.email;
      if (!reporterEmail) return;

      await this.emailService.sendReportOutcomeToReporter({
        to: reporterEmail,
        recipientName: report.reporterCandidate?.account.fullName ?? reporterEmail,
        targetLabel: await this.describeTarget(report.targetType, report.targetId),
        approved,
      });
    });

    if (!approved) return;

    if (targetType === RESTRICTED_TARGET_TYPE) {
      await this.notify('hạn chế doanh nghiệp tới nhà tuyển dụng', async () => {
        const company = await this.prisma.company.findUnique({
          where: { id: report.targetId },
          select: {
            name: true,
            // The display name lives on the profile, not the account.
            recruiterAccounts: {
              select: { email: true, profile: { select: { fullName: true } } },
            },
          },
        });
        if (!company) return;

        await Promise.all(
          company.recruiterAccounts.map((recruiter) =>
            this.emailService.sendCompanyRestrictedToRecruiter({
              to: recruiter.email,
              recipientName: recruiter.profile?.fullName || recruiter.email,
              companyName: company.name,
              reason: report.reason,
              appealWindowDays: REPUTATION_CONFIG.APPEAL_WINDOW_DAYS,
            }),
          ),
        );
      });
      return;
    }

    if (targetType === COMPANY_REVIEW_TARGET_TYPE) {
      await this.notify('ẩn đánh giá tới người đánh giá', async () => {
        const review = await this.prisma.companyReview.findUnique({
          where: { id: report.targetId },
          select: {
            company: { select: { name: true } },
            candidateProfile: { select: { account: { select: { email: true, fullName: true } } } },
          },
        });
        if (!review) return;

        await this.emailService.sendReviewHiddenToReviewer({
          to: review.candidateProfile.account.email,
          recipientName: review.candidateProfile.account.fullName,
          companyName: review.company.name,
          reason: report.reason,
        });
      });
    }
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

  private async resolveTargetId(targetType: string, targetIdOrSlug: string): Promise<string> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrSlug);
    if (isUuid) {
      return targetIdOrSlug;
    }

    try {
      switch (targetType.toUpperCase()) {
        case 'COMPANY': {
          if (typeof this.prisma.company?.findFirst === 'function') {
            const company = await this.prisma.company.findFirst({
              where: { OR: [{ id: targetIdOrSlug }, { slug: targetIdOrSlug }] },
              select: { id: true },
            });
            if (company) return company.id;
          }
          break;
        }
        case 'JOB_POST': {
          if (typeof this.prisma.jobPost?.findFirst === 'function') {
            const job = await this.prisma.jobPost.findFirst({
              where: { OR: [{ id: targetIdOrSlug }, { slug: targetIdOrSlug }] },
              select: { id: true },
            });
            if (job) return job.id;
          }
          break;
        }
        case 'POST': {
          if (typeof this.prisma.post?.findFirst === 'function') {
            const post = await this.prisma.post.findFirst({
              where: { OR: [{ id: targetIdOrSlug }, { slug: targetIdOrSlug }] },
              select: { id: true },
            });
            if (post) return post.id;
          }
          break;
        }
      }
    } catch {
      // Fall back to targetIdOrSlug on any lookup error
    }

    return targetIdOrSlug;
  }
}
