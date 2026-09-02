import { ActorType, ConversationParticipantRole } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationMembershipService } from './conversation-membership.service';
import { ConversationPolicyService } from './conversation-policy.service';

describe('ConversationMembershipService', () => {
  const user: AuthenticatedUser = {
    id: 'owner-id',
    email: 'owner@upnext.dev',
    role: ActorType.RECRUITER,
    companyId: 'company-id',
    permissions: [],
  };
  const context = { id: 'conversation-id', companyId: 'company-id', jobPostId: 'job-id' };
  const transaction = {
    jobHiringTeamMember: { upsert: jest.fn() },
    conversation: { findMany: jest.fn() },
    conversationParticipant: { upsert: jest.fn() },
  };
  const prisma = {
    recruiterAccount: { findFirst: jest.fn() },
    conversationParticipant: { upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  const policy = { assertCanManageApplicationChat: jest.fn() };
  const service = new ConversationMembershipService(
    prisma as unknown as PrismaService,
    policy as unknown as ConversationPolicyService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    policy.assertCanManageApplicationChat.mockResolvedValue(context);
    prisma.recruiterAccount.findFirst.mockResolvedValue({
      id: 'colleague-id',
      email: 'colleague@upnext.dev',
      profile: { fullName: 'Colleague', avatarUrl: null },
    });
  });

  it('marks a single-chat colleague invite as explicit', async () => {
    prisma.conversationParticipant.upsert.mockResolvedValue({ id: 'participant-id' });

    await service.addToConversation('conversation-id', 'colleague-id', user);

    expect(prisma.conversationParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { leftAt: null, explicitlyAdded: true },
        create: expect.objectContaining({
          conversationId: 'conversation-id',
          recruiterAccountId: 'colleague-id',
          role: ConversationParticipantRole.RECRUITER,
          explicitlyAdded: true,
        }),
      }),
    );
  });

  it('adds a hiring-team member to all existing application chats for the job', async () => {
    transaction.jobHiringTeamMember.upsert.mockResolvedValue({ id: 'team-member-id' });
    transaction.conversation.findMany.mockResolvedValue([{ id: 'chat-a' }, { id: 'chat-b' }]);
    transaction.conversationParticipant.upsert.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    );

    const result = await service.addToHiringTeam('conversation-id', 'colleague-id', user);

    expect(transaction.conversationParticipant.upsert).toHaveBeenCalledTimes(2);
    expect(transaction.conversationParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId_recruiterAccountId: {
            conversationId: 'chat-a',
            recruiterAccountId: 'colleague-id',
          },
        },
      }),
    );
    expect(result).toEqual({ data: { member: { id: 'team-member-id' }, conversationsUpdated: 2 } });
  });
});
