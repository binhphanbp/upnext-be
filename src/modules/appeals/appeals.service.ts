import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppealStatus, CompanyStatus, Prisma } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { REPUTATION_CONFIG } from '../reputation/reputation.config';
import { CreateAppealDto } from './dto/create-appeal.dto';

const RESTRICTION_TARGET_TYPE = 'COMPANY';

@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationLedger: ReputationLedgerService,
    private readonly emailService: EmailService,
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

    if (dto.evidenceFileId) {
      // A dangling id would otherwise surface as a 500 from the FK violation.
      const file = await this.prisma.fileAsset.findUnique({ where: { id: dto.evidenceFileId } });
      if (!file) {
        throw new NotFoundException('Evidence file not found');
      }
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

    const appeal = await this.prisma.appeal.create({
      data: {
        recruiterAccountId: recruiterId,
        targetType: RESTRICTION_TARGET_TYPE,
        targetId: recruiter.companyId,
        content: dto.content,
        evidenceFileId: dto.evidenceFileId,
        status: AppealStatus.PENDING,
      },
    });

    await this.notify('kháng cáo mới tới admin', async () => {
      const [admins, company] = await Promise.all([
        this.prisma.adminUser.findMany({
          where: { status: 'ACTIVE', role: { status: 'ACTIVE' } },
          select: { email: true, fullName: true },
        }),
        this.prisma.company.findUnique({
          where: { id: appeal.targetId },
          select: { name: true },
        }),
      ]);

      await Promise.all(
        admins.map((admin) =>
          this.emailService.sendAppealSubmittedToAdmin({
            to: admin.email,
            adminName: admin.fullName,
            companyName: company?.name ?? 'Doanh nghiệp',
            content: appeal.content,
          }),
        ),
      );
    });

    return appeal;
  }

  /**
   * Notifications are best-effort: resolving an appeal must not fail because SMTP is down,
   * and this never runs inside the transaction that changed the data.
   */
  private async notify(what: string, send: () => Promise<void>) {
    try {
      await send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Không gửi được email ${what}: ${message}`);
    }
  }

  private async notifyAppealOutcome(companyId: string, approved: boolean) {
    await this.notify('kết quả kháng cáo tới nhà tuyển dụng', async () => {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, recruiterAccounts: { select: { email: true, fullName: true } } },
      });
      if (!company) return;

      await Promise.all(
        company.recruiterAccounts.map((recruiter) =>
          this.emailService.sendAppealOutcomeToRecruiter({
            to: recruiter.email,
            recipientName: recruiter.fullName,
            companyName: company.name,
            approved,
          }),
        ),
      );
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
      const rejected = await this.prisma.appeal.update({
        where: { id: appealId },
        data: { status: AppealStatus.REJECTED, handledByAdminId: adminId },
      });

      await this.notifyAppealOutcome(appeal.targetId, false);
      return rejected;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAppeal = await tx.appeal.update({
        where: { id: appealId },
        data: { status: AppealStatus.APPROVED, handledByAdminId: adminId },
      });

      if (appeal.targetType.toUpperCase() === RESTRICTION_TARGET_TYPE) {
        await this.liftRestriction(tx, appeal.targetId, adminId);
      }

      return updatedAppeal;
    });

    await this.notifyAppealOutcome(appeal.targetId, true);
    return updated;
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
