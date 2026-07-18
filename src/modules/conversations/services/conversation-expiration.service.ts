import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConversationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MessageService } from './message.service';

@Injectable()
export class ConversationExpirationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessageService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileReadOnlyConversations() {
    const expired = await this.prisma.conversation.findMany({
      where: {
        status: ConversationStatus.ACTIVE,
        writableUntil: { lte: new Date() },
      },
      select: { id: true },
      take: 100,
    });
    for (const conversation of expired) {
      await this.prisma.$transaction(async (tx) => this.markReadOnly(tx, conversation.id));
    }
  }

  private async markReadOnly(tx: Prisma.TransactionClient, id: string) {
    const changed = await tx.conversation.updateMany({
      where: { id, status: ConversationStatus.ACTIVE, writableUntil: { lte: new Date() } },
      data: {
        status: ConversationStatus.READ_ONLY,
        readOnlyAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (changed.count) {
      await this.messages.createSystemMessage(
        tx,
        id,
        'CONVERSATION_READ_ONLY',
        'Hội thoại đã chuyển sang chế độ chỉ đọc.',
      );
    }
  }
}
