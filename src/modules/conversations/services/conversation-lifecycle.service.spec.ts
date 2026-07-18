import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  ApplicationStatus,
  ConversationStatus,
  ConversationType,
  Prisma,
} from '@prisma/client';
import { ConversationLifecycleService } from './conversation-lifecycle.service';
import { MessageService } from './message.service';

describe('ConversationLifecycleService', () => {
  const createSystemMessage = jest.fn();
  const service = new ConversationLifecycleService(
    { createSystemMessage } as unknown as MessageService,
    { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
  );

  beforeEach(() => {
    createSystemMessage.mockReset();
  });

  it('adds the recruiter who opens the interview chat even when they did not create the job', async () => {
    const participantUpsert = jest.fn().mockResolvedValue({});
    const tx = {
      application: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'application-id',
          candidateProfile: { candidateAccountId: 'candidate-id' },
          jobPost: {
            id: 'job-id',
            companyId: 'company-id',
            createdByRecruiterId: 'job-creator-id',
          },
          assignments: [],
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'conversation-id',
          type: ConversationType.APPLICATION_CHAT,
          status: ConversationStatus.ACTIVE,
          writableUntil: null,
        }),
      },
      conversationParticipant: { upsert: participantUpsert },
    } as unknown as Prisma.TransactionClient;

    await service.ensureApplicationConversation(
      tx,
      'application-id',
      { type: ActorType.RECRUITER, id: 'transition-recruiter-id' },
      ApplicationStatus.INTERVIEWING,
    );

    expect(participantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId_recruiterAccountId: {
            conversationId: 'conversation-id',
            recruiterAccountId: 'transition-recruiter-id',
          },
        },
      }),
    );
    expect(participantUpsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId_recruiterAccountId: {
            conversationId: 'conversation-id',
            recruiterAccountId: 'job-creator-id',
          },
        },
      }),
    );
  });
});
