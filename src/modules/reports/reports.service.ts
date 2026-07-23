import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, CompanyStatus, Prisma, ReportStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';

const RESTRICTED_TARGET_TYPE = 'COMPANY';

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
          reporterCandidateId,
          status: ReportStatus.PENDING,
        },
        include: {
          evidenceFile: true,
          reporterCandidate: {
            select: {
              id: true,
              account: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
      });

      if (dto.targetType.toUpperCase() === RESTRICTED_TARGET_TYPE) {
        await this.activateRestrictedModeIfNeeded(tx, dto.targetId, dto.reason);
      }

      return report;
    });
  }

  /**
   * Restricted Mode kích hoạt ngay khi có report mới nhắm vào 1 company (targetType=COMPANY),
   * kể cả khi report còn ở status PENDING chưa được admin xác nhận — theo đúng mô tả nghiệp vụ.
   * Điểm hiện tại được lưu snapshot để phục hồi nếu Appeal sau này được duyệt.
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
        include: {
          evidenceFile: true,
          reporterCandidate: {
            select: {
              id: true,
              account: {
                select: {
                  fullName: true,
                },
              },
            },
          },

          handledByAdmin: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
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
      include: {
        evidenceFile: true,
        reporterCandidate: {
          select: {
            id: true,
            account: {
              select: {
                fullName: true,
              },
            },
          },
        },

        handledByAdmin: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
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
    // Check if report exists
    await this.findOne(id);

    return this.prisma.report.update({
      where: { id },
      data: {
        status,
        handledByAdminId: adminId,
      },
      include: {
        evidenceFile: true,
        reporterCandidate: {
          select: {
            id: true,
            account: {
              select: {
                fullName: true,
              },
            },
          },
        },

        handledByAdmin: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
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
        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
