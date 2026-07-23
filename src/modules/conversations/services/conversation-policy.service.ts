import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, ConversationStatus, ConversationType, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ConversationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  actorParticipantWhere(user: AuthenticatedUser) {
    switch (user.role) {
      case ActorType.CANDIDATE:
        return { candidateAccountId: user.id };
      case ActorType.RECRUITER:
        return { recruiterAccountId: user.id };
      case ActorType.ADMIN:
        return { adminUserId: user.id };
      default:
        return { id: '__system_not_a_participant__' };
    }
  }

  async assertAccess(conversationId: string, user: AuthenticatedUser) {
    const participant = await this.findActiveParticipant(conversationId, user);
    if (participant) return participant;

    if (await this.hasImplicitApplicationChatOwnerAccess(user, conversationId)) return null;
    throw new ForbiddenException('Not a conversation participant');
  }

  /**
   * Owner access to application chats is role-based. A participant record is
   * only materialized when an Owner opens or acts on a chat, so applying never
   * adds every company Owner as a hard-coded participant.
   */
  async ensureParticipantAccess(
    conversationId: string,
    user: AuthenticatedUser,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const participant = await client.conversationParticipant.findFirst({
      where: {
        conversationId,
        leftAt: null,
        ...this.actorParticipantWhere(user),
      },
      include: { conversation: true },
    });

    if (participant) return participant;
    if (!(await this.hasImplicitApplicationChatOwnerAccess(user, conversationId, tx))) {
      throw new ForbiddenException('Not a conversation participant');
    }

    return client.conversationParticipant.upsert({
      where: {
        conversationId_recruiterAccountId: {
          conversationId,
          recruiterAccountId: user.id,
        },
      },
      update: { leftAt: null },
      create: {
        conversationId,
        recruiterAccountId: user.id,
        role: 'RECRUITER',
      },
      include: { conversation: true },
    });
  }

  async canListAllCompanyApplicationChats(user: AuthenticatedUser) {
    return this.isCompanyOwner(user);
  }

  /** HR responsible for this application/job, or the company Owner. */
  async assertCanManageApplicationChat(conversationId: string, user: AuthenticatedUser) {
    if (user.role !== ActorType.RECRUITER || !user.companyId) {
      throw new ForbiddenException('Only recruiters can manage application chat members');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        type: true,
        companyId: true,
        applicationId: true,
        jobPostId: true,
        jobPost: { select: { createdByRecruiterId: true } },
      },
    });
    if (
      !conversation ||
      conversation.type !== ConversationType.APPLICATION_CHAT ||
      !conversation.jobPostId
    ) {
      throw new NotFoundException('Application conversation not found');
    }
    if (conversation.companyId !== user.companyId) {
      throw new ForbiddenException('Conversation belongs to another company');
    }

    if (await this.isCompanyOwner(user)) return conversation;
    if (conversation.jobPost?.createdByRecruiterId === user.id) return conversation;

    const [assigned, onHiringTeam] = await Promise.all([
      conversation.applicationId
        ? this.prisma.applicationAssignment.findFirst({
            where: {
              applicationId: conversation.applicationId,
              recruiterAccountId: user.id,
              unassignedAt: null,
            },
            select: { id: true },
          })
        : null,
      this.prisma.jobHiringTeamMember.findFirst({
        where: { jobPostId: conversation.jobPostId, recruiterAccountId: user.id, leftAt: null },
        select: { id: true },
      }),
    ]);
    if (!assigned && !onHiringTeam) {
      throw new ForbiddenException(
        'Only the responsible recruiter or company owner can manage members',
      );
    }
    return conversation;
  }

  private findActiveParticipant(conversationId: string, user: AuthenticatedUser) {
    return this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        leftAt: null,
        ...this.actorParticipantWhere(user),
      },
      include: { conversation: true },
    });
  }

  private async hasImplicitApplicationChatOwnerAccess(
    user: AuthenticatedUser,
    conversationId: string,
    tx?: Prisma.TransactionClient,
  ) {
    if (!(await this.isCompanyOwner(user, tx))) return false;
    const client = tx ?? this.prisma;
    const conversation = await client.conversation.findFirst({
      where: {
        id: conversationId,
        type: ConversationType.APPLICATION_CHAT,
        companyId: user.companyId!,
      },
      select: { id: true },
    });
    return Boolean(conversation);
  }

  private async isCompanyOwner(user: AuthenticatedUser, tx?: Prisma.TransactionClient) {
    if (user.role !== ActorType.RECRUITER || !user.companyId) return false;
    const client = tx ?? this.prisma;
    const owner = await client.recruiterAccount.findFirst({
      where: {
        id: user.id,
        companyId: user.companyId,
        recruiterRole: { is: { code: 'OWNER' } },
      },
      select: { id: true },
    });
    return Boolean(owner);
  }

  assertWritable(
    conversation: { status: ConversationStatus; writableUntil: Date | null },
    now = new Date(),
  ) {
    if (conversation.status !== ConversationStatus.ACTIVE) {
      throw new ConflictException({
        code: 'CONVERSATION_NOT_WRITABLE',
        message: 'Conversation is not writable',
      });
    }
    if (conversation.writableUntil && conversation.writableUntil <= now) {
      throw new ConflictException({
        code: 'CONVERSATION_NOT_WRITABLE',
        message: 'The conversation grace period has expired',
      });
    }
  }
}
