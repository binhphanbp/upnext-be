import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, ConversationStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../conversation-cursor';
import { ListConversationTagsQueryDto } from '../dto/list-conversation-tags-query.dto';
import { ListConversationsQueryDto } from '../dto/list-conversations-query.dto';
import { UpdateConversationTagsDto } from '../dto/update-conversation-tags.dto';
import { ConversationPolicyService } from './conversation-policy.service';

const participantProjection = {
  id: true,
  role: true,
  lastReadAt: true,
  tags: true,
  candidateAccount: { select: { id: true, fullName: true } },
  recruiterAccount: {
    select: {
      id: true,
      profile: { select: { fullName: true, avatarUrl: true } },
      company: { select: { id: true, name: true } },
    },
  },
  adminUser: { select: { id: true, fullName: true, avatarUrl: true } },
} satisfies Prisma.ConversationParticipantSelect;

@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ConversationPolicyService,
  ) {}

  async list(user: AuthenticatedUser, query: ListConversationsQueryDto) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const participantWhere = this.policy.actorParticipantWhere(user);
    const tag = query.tag ? normalizeTag(query.tag) : undefined;
    const where: Prisma.ConversationWhereInput = {
      type: query.type,
      status: query.status ?? { not: ConversationStatus.CLOSED },
      participants: {
        some: {
          ...participantWhere,
          leftAt: null,
          ...(tag ? { tags: { has: tag } } : {}),
        },
      },
      ...(cursor
        ? {
            OR: [
              { updatedAt: { lt: cursor.createdAt } },
              { updatedAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        latestMessage: {
          select: {
            id: true,
            type: true,
            content: true,
            createdAt: true,
            senderParticipantId: true,
          },
        },
        participants: { where: { leftAt: null }, select: participantProjection },
      },
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const data = page.map((conversation) => withOwnTags(conversation, user));
    const last = data.at(-1);
    return {
      data,
      meta: {
        nextCursor:
          hasMore && last ? encodeCursor({ createdAt: last.updatedAt, id: last.id }) : null,
      },
    };
  }

  async listTags(user: AuthenticatedUser, query: ListConversationTagsQueryDto) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        ...this.policy.actorParticipantWhere(user),
        leftAt: null,
        conversation: {
          is: {
            type: query.type,
            status: { not: ConversationStatus.CLOSED },
          },
        },
      },
      select: { tags: true },
    });
    const tags = [...new Set(participants.flatMap((participant) => participant.tags))].sort(
      (left, right) => left.localeCompare(right, 'vi'),
    );
    return { data: tags };
  }

  async detail(id: string, user: AuthenticatedUser) {
    await this.policy.assertAccess(id, user);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: { where: { leftAt: null }, select: participantProjection },
        application: {
          select: {
            id: true,
            status: true,
            jobPost: {
              select: { id: true, title: true, company: { select: { id: true, name: true } } },
            },
            candidateProfile: {
              select: { id: true, account: { select: { id: true, fullName: true } } },
            },
          },
        },
        talentContactRequest: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            jobPost: { select: { id: true, title: true } },
          },
        },
        supportCase: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            department: true,
            categoryCode: true,
            priority: true,
            status: true,
            assignedAdminUserId: true,
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return { data: withOwnTags(conversation, user) };
  }

  async updateTags(id: string, dto: UpdateConversationTagsDto, user: AuthenticatedUser) {
    const participant = await this.policy.assertAccess(id, user);
    const tags = [...new Set(dto.tags.map(normalizeTag).filter(Boolean))];
    if (tags.length > 10) throw new BadRequestException('A conversation can have at most 10 tags');
    const updated = await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { tags },
      select: { tags: true },
    });
    return { data: { conversationId: id, tags: updated.tags } };
  }
}

function normalizeTag(value: string) {
  const tag = value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
  if (tag.length > 30) throw new BadRequestException('Each tag can have at most 30 characters');
  return tag;
}

function withOwnTags<
  T extends {
    participants: Array<{
      id: string;
      role: unknown;
      lastReadAt: Date | null;
      tags: string[];
      candidateAccount: unknown;
      recruiterAccount: unknown;
      adminUser: unknown;
    }>;
  },
>(conversation: T, user: AuthenticatedUser) {
  const ownParticipant = conversation.participants.find((participant) =>
    isOwnParticipant(participant, user),
  );
  return {
    ...conversation,
    tags: ownParticipant?.tags ?? [],
    participants: conversation.participants.map((participant) => ({
      id: participant.id,
      role: participant.role,
      lastReadAt: participant.lastReadAt,
      candidateAccount: participant.candidateAccount,
      recruiterAccount: participant.recruiterAccount,
      adminUser: participant.adminUser,
    })),
  };
}

function isOwnParticipant(
  participant: {
    candidateAccount: unknown;
    recruiterAccount: unknown;
    adminUser: unknown;
  },
  user: AuthenticatedUser,
) {
  if (user.role === ActorType.CANDIDATE) {
    return accountId(participant.candidateAccount) === user.id;
  }
  if (user.role === ActorType.RECRUITER) {
    return accountId(participant.recruiterAccount) === user.id;
  }
  if (user.role === ActorType.ADMIN) {
    return accountId(participant.adminUser) === user.id;
  }
  return false;
}

function accountId(value: unknown) {
  return typeof value === 'object' && value !== null && 'id' in value ? value.id : undefined;
}
