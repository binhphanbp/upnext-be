import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { REPUTATION_CONFIG } from '../reputation/reputation.config';
import { SubmitHiringReportDto } from './dto/submit-hiring-report.dto';

@Injectable()
export class HiringReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationLedger: ReputationLedgerService,
  ) {}

  async submit(jobPostId: string, recruiterId: string, dto: SubmitHiringReportDto) {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
      select: { companyId: true },
    });
    if (!recruiter?.companyId) {
      throw new ForbiddenException('Recruiter account has not been attached to a company');
    }

    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: { id: true, companyId: true, expiredAt: true },
    });
    if (!jobPost) {
      throw new NotFoundException('Job post not found');
    }
    if (jobPost.companyId !== recruiter.companyId) {
      throw new ForbiddenException('You are not allowed to report on this job post');
    }
    if (!jobPost.expiredAt || jobPost.expiredAt > new Date()) {
      throw new BadRequestException(
        'Hiring result can only be reported after the job post has expired',
      );
    }

    const existing = await this.prisma.hiringResultReport.findUnique({
      where: { jobPostId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A hiring result report has already been submitted for this job post',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.hiringResultReport.create({
        data: {
          jobPostId,
          recruiterAccountId: recruiterId,
          totalHired: dto.totalHired,
          totalApplications: dto.totalApplications,
          note: dto.note,
        },
      });

      await this.reputationLedger.applyDelta(
        tx,
        jobPost.companyId,
        REPUTATION_CONFIG.HIRING_RESULT_REPORT_BONUS,
        'HIRING_RESULT_REPORTED',
        'Đã báo cáo kết quả tuyển dụng sau khi tin hết hạn',
      );

      return report;
    });
  }

  async findByJobPost(jobPostId: string) {
    return this.prisma.hiringResultReport.findUnique({ where: { jobPostId } });
  }
}
