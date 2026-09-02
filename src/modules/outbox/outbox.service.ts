import { Injectable } from '@nestjs/common';
import { OutboxStatus, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type OutboxClient = Prisma.TransactionClient | PrismaClient;

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    params: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      dedupeKey: string;
      payload: Prisma.InputJsonValue;
    },
    client: OutboxClient = this.prisma,
  ) {
    const event = await client.outboxEvent.upsert({
      where: { dedupeKey: params.dedupeKey },
      update: {},
      create: params,
    });
    // Re-enqueueing an explicitly requested, terminally failed delivery is a
    // deliberate recovery action. Completed and in-flight events stay exactly
    // once; a failed event gets a fresh bounded retry budget.
    if (event.status !== OutboxStatus.FAILED) return event;
    return client.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: OutboxStatus.PENDING,
        attemptCount: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }
}
