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

  it('opens the application conversation when the candidate submits an application', async () => {
    const conversationUpsert = jest.fn().mockResolvedValue({
      id: 'conversation-id',
      type: ConversationType.APPLICATION_CHAT,
      status: ConversationStatus.ACTIVE,
      writableUntil: null,
    });
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
          assignments: [{ recruiterAccountId: 'job-creator-id' }],
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: conversationUpsert,
      },
      conversationParticipant: { upsert: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    await service.applyApplicationStatus(tx, 'application-id', ApplicationStatus.SUBMITTED, {
      type: ActorType.CANDIDATE,
      id: 'candidate-id',
    });

    expect(conversationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: ConversationType.APPLICATION_CHAT,
          status: ConversationStatus.ACTIVE,
          applicationId: 'application-id',
          createdByActorType: ActorType.CANDIDATE,
          createdByActorId: 'candidate-id',
        }),
      }),
    );
    expect(createSystemMessage).toHaveBeenCalledWith(
      tx,
      'conversation-id',
      'APPLICATION_CHAT_OPENED',
      expect.any(String),
      { reason: ApplicationStatus.SUBMITTED },
    );
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

  it('adds active job hiring-team members to a new application conversation', async () => {
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
            hiringTeamMembers: [{ recruiterAccountId: 'team-member-id' }],
          },
          assignments: [{ recruiterAccountId: 'job-creator-id' }],
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'conversation-id',
          status: ConversationStatus.ACTIVE,
          writableUntil: null,
        }),
      },
      conversationParticipant: { upsert: participantUpsert },
    } as unknown as Prisma.TransactionClient;

    await service.applyApplicationStatus(tx, 'application-id', ApplicationStatus.SUBMITTED, {
      type: ActorType.CANDIDATE,
      id: 'candidate-id',
    });

    expect(participantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId_recruiterAccountId: {
            conversationId: 'conversation-id',
            recruiterAccountId: 'team-member-id',
          },
        },
      }),
    );
  });
});
