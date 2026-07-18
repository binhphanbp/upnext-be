import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type OutboxClient = Prisma.TransactionClient | PrismaClient;

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  enqueue(
    params: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      dedupeKey: string;
      payload: Prisma.InputJsonValue;
    },
    client: OutboxClient = this.prisma,
  ) {
    return client.outboxEvent.upsert({
      where: { dedupeKey: params.dedupeKey },
      update: {},
      create: params,
    });
  }
}
