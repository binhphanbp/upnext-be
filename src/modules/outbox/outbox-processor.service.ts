import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActorType, OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CandidateKnowledgeIndexerService,
  CandidateKnowledgeUpsert,
} from '../ai/retrieval/candidate-knowledge-indexer.service';

type NotificationPayload = {
  recipientId: string;
  recipientType: ActorType;
  title: string;
  body: string;
  targetId?: string | null;
  targetType?: string | null;
  metadata?: Prisma.InputJsonValue;
  dedupeKey?: string;
};

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly knowledgeIndexer: CandidateKnowledgeIndexerService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processBatch() {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma.outboxEvent.updateMany({
        where: {
          status: OutboxStatus.PROCESSING,
          lockedAt: { lt: new Date(Date.now() - 5 * 60 * 1_000) },
        },
        data: {
          status: OutboxStatus.PENDING,
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: new Date(),
        },
      });
      const events = await this.prisma.outboxEvent.findMany({
        where: { status: OutboxStatus.PENDING, nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: 25,
      });

      for (const event of events) await this.processOne(event.id);
    } finally {
      this.running = false;
    }
  }

  private async processOne(id: string) {
    const claimed = await this.prisma.outboxEvent.updateMany({
      where: { id, status: OutboxStatus.PENDING },
      data: {
        status: OutboxStatus.PROCESSING,
        lockedAt: new Date(),
        lockedBy: process.pid.toString(),
      },
    });
    if (!claimed.count) return;

    const event = await this.prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    try {
      if (event.eventType === 'notification.create') {
        const payload = event.payload as NotificationPayload;
        await this.notifications.createNotification({
          ...payload,
          dedupeKey: payload.dedupeKey ?? event.dedupeKey,
        });
      } else if (event.eventType === 'candidate_knowledge.index') {
        await this.knowledgeIndexer.upsertPublished(
          event.payload as unknown as CandidateKnowledgeUpsert,
        );
      } else {
        throw new Error(`Unsupported outbox event type: ${event.eventType}`);
      }

      await this.prisma.outboxEvent.update({
        where: { id },
        data: {
          status: OutboxStatus.PROCESSED,
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
    } catch (error) {
      const attempts = event.attemptCount + 1;
      const terminal = attempts >= 8;
      await this.prisma.outboxEvent.update({
        where: { id },
        data: {
          status: terminal ? OutboxStatus.FAILED : OutboxStatus.PENDING,
          attemptCount: attempts,
          nextAttemptAt: new Date(Date.now() + Math.min(300_000, 2 ** attempts * 1_000)),
          lockedAt: null,
          lockedBy: null,
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown error',
        },
      });
      this.logger.error(`Outbox event ${id} failed`, error);
    }
  }
}
