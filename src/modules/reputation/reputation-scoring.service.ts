import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApplicationStatus, JobReputationEvaluationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationLedgerService } from './reputation-ledger.service';
import { REPUTATION_CONFIG, scoreForProcessingRate } from './reputation.config';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

@Injectable()
export class ReputationScoringService {
  private readonly logger = new Logger(ReputationScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationLedger: ReputationLedgerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDailyEvaluations() {
    await this.evaluateCvProcessing().catch((error: unknown) => {
      this.logger.error(
        `evaluateCvProcessing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    await this.evaluateExpiryPenalty().catch((error: unknown) => {
      this.logger.error(
        `evaluateExpiryPenalty failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Job đủ >=5 application và đã qua CV_EVAL_WINDOW_DAYS kể từ application thứ 5 → đánh giá
   * 1 lần duy nhất tỷ lệ CV được xử lý hợp lệ (đổi status khác SUBMITTED sau > 2 giờ kể từ khi
   * nộp) và cộng/trừ điểm theo bảng ở reputation.config.ts.
   */
  async evaluateCvProcessing() {
    const now = new Date();
    const windowMs = REPUTATION_CONFIG.CV_EVAL_WINDOW_DAYS * DAY_MS;
    const minHoursMs = REPUTATION_CONFIG.CV_PROCESSING_MIN_HOURS * HOUR_MS;

    const candidates = await this.prisma.jobPost.findMany({
      where: {
        publishedAt: { lte: new Date(now.getTime() - windowMs) },
        reputationEvaluations: { none: { evaluationType: JobReputationEvaluationType.CV_PROCESSING } },
        applications: { some: {} },
      },
      select: {
        id: true,
        companyId: true,
        applications: {
          select: {
            submittedAt: true,
            statusLogs: {
              where: { newStatus: { not: ApplicationStatus.SUBMITTED } },
              orderBy: { changedAt: 'asc' },
              take: 1,
              select: { changedAt: true },
            },
          },
        },
      },
    });

    for (const job of candidates) {
      if (job.applications.length < REPUTATION_CONFIG.CV_MIN_APPLICATIONS) continue;

      const sortedBySubmission = [...job.applications].sort(
        (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime(),
      );
      const fifthSubmittedAt = sortedBySubmission[REPUTATION_CONFIG.CV_MIN_APPLICATIONS - 1].submittedAt;
      if (now.getTime() - fifthSubmittedAt.getTime() < windowMs) continue;

      const processedCount = job.applications.filter((app) => {
        const firstChange = app.statusLogs[0];
        if (!firstChange) return false;
        return firstChange.changedAt.getTime() - app.submittedAt.getTime() > minHoursMs;
      }).length;

      const rate = processedCount / job.applications.length;
      const score = scoreForProcessingRate(rate);

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.jobReputationEvaluation.create({
            data: { jobPostId: job.id, evaluationType: JobReputationEvaluationType.CV_PROCESSING },
          });

          if (score !== 0) {
            await this.reputationLedger.applyDelta(
              tx,
              job.companyId,
              score,
              'CV_PROCESSING_EVALUATED',
              `Tỷ lệ xử lý CV sau ${REPUTATION_CONFIG.CV_EVAL_WINDOW_DAYS} ngày: ${(rate * 100).toFixed(1)}%`,
            );
          }
        });
      } catch (error) {
        this.logger.warn(
          `Failed to evaluate CV processing for job ${job.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Job đã hết hạn (expiredAt đã qua) nhưng còn application chưa từng được xử lý
   * (status vẫn là SUBMITTED) → phạt 1 lần cho company.
   */
  async evaluateExpiryPenalty() {
    const now = new Date();

    const candidates = await this.prisma.jobPost.findMany({
      where: {
        expiredAt: { lt: now },
        reputationEvaluations: { none: { evaluationType: JobReputationEvaluationType.EXPIRY_PENALTY } },
        applications: { some: { status: ApplicationStatus.SUBMITTED } },
      },
      select: { id: true, companyId: true },
    });

    for (const job of candidates) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.jobReputationEvaluation.create({
            data: { jobPostId: job.id, evaluationType: JobReputationEvaluationType.EXPIRY_PENALTY },
          });

          await this.reputationLedger.applyDelta(
            tx,
            job.companyId,
            -REPUTATION_CONFIG.EXPIRY_UNRESOLVED_PENALTY,
            'EXPIRY_UNRESOLVED_PENALTY',
            'Tin tuyển dụng hết hạn nhưng còn hồ sơ ứng tuyển chưa được xử lý',
          );
        });
      } catch (error) {
        this.logger.warn(
          `Failed to evaluate expiry penalty for job ${job.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
