import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { OutboxService } from '../outbox/outbox.service';
import { MessageService } from '../conversations/services/message.service';
import { ConversationRealtimeService } from '../conversations/services/conversation-realtime.service';
import { TalentContactService } from './talent-contact.service';

describe('TalentContactService.create - talent_contact quota', () => {
  const user: AuthenticatedUser = {
    id: 'recruiter-1',
    email: 'recruiter@example.test',
    companyId: 'company-1',
    role: ActorType.RECRUITER,
    permissions: ['applications:manage'],
  };

  const dto = {
    clientRequestId: 'client-req-1',
    candidateProfileId: 'candidate-profile-1',
    jobPostId: 'job-1',
    introMessage: 'Xin chào, tôi muốn trao đổi về vị trí này.',
  };

  let prisma: any;
  let quota: { consume: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let messages: { createSystemMessage: jest.Mock };
  let realtime: { emitToUser: jest.Mock; emitToConversation: jest.Mock };
  let config: { get: jest.Mock };
  let service: TalentContactService;

  beforeEach(() => {
    prisma = {
      subscriptionUsage: { findUnique: jest.fn().mockResolvedValue(null) },
      jobPost: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'job-1',
          title: 'Backend Engineer',
          companyId: 'company-1',
          company: { name: 'Acme' },
        }),
      },
      candidateProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'candidate-profile-1', candidateAccountId: 'candidate-account-1' }),
      },
      companyCandidateBlock: { findFirst: jest.fn().mockResolvedValue(null) },
      application: { findUnique: jest.fn().mockResolvedValue(null) },
      talentContactAttempt: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      },
      companySubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sub-1' }),
      },
      talentContactRequest: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'request-1',
          conversationId: 'conv-1',
          candidateProfileId: 'candidate-profile-1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      conversation: {
        create: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      conversationParticipant: {
        upsert: jest.fn().mockResolvedValue({ id: 'participant-1' }),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1', createdAt: new Date() }),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    quota = {
      consume: jest.fn().mockResolvedValue({ usage: { id: 'usage-1' }, replayed: false }),
    };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    messages = { createSystemMessage: jest.fn().mockResolvedValue(undefined) };
    realtime = { emitToUser: jest.fn(), emitToConversation: jest.fn() };
    config = { get: jest.fn().mockReturnValue(true) };

    service = new TalentContactService(
      prisma as PrismaService,
      outbox as unknown as OutboxService,
      messages as unknown as MessageService,
      realtime as unknown as ConversationRealtimeService,
      config as unknown as ConfigService,
      quota as unknown as SubscriptionQuotaService,
    );
  });

  it('tiêu 1 talent_contact qua quota.consume() và gắn quotaUsageId vào attempt', async () => {
    await service.create(dto, user);

    expect(quota.consume).toHaveBeenCalledTimes(1);
    const [, consumeArgs] = quota.consume.mock.calls[0]!;
    expect(consumeArgs).toMatchObject({
      companyId: 'company-1',
      referenceType: 'TALENT_CONTACT_REQUEST',
      referenceId: 'request-1',
    });
    expect(prisma.talentContactAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quotaUsageId: 'usage-1' }) }),
    );
    // Không còn bump `companySubscription.talentContactUsed` thủ công -- quota.consume()
    // là nguồn chặn duy nhất, nên request KHÔNG được tạo khi hết hạn mức.
    expect(prisma.companySubscription.findFirst).toHaveBeenCalledTimes(1);
  });

  it('chặn liên hệ khi hết hạn mức talent_contact, không tạo request/conversation', async () => {
    quota.consume.mockRejectedValue(
      new ConflictException({ code: 'QUOTA_EXHAUSTED', message: 'Quota exhausted' }),
    );

    await expect(service.create(dto, user)).rejects.toMatchObject({
      response: { code: 'QUOTA_EXHAUSTED' },
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.talentContactAttempt.create).not.toHaveBeenCalled();
  });

  it('yêu cầu recruiter phải có quyền outreach', async () => {
    const noPermissionUser = { ...user, permissions: [] };

    await expect(service.create(dto, noPermissionUser)).rejects.toThrow(ForbiddenException);
    expect(quota.consume).not.toHaveBeenCalled();
  });
});
