import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CvScreeningRunStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CvScreeningService } from './cv-screening.service';

const LEASE_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 3;

/**
 * Durable executor for CV-screening runs. Queue state, attempts and leases are
 * persisted on `cv_screening_runs`, so deploys or process restarts do not lose
 * accepted work. The compare-and-set claim makes this safe across replicas.
 */
@Injectable()
export class CvScreeningWorkerService {
  private readonly logger = new Logger(CvScreeningWorkerService.name);
  private readonly workerId = `cv-screening:${process.pid}:${randomUUID()}`;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly screening: CvScreeningService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processNextRun() {
    if (this.running) return;
    this.running = true;

    try {
      await this.recoverExpiredLeases();

      const run = await this.prisma.cvScreeningRun.findFirst({
        where: {
          status: CvScreeningRunStatus.PENDING,
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, startedAt: true },
      });
      if (!run) return;

      const claimed = await this.prisma.cvScreeningRun.updateMany({
        where: {
          id: run.id,
          status: CvScreeningRunStatus.PENDING,
          nextAttemptAt: { lte: new Date() },
        },
        data: {
          status: CvScreeningRunStatus.PROCESSING,
          attemptCount: { increment: 1 },
          lockedAt: new Date(),
          lockedBy: this.workerId,
          startedAt: run.startedAt ?? new Date(),
          errorMessage: null,
        },
      });
      if (!claimed.count) return;

      try {
        await this.screening.processClaimedRun(run.id, this.workerId);
      } catch (error) {
        await this.retryOrRefund(run.id, error);
      }
    } finally {
      this.running = false;
    }
  }

  private async recoverExpiredLeases() {
    const recovered = await this.prisma.cvScreeningRun.updateMany({
      where: {
        status: CvScreeningRunStatus.PROCESSING,
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - LEASE_MS) } }],
      },
      data: {
        status: CvScreeningRunStatus.PENDING,
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: new Date(),
        errorMessage: 'Worker lease expired; the run was safely recovered for retry.',
      },
    });
    if (recovered.count) {
      this.logger.warn(`Recovered ${recovered.count} expired CV screening run lease(s)`);
    }
  }

  private async retryOrRefund(runId: string, error: unknown) {
    const run = await this.prisma.cvScreeningRun.findFirst({
      where: {
        id: runId,
        status: CvScreeningRunStatus.PROCESSING,
        lockedBy: this.workerId,
      },
      select: { attemptCount: true },
    });
    if (!run) return;

    const errorMessage = this.getErrorMessage(error);
    this.logger.error(`CV screening run ${runId} failed on attempt ${run.attemptCount}`, error);

    if (run.attemptCount >= MAX_ATTEMPTS) {
      await this.screening.finishClaimedRun(
        runId,
        this.workerId,
        CvScreeningRunStatus.FAILED,
        `Run stopped after ${MAX_ATTEMPTS} failed attempts: ${errorMessage}`,
      );
      return;
    }

    const retryDelayMs = Math.min(60_000, 2 ** run.attemptCount * 5_000);
    await this.prisma.cvScreeningRun.updateMany({
      where: {
        id: runId,
        status: CvScreeningRunStatus.PROCESSING,
        lockedBy: this.workerId,
      },
      data: {
        status: CvScreeningRunStatus.PENDING,
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: new Date(Date.now() + retryDelayMs),
        errorMessage: `Attempt ${run.attemptCount}/${MAX_ATTEMPTS} failed; retry scheduled: ${errorMessage}`,
      },
    });
  }

  private getErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 1_500);
  }
}
