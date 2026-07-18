import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  ConversationParticipantRole,
  MessageAttachmentStatus,
  MessageType,
  Prisma,
  SupportCaseStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../outbox/outbox.service';
import { decodeCursor, encodeCursor } from '../conversation-cursor';
import { MessageCursorQueryDto } from '../dto/message-cursor-query.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import { CHAT_SCHEMA_VERSION } from '../types/socket-contract';
import { ConversationPolicyService } from './conversation-policy.service';
import { ConversationRealtimeService } from './conversation-realtime.service';

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ConversationPolicyService,
    private readonly outbox: OutboxService,
    private readonly realtime: ConversationRealtimeService,
  ) {}

  async list(conversationId: string, user: AuthenticatedUser, query: MessageCursorQueryDto) {
    await this.policy.assertAccess(conversationId, user);
    const cursor = query.before ? decodeCursor(query.before) : undefined;
    const where: Prisma.MessageWhereInput = {
      conversationId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        attachments: {
          where: { status: MessageAttachmentStatus.CLAIMED },
          select: {
            id: true,
            status: true,
            fileAsset: { select: { originalName: true, mimeType: true, sizeBytes: true } },
          },
        },
      },
    });
    const hasMore = rows.length > query.limit;
    const descending = hasMore ? rows.slice(0, query.limit) : rows;
    const oldest = descending.at(-1);
    return {
      data: descending.reverse(),
      meta: {
        nextCursor:
          hasMore && oldest ? encodeCursor({ createdAt: oldest.createdAt, id: oldest.id }) : null,
      },
    };
  }

  async send(conversationId: string, user: AuthenticatedUser, dto: SendMessageDto) {
    const content = dto.content?.trim() || null;
    const attachmentIds = [...new Set(dto.attachmentIds ?? [])];
    if (!content && !attachmentIds.length) {
      throw new BadRequestException('A message needs text or an attachment');
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const participant = await tx.conversationParticipant.findFirst({
        where: {
          conversationId,
          leftAt: null,
          ...this.policy.actorParticipantWhere(user),
        },
        include: { conversation: true },
      });
      if (!participant) throw new NotFoundException('Conversation not found');

      const duplicate = await tx.message.findUnique({
        where: {
          senderParticipantId_clientMessageId: {
            senderParticipantId: participant.id,
            clientMessageId: dto.clientMessageId,
          },
        },
        include: { attachments: true },
      });
      if (duplicate) return duplicate;

      this.policy.assertWritable(participant.conversation);

      const recentMessageCount = await tx.message.count({
        where: {
          senderParticipantId: participant.id,
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      });
      if (recentMessageCount >= 30) {
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'Message rate limit exceeded' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (dto.replyToMessageId) {
        const reply = await tx.message.findFirst({
          where: { id: dto.replyToMessageId, conversationId, deletedAt: null },
          select: { id: true },
        });
        if (!reply) throw new BadRequestException('Reply target is invalid');
      }

      if (attachmentIds.length) {
        const claimed = await tx.messageAttachment.updateMany({
          where: {
            id: { in: attachmentIds },
            conversationId,
            uploadedByParticipantId: participant.id,
            messageId: null,
            status: MessageAttachmentStatus.UPLOADED,
          },
          data: { status: MessageAttachmentStatus.CLAIMED, claimedAt: new Date() },
        });
        if (claimed.count !== attachmentIds.length) {
          throw new ConflictException('One or more attachments are invalid or already claimed');
        }
      }

      const created = await tx.message.create({
        data: {
          conversationId,
          senderParticipantId: participant.id,
          clientMessageId: dto.clientMessageId,
          type: content
            ? attachmentIds.length
              ? MessageType.MIXED
              : MessageType.TEXT
            : MessageType.ATTACHMENT,
          content,
          replyToMessageId: dto.replyToMessageId,
          attachments: attachmentIds.length
            ? { connect: attachmentIds.map((id) => ({ id })) }
            : undefined,
        },
        include: {
          attachments: {
            select: {
              id: true,
              status: true,
              fileAsset: { select: { originalName: true, mimeType: true, sizeBytes: true } },
            },
          },
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          latestMessageId: created.id,
          latestMessageAt: created.createdAt,
          version: { increment: 1 },
        },
      });

      const supportCase = await tx.supportCase.findUnique({
        where: { conversationId },
        select: { id: true, status: true, assignedAdminUserId: true },
      });
      if (
        supportCase &&
        supportCase.status !== SupportCaseStatus.CLOSED &&
        supportCase.status !== SupportCaseStatus.RESOLVED
      ) {
        const nextStatus =
          supportCase.status === SupportCaseStatus.NEW && !supportCase.assignedAdminUserId
            ? SupportCaseStatus.NEW
            : user.role === ActorType.ADMIN
              ? SupportCaseStatus.WAITING_ON_RECRUITER
              : SupportCaseStatus.WAITING_ON_SUPPORT;
        await tx.supportCase.update({
          where: { id: supportCase.id },
          data: {
            status: nextStatus,
            lastAdminMessageAt: user.role === ActorType.ADMIN ? created.createdAt : undefined,
            lastRequesterMessageAt:
              user.role === ActorType.RECRUITER ? created.createdAt : undefined,
            version: { increment: 1 },
          },
        });
        if (supportCase.status !== nextStatus) {
          await tx.supportCaseStatusHistory.create({
            data: {
              caseId: supportCase.id,
              fromStatus: supportCase.status,
              toStatus: nextStatus,
              actorType: user.role,
              actorId: user.id,
              reason: 'Status updated by a new conversation message',
            },
          });
        }
      }

      const recipients = await tx.conversationParticipant.findMany({
        where: { conversationId, leftAt: null, id: { not: participant.id } },
        select: {
          id: true,
          candidateAccountId: true,
          recruiterAccountId: true,
          adminUserId: true,
          role: true,
        },
      });
      for (const recipient of recipients) {
        const identity = recipientIdentity(recipient);
        if (!identity) continue;
        await this.outbox.enqueue(
          {
            aggregateType: 'message',
            aggregateId: created.id,
            eventType: 'notification.create',
            dedupeKey: `message:${created.id}:participant:${recipient.id}`,
            payload: {
              recipientId: identity.id,
              recipientType: identity.type,
              title: 'Tin nhắn mới',
              body: content?.slice(0, 160) ?? 'Bạn nhận được một tệp đính kèm mới.',
              targetId: conversationId,
              targetType: 'CONVERSATION',
              dedupeKey: `message:${created.id}:participant:${recipient.id}`,
            },
          },
          tx,
        );
      }

      return created;
    });

    this.realtime.emitToConversation(conversationId, 'message:created', {
      schemaVersion: CHAT_SCHEMA_VERSION,
      conversationId,
      message,
    });
    return message;
  }

  async markRead(conversationId: string, messageId: string, user: AuthenticatedUser) {
    const participant = await this.policy.assertAccess(conversationId, user);
    const target = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, createdAt: true },
    });
    if (!target) throw new NotFoundException('Message not found');

    if (participant.lastReadMessageId) {
      const current = await this.prisma.message.findUnique({
        where: { id: participant.lastReadMessageId },
        select: { createdAt: true },
      });
      if (current && current.createdAt > target.createdAt) return participant;
    }

    const updated = await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadMessageId: target.id, lastReadAt: new Date() },
    });
    this.realtime.emitToConversation(conversationId, 'message:read', {
      schemaVersion: CHAT_SCHEMA_VERSION,
      conversationId,
      participantId: updated.id,
      lastReadMessageId: updated.lastReadMessageId,
      lastReadAt: updated.lastReadAt,
    });
    return updated;
  }

  async createSystemMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    systemEventType: string,
    content: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    const message = await tx.message.create({
      data: { conversationId, type: MessageType.SYSTEM, systemEventType, content, metadata },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        latestMessageId: message.id,
        latestMessageAt: message.createdAt,
        version: { increment: 1 },
      },
    });
    return message;
  }
}

function recipientIdentity(participant: {
  candidateAccountId: string | null;
  recruiterAccountId: string | null;
  adminUserId: string | null;
  role: ConversationParticipantRole;
}) {
  if (participant.candidateAccountId) {
    return { id: participant.candidateAccountId, type: ActorType.CANDIDATE };
  }
  if (participant.recruiterAccountId) {
    return { id: participant.recruiterAccountId, type: ActorType.RECRUITER };
  }
  if (participant.adminUserId) return { id: participant.adminUserId, type: ActorType.ADMIN };
  return null;
}
