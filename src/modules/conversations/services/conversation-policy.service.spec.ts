import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ActorType, ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationPolicyService } from './conversation-policy.service';

describe('ConversationPolicyService', () => {
  const prisma = {
    conversationParticipant: { findFirst: jest.fn() },
    recruiterAccount: { findFirst: jest.fn() },
    conversation: { findFirst: jest.fn() },
  };
  const policy = new ConversationPolicyService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

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
    prisma.recruiterAccount.findFirst.mockResolvedValue(null);
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

  it('grants an Owner role-based access to an application chat without a default participant row', async () => {
    prisma.conversationParticipant.findFirst.mockResolvedValue(null);
    prisma.recruiterAccount.findFirst.mockResolvedValue({ id: 'owner-id' });
    prisma.conversation.findFirst.mockResolvedValue({ id: 'conversation-id' });

    await expect(
      policy.assertAccess('conversation-id', {
        id: 'owner-id',
        email: 'owner@upnext.dev',
        role: ActorType.RECRUITER,
        companyId: 'company-id',
        permissions: [],
      }),
    ).resolves.toBeNull();

    expect(prisma.recruiterAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'owner-id',
        companyId: 'company-id',
        recruiterRole: { is: { code: 'OWNER' } },
      },
      select: { id: true },
    });
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
