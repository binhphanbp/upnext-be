import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AppealStatus, CompanyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { REPUTATION_CONFIG } from '../reputation/reputation.config';
import { CreateAppealDto } from './dto/create-appeal.dto';

const RESTRICTION_TARGET_TYPE = 'COMPANY';

@Injectable()
export class AppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationLedger: ReputationLedgerService,
  ) {}

  async create(recruiterId: string, dto: CreateAppealDto) {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
      select: {
        companyId: true,
        company: { select: { status: true, restrictedAt: true } },
      },
    });

    if (!recruiter?.companyId || !recruiter.company) {
      throw new ForbiddenException('Recruiter account has not been attached to a company');
    }
    if (recruiter.company.status !== CompanyStatus.RESTRICTED || !recruiter.company.restrictedAt) {
      throw new BadRequestException('Company is not currently in Restricted Mode');
    }

    const windowMs = REPUTATION_CONFIG.APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - recruiter.company.restrictedAt.getTime() > windowMs) {
      throw new BadRequestException(
        `Appeal window (${REPUTATION_CONFIG.APPEAL_WINDOW_DAYS} days) has expired for this restriction`,
      );
    }

    const existingPending = await this.prisma.appeal.findFirst({
      where: {
        recruiterAccountId: recruiterId,
        targetType: RESTRICTION_TARGET_TYPE,
        targetId: recruiter.companyId,
        status: AppealStatus.PENDING,
      },
      select: { id: true },
    });
    if (existingPending) {
      throw new ConflictException('An appeal for this restriction is already pending review');
    }

    return this.prisma.appeal.create({
      data: {
        recruiterAccountId: recruiterId,
        targetType: RESTRICTION_TARGET_TYPE,
        targetId: recruiter.companyId,
        content: dto.content,
        evidenceFileId: dto.evidenceFileId,
        status: AppealStatus.PENDING,
      },
    });
  }

  async findAllForRecruiter(recruiterId: string) {
    return this.prisma.appeal.findMany({
      where: { recruiterAccountId: recruiterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForAdmin(status?: AppealStatus) {
    return this.prisma.appeal.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        recruiterAccount: { select: { id: true, email: true, company: { select: { name: true } } } },
      },
    });
  }

  async resolve(appealId: string, adminId: string, status: 'APPROVED' | 'REJECTED') {
    const appeal = await this.prisma.appeal.findUnique({ where: { id: appealId } });
    if (!appeal) {
      throw new NotFoundException('Appeal not found');
    }
    if (appeal.status !== AppealStatus.PENDING) {
      throw new BadRequestException('This appeal has already been resolved');
    }

    if (status === 'REJECTED') {
      return this.prisma.appeal.update({
        where: { id: appealId },
        data: { status: AppealStatus.REJECTED, handledByAdminId: adminId },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedAppeal = await tx.appeal.update({
        where: { id: appealId },
        data: { status: AppealStatus.APPROVED, handledByAdminId: adminId },
      });

      if (appeal.targetType.toUpperCase() === RESTRICTION_TARGET_TYPE) {
        await this.liftRestriction(tx, appeal.targetId, adminId);
      }

      return updatedAppeal;
    });
  }

  private async liftRestriction(tx: Prisma.TransactionClient, companyId: string, adminId: string) {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { status: true, scoreBeforeRestriction: true, reputationScore: true },
    });
    if (!company || company.status !== CompanyStatus.RESTRICTED) return;

    const restoredScore = company.scoreBeforeRestriction ?? new Prisma.Decimal(35);
    const delta = Number(restoredScore) - Number(company.reputationScore);

    await tx.company.update({
      where: { id: companyId },
      data: {
        status: CompanyStatus.ACTIVE,
        restrictedAt: null,
        scoreBeforeRestriction: null,
      },
    });

    await this.reputationLedger.applyDelta(
      tx,
      companyId,
      delta,
      'RESTRICTION_LIFTED_APPEAL',
      'Kháng cáo được duyệt, khôi phục điểm uy tín trước khi bị hạn chế',
      adminId,
    );
  }
}
