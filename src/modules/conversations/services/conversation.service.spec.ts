import { ActorType, ConversationStatus, ConversationType } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationPolicyService } from './conversation-policy.service';
import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  const recruiter: AuthenticatedUser = {
    id: 'recruiter-id',
    email: 'recruiter@upnext.dev',
    role: ActorType.RECRUITER,
    companyId: 'company-id',
    permissions: [],
  };
  const prisma = {
    conversation: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    conversationParticipant: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const policy = {
    actorParticipantWhere: jest.fn().mockReturnValue({ recruiterAccountId: recruiter.id }),
    assertAccess: jest.fn(),
  };
  const service = new ConversationService(
    prisma as unknown as PrismaService,
    policy as unknown as ConversationPolicyService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    policy.actorParticipantWhere.mockReturnValue({ recruiterAccountId: recruiter.id });
  });

  it('filters tags inside the current actor participant boundary', async () => {
    prisma.conversation.findMany.mockResolvedValue([]);

    await service.list(recruiter, { limit: 20, tag: '  VIP  ' });

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participants: {
            some: {
              recruiterAccountId: recruiter.id,
              leftAt: null,
              tags: { has: 'vip' },
            },
          },
        }),
      }),
    );
  });

  it('returns only the current actor tags and does not expose participant tag metadata', async () => {
    prisma.conversation.findMany.mockResolvedValue([
      conversationRow([
        participant('own-participant', ['vip'], recruiter.id),
        participant('candidate-participant', ['candidate-private'], null),
      ]),
    ]);

    const result = await service.list(recruiter, { limit: 20 });

    expect(result.data[0]?.tags).toEqual(['vip']);
    expect(result.data[0]?.participants).toEqual([
      expect.not.objectContaining({ tags: expect.anything() }),
      expect.not.objectContaining({ tags: expect.anything() }),
    ]);
  });

  it('normalizes, deduplicates and updates only the current participant tags', async () => {
    policy.assertAccess.mockResolvedValue({ id: 'own-participant' });
    prisma.conversationParticipant.update.mockResolvedValue({
      tags: ['vip', 'cần phản hồi'],
    });

    const result = await service.updateTags(
      'conversation-id',
      { tags: [' VIP ', 'vip', ' Cần   phản hồi '] },
      recruiter,
    );

    expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
      where: { id: 'own-participant' },
      data: { tags: ['vip', 'cần phản hồi'] },
      select: { tags: true },
    });
    expect(result).toEqual({
      data: { conversationId: 'conversation-id', tags: ['vip', 'cần phản hồi'] },
    });
  });

  it('lists distinct tags owned by the current actor', async () => {
    prisma.conversationParticipant.findMany.mockResolvedValue([
      { tags: ['vip', 'cần phản hồi'] },
      { tags: ['vip'] },
    ]);

    const result = await service.listTags(recruiter, {
      type: ConversationType.APPLICATION_CHAT,
    });

    expect(prisma.conversationParticipant.findMany).toHaveBeenCalledWith({
      where: {
        recruiterAccountId: recruiter.id,
        leftAt: null,
        conversation: {
          is: {
            type: ConversationType.APPLICATION_CHAT,
            status: { not: ConversationStatus.CLOSED },
          },
        },
      },
      select: { tags: true },
    });
    expect(result.data).toEqual(['cần phản hồi', 'vip']);
  });
});

function conversationRow(participants: ReturnType<typeof participant>[]) {
  return {
    id: 'conversation-id',
    type: ConversationType.APPLICATION_CHAT,
    status: ConversationStatus.ACTIVE,
    companyId: 'company-id',
    applicationId: 'application-id',
    jobPostId: 'job-post-id',
    talentContactRequestId: null,
    supportCaseId: null,
    latestMessageId: null,
    latestMessageAt: null,
    writableUntil: null,
    readOnlyAt: null,
    closeReason: null,
    version: 1,
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    latestMessage: null,
    participants,
  };
}

function participant(id: string, tags: string[], recruiterAccountId: string | null) {
  return {
    id,
    role: recruiterAccountId ? 'RECRUITER' : 'CANDIDATE',
    lastReadAt: null,
    tags,
    candidateAccount: recruiterAccountId ? null : { id: 'candidate-id', fullName: 'Candidate' },
    recruiterAccount: recruiterAccountId
      ? {
          id: recruiterAccountId,
          profile: { fullName: 'Recruiter', avatarUrl: null },
          company: { id: 'company-id', name: 'UpNext' },
        }
      : null,
    adminUser: null,
  };
}
