import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ActorType, ConversationStatus } from '@prisma/client';
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
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        leftAt: null,
        ...this.actorParticipantWhere(user),
      },
      include: { conversation: true },
    });

    if (!participant) throw new ForbiddenException('Not a conversation participant');
    return participant;
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
