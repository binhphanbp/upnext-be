import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ActorType, ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationPolicyService } from './conversation-policy.service';

describe('ConversationPolicyService', () => {
  const prisma = { conversationParticipant: { findFirst: jest.fn() } };
  const policy = new ConversationPolicyService(prisma as unknown as PrismaService);

  it('builds an actor-specific participant boundary', () => {
    expect(
      policy.actorParticipantWhere({
        id: 'candidate-id',
        email: 'candidate@upnext.dev',
        role: ActorType.CANDIDATE,
        permissions: [],
      }),
    ).toEqual({ candidateAccountId: 'candidate-id' });
  });

  it('does not grant access when the actor is not an active participant', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue(null);
    await expect(
      policy.assertAccess('conversation-id', {
        id: 'recruiter-id',
        email: 'recruiter@upnext.dev',
        role: ActorType.RECRUITER,
        companyId: 'company-id',
        permissions: ['applications:manage'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows only active and unexpired conversations to be written', () => {
    expect(() =>
      policy.assertWritable({ status: ConversationStatus.ACTIVE, writableUntil: null }),
    ).not.toThrow();
    expect(() =>
      policy.assertWritable({ status: ConversationStatus.PENDING, writableUntil: null }),
    ).toThrow(ConflictException);
    expect(() =>
      policy.assertWritable(
        {
          status: ConversationStatus.ACTIVE,
          writableUntil: new Date('2026-07-17T09:59:59.000Z'),
        },
        new Date('2026-07-17T10:00:00.000Z'),
      ),
    ).toThrow(ConflictException);
  });
});
