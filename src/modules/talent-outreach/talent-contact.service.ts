import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ActorType,
  CandidateContactPreferenceStatus,
  ConversationParticipantRole,
  ConversationStatus,
  ConversationType,
  JobStatus,
  JobSearchStatus,
  MessageType,
  ModerationStatus,
  ProfileVisibility,
  SubscriptionFeature,
  SubscriptionStatus,
  TalentContactAttemptOutcome,
  TalentContactStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { MessageService } from '../conversations/services/message.service';
import { ConversationRealtimeService } from '../conversations/services/conversation-realtime.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { CreateTalentContactDto } from './dto/create-talent-contact.dto';
import { TalentContactActionDto } from './dto/talent-contact-action.dto';
import { UpdateContactPreferenceDto } from './dto/update-contact-preference.dto';

const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const RETRY_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1_000;

@Injectable()
export class TalentContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly messages: MessageService,
    private readonly realtime: ConversationRealtimeService,
    private readonly config: ConfigService,
    private readonly quota: SubscriptionQuotaService,
  ) {}

  async create(dto: CreateTalentContactDto, user: AuthenticatedUser) {
    this.assertEnabled();
    this.assertRecruiter(user);
    const idempotencyKey = `talent-contact:${user.companyId}:${dto.clientRequestId}`;
    const previous = await this.prisma.subscriptionUsage.findUnique({
      where: { idempotencyKey },
      include: { talentContactAttempt: { include: { request: true } } },
    });
    if (previous?.talentContactAttempt) return { data: previous.talentContactAttempt.request };

    const context = await this.eligibility(dto, user);
    await this.assertOutreachRate(user);
    const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);

    const result = await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.companySubscription.findFirst({
        where: {
          companyId: user.companyId!,
          status: SubscriptionStatus.ACTIVE,
          expiredAt: { gt: new Date() },
        },
        orderBy: { startedAt: 'desc' },
      });
      if (!subscription) throw new ConflictException('An active subscription is required');

      let request = await tx.talentContactRequest.findUnique({
        where: {
          companyId_candidateProfileId_jobPostId: {
            companyId: user.companyId!,
            candidateProfileId: dto.candidateProfileId,
            jobPostId: dto.jobPostId,
          },
        },
        include: { conversation: true },
      });
      if (
        request &&
        !(
          [TalentContactStatus.EXPIRED, TalentContactStatus.CLOSED] as TalentContactStatus[]
        ).includes(request.status)
      ) {
        throw new ConflictException('An active or final contact relationship already exists');
      }
      if (request && Date.now() - request.updatedAt.getTime() < RETRY_COOLDOWN_MS) {
        throw new ConflictException('Contact request is in cooldown');
      }

      const conversation = request
        ? await tx.conversation.update({
            where: { id: request.conversationId },
            data: {
              status: ConversationStatus.PENDING,
              writableUntil: null,
              readOnlyAt: null,
              closedAt: null,
              closeReason: null,
              version: { increment: 1 },
            },
          })
        : await tx.conversation.create({
            data: {
              type: ConversationType.TALENT_OUTREACH,
              status: ConversationStatus.PENDING,
              companyId: user.companyId,
              jobPostId: dto.jobPostId,
              createdByActorType: ActorType.RECRUITER,
              createdByActorId: user.id,
            },
          });

      const candidateParticipant = await tx.conversationParticipant.upsert({
        where: {
          conversationId_candidateAccountId: {
            conversationId: conversation.id,
            candidateAccountId: context.candidate.candidateAccountId,
          },
        },
        update: { leftAt: null },
        create: {
          conversationId: conversation.id,
          candidateAccountId: context.candidate.candidateAccountId,
          role: ConversationParticipantRole.CANDIDATE,
        },
      });
      const recruiterParticipant = await tx.conversationParticipant.upsert({
        where: {
          conversationId_recruiterAccountId: {
            conversationId: conversation.id,
            recruiterAccountId: user.id,
          },
        },
        update: { leftAt: null },
        create: {
          conversationId: conversation.id,
          recruiterAccountId: user.id,
          role: ConversationParticipantRole.RECRUITER,
        },
      });

      request = request
        ? await tx.talentContactRequest.update({
            where: { id: request.id },
            data: {
              status: TalentContactStatus.PENDING,
              expiresAt,
              respondedAt: null,
              blockedAt: null,
              closedAt: null,
              version: { increment: 1 },
            },
            include: { conversation: true },
          })
        : await tx.talentContactRequest.create({
            data: {
              companyId: user.companyId!,
              candidateProfileId: dto.candidateProfileId,
              jobPostId: dto.jobPostId,
              conversationId: conversation.id,
              status: TalentContactStatus.PENDING,
              expiresAt,
            },
            include: { conversation: true },
          });

      const { usage } = await this.quota.consume(tx, {
        companyId: user.companyId!,
        feature: SubscriptionFeature.TALENT_CONTACT,
        referenceType: 'TALENT_CONTACT_REQUEST',
        referenceId: request.id,
        idempotencyKey,
        createdByRecruiterId: user.id,
      });
      const intro = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderParticipantId: recruiterParticipant.id,
          clientMessageId: dto.clientRequestId,
          type: MessageType.TEXT,
          content: dto.introMessage.trim(),
        },
      });
      const attempt = await tx.talentContactAttempt.create({
        data: {
          requestId: request.id,
          sentByRecruiterId: user.id,
          introMessageId: intro.id,
          quotaUsageId: usage.id,
          clientRequestId: dto.clientRequestId,
          expiresAt,
        },
      });
      await tx.talentContactRequest.update({
        where: { id: request.id },
        data: { currentAttemptId: attempt.id },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          latestMessageId: intro.id,
          latestMessageAt: intro.createdAt,
          version: { increment: 1 },
        },
      });
      await this.outbox.enqueue(
        {
          aggregateType: 'talent_contact_request',
          aggregateId: request.id,
          eventType: 'notification.create',
          dedupeKey: `talent-contact:${request.id}:attempt:${attempt.id}:candidate`,
          payload: {
            recipientId: context.candidate.candidateAccountId,
            recipientType: ActorType.CANDIDATE,
            title: 'Lời mời kết nối mới',
            body: `${context.companyName} muốn trao đổi với bạn về vị trí ${context.jobTitle}.`,
            targetId: request.id,
            targetType: 'TALENT_CONTACT_REQUEST',
          },
        },
        tx,
      );
      void candidateParticipant;
      return { data: { ...request, currentAttemptId: attempt.id } };
    });
    this.realtime.emitToUser(
      'candidate',
      context.candidate.candidateAccountId,
      'talent_request:updated',
      {
        schemaVersion: 1,
        request: result.data,
        reason: 'created',
      },
    );
    return result;
  }

  async accept(id: string, dto: TalentContactActionDto, user: AuthenticatedUser) {
    this.assertEnabled();
    return this.respond(id, dto, user, TalentContactStatus.ACCEPTED);
  }

  async decline(id: string, dto: TalentContactActionDto, user: AuthenticatedUser) {
    this.assertEnabled();
    return this.respond(id, dto, user, TalentContactStatus.DECLINED);
  }

  async blockCompany(id: string, dto: TalentContactActionDto, user: AuthenticatedUser) {
    this.assertEnabled();
    const request = await this.ownedRequest(id, user);
    const activeBlock = await this.prisma.companyCandidateBlock.findFirst({
      where: {
        companyId: request.companyId,
        candidateProfileId: request.candidateProfileId,
        revokedAt: null,
      },
    });
    if (activeBlock) throw new ConflictException('Company is already blocked');
    const result = await this.prisma.$transaction(async (tx) => {
      const block = await tx.companyCandidateBlock.create({
        data: {
          companyId: request.companyId,
          candidateProfileId: request.candidateProfileId,
          createdByCandidateAccountId: user.id,
          reasonCode: dto.reasonCode,
        },
      });
      await tx.talentContactRequest.update({
        where: { id: request.id },
        data: {
          status: TalentContactStatus.BLOCKED,
          blockedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (request.currentAttemptId) {
        await tx.talentContactAttempt.update({
          where: { id: request.currentAttemptId },
          data: { outcome: TalentContactAttemptOutcome.BLOCKED, respondedAt: new Date() },
        });
      }
      await tx.conversation.update({
        where: { id: request.conversationId },
        data: {
          status: ConversationStatus.READ_ONLY,
          readOnlyAt: new Date(),
          closeReason: 'blocked',
          version: { increment: 1 },
        },
      });
      await this.messages.createSystemMessage(
        tx,
        request.conversationId,
        'TALENT_CONTACT_BLOCKED',
        'Ứng viên đã chặn liên hệ chủ động từ công ty này.',
      );
      if (request.currentAttempt) {
        await this.outbox.enqueue(
          {
            aggregateType: 'talent_contact_request',
            aggregateId: request.id,
            eventType: 'notification.create',
            dedupeKey: `talent-contact:${request.id}:blocked:recruiter:${request.currentAttempt.sentByRecruiterId}`,
            payload: {
              recipientId: request.currentAttempt.sentByRecruiterId,
              recipientType: ActorType.RECRUITER,
              title: 'Cập nhật lời mời kết nối',
              body: 'Ứng viên đã từ chối nhận liên hệ chủ động từ công ty.',
              targetId: request.id,
              targetType: 'TALENT_CONTACT_REQUEST',
            },
          },
          tx,
        );
      }
      return { data: block };
    });
    this.emitRequestUpdate(request, 'blocked');
    return result;
  }

  async unblockCompany(companyId: string, user: AuthenticatedUser) {
    if (user.role !== ActorType.CANDIDATE)
      throw new ForbiddenException('Candidate access required');
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId: user.id },
    });
    if (!profile) throw new NotFoundException('Candidate profile not found');
    const changed = await this.prisma.companyCandidateBlock.updateMany({
      where: { companyId, candidateProfileId: profile.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!changed.count) throw new NotFoundException('Active company block not found');
    return { data: { companyId, unblocked: true } };
  }

  async list(user: AuthenticatedUser) {
    this.assertEnabled();
    const where =
      user.role === ActorType.CANDIDATE
        ? { candidateProfile: { candidateAccountId: user.id } }
        : user.role === ActorType.RECRUITER && user.companyId
          ? { companyId: user.companyId }
          : { id: '__forbidden__' };
    if (user.role === ActorType.SYSTEM || user.role === ActorType.ADMIN) {
      throw new ForbiddenException('Talent contact list is not available for this actor');
    }
    return {
      data: await this.prisma.talentContactRequest.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          jobPost: { select: { id: true, title: true } },
          company: { select: { id: true, name: true } },
          conversation: { select: { id: true, status: true, latestMessageAt: true } },
        },
      }),
    };
  }

  async updatePreference(dto: UpdateContactPreferenceDto, user: AuthenticatedUser) {
    if (user.role !== ActorType.CANDIDATE)
      throw new ForbiddenException('Candidate access required');
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId: user.id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Candidate profile not found');
    return {
      data: await this.prisma.candidateContactPreference.upsert({
        where: { candidateProfileId: profile.id },
        update: { status: dto.status, consentVersion: dto.consentVersion },
        create: {
          candidateProfileId: profile.id,
          status: dto.status,
          consentVersion: dto.consentVersion,
        },
      }),
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expirePending() {
    const requests = await this.prisma.talentContactRequest.findMany({
      where: { status: TalentContactStatus.PENDING, expiresAt: { lte: new Date() } },
      select: {
        id: true,
        conversationId: true,
        currentAttemptId: true,
        currentAttempt: { select: { sentByRecruiterId: true } },
        candidateProfile: { select: { candidateAccountId: true } },
      },
      take: 100,
    });
    for (const request of requests) {
      const expired = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.talentContactRequest.updateMany({
          where: {
            id: request.id,
            status: TalentContactStatus.PENDING,
            expiresAt: { lte: new Date() },
          },
          data: { status: TalentContactStatus.EXPIRED, version: { increment: 1 } },
        });
        if (!changed.count) return false;
        if (request.currentAttemptId) {
          await tx.talentContactAttempt.update({
            where: { id: request.currentAttemptId },
            data: { outcome: TalentContactAttemptOutcome.EXPIRED },
          });
        }
        await tx.conversation.update({
          where: { id: request.conversationId },
          data: {
            status: ConversationStatus.READ_ONLY,
            readOnlyAt: new Date(),
            closeReason: 'expired',
            version: { increment: 1 },
          },
        });
        await this.messages.createSystemMessage(
          tx,
          request.conversationId,
          'TALENT_CONTACT_EXPIRED',
          'Lời mời kết nối đã hết hạn.',
        );
        await this.outbox.enqueue(
          {
            aggregateType: 'talent_contact_request',
            aggregateId: request.id,
            eventType: 'notification.create',
            dedupeKey: `talent-contact:${request.id}:expired:candidate`,
            payload: {
              recipientId: request.candidateProfile.candidateAccountId,
              recipientType: ActorType.CANDIDATE,
              title: 'Lời mời kết nối đã hết hạn',
              body: 'Một lời mời kết nối của bạn đã hết thời hạn phản hồi.',
              targetId: request.id,
              targetType: 'TALENT_CONTACT_REQUEST',
            },
          },
          tx,
        );
        if (request.currentAttempt) {
          await this.outbox.enqueue(
            {
              aggregateType: 'talent_contact_request',
              aggregateId: request.id,
              eventType: 'notification.create',
              dedupeKey: `talent-contact:${request.id}:expired:recruiter:${request.currentAttempt.sentByRecruiterId}`,
              payload: {
                recipientId: request.currentAttempt.sentByRecruiterId,
                recipientType: ActorType.RECRUITER,
                title: 'Lời mời kết nối đã hết hạn',
                body: 'Ứng viên chưa phản hồi lời mời trong thời hạn cho phép.',
                targetId: request.id,
                targetType: 'TALENT_CONTACT_REQUEST',
              },
            },
            tx,
          );
        }
        return true;
      });
      if (expired) this.emitRequestUpdate(request, 'expired');
    }
  }

  private async respond(
    id: string,
    dto: TalentContactActionDto,
    user: AuthenticatedUser,
    next: TalentContactStatus,
  ) {
    const request = await this.ownedRequest(id, user);
    if (request.status !== TalentContactStatus.PENDING) {
      throw new ConflictException('Contact request is no longer pending');
    }
    if (request.expiresAt <= new Date()) throw new ConflictException('Contact request has expired');
    const expectedVersion = dto.expectedVersion ?? request.version;
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.talentContactRequest.updateMany({
        where: { id, status: TalentContactStatus.PENDING, version: expectedVersion },
        data: { status: next, respondedAt: new Date(), version: { increment: 1 } },
      });
      if (!changed.count) throw new ConflictException('Contact request changed; reload and retry');
      if (request.currentAttemptId) {
        await tx.talentContactAttempt.update({
          where: { id: request.currentAttemptId },
          data: {
            outcome:
              next === TalentContactStatus.ACCEPTED
                ? TalentContactAttemptOutcome.ACCEPTED
                : TalentContactAttemptOutcome.DECLINED,
            respondedAt: new Date(),
          },
        });
      }
      await tx.conversation.update({
        where: { id: request.conversationId },
        data: {
          status:
            next === TalentContactStatus.ACCEPTED
              ? ConversationStatus.ACTIVE
              : ConversationStatus.READ_ONLY,
          readOnlyAt: next === TalentContactStatus.ACCEPTED ? null : new Date(),
          closeReason: next === TalentContactStatus.ACCEPTED ? null : 'declined',
          version: { increment: 1 },
        },
      });
      await this.messages.createSystemMessage(
        tx,
        request.conversationId,
        next === TalentContactStatus.ACCEPTED
          ? 'TALENT_CONTACT_ACCEPTED'
          : 'TALENT_CONTACT_DECLINED',
        next === TalentContactStatus.ACCEPTED
          ? 'Ứng viên đã chấp nhận lời mời kết nối.'
          : 'Ứng viên đã từ chối lời mời kết nối.',
      );
      if (request.currentAttempt) {
        await this.outbox.enqueue(
          {
            aggregateType: 'talent_contact_request',
            aggregateId: request.id,
            eventType: 'notification.create',
            dedupeKey: `talent-contact:${request.id}:${next.toLowerCase()}:recruiter:${request.currentAttempt.sentByRecruiterId}`,
            payload: {
              recipientId: request.currentAttempt.sentByRecruiterId,
              recipientType: ActorType.RECRUITER,
              title: 'Cập nhật lời mời kết nối',
              body:
                next === TalentContactStatus.ACCEPTED
                  ? 'Ứng viên đã chấp nhận lời mời kết nối.'
                  : 'Ứng viên đã từ chối lời mời kết nối.',
              targetId: request.id,
              targetType: 'TALENT_CONTACT_REQUEST',
            },
          },
          tx,
        );
      }
      return { data: await tx.talentContactRequest.findUniqueOrThrow({ where: { id } }) };
    });
    this.emitRequestUpdate(request, next.toLowerCase());
    return result;
  }

  private async ownedRequest(id: string, user: AuthenticatedUser) {
    if (user.role !== ActorType.CANDIDATE)
      throw new ForbiddenException('Candidate access required');
    const request = await this.prisma.talentContactRequest.findFirst({
      where: { id, candidateProfile: { candidateAccountId: user.id } },
      include: {
        currentAttempt: { select: { sentByRecruiterId: true } },
        candidateProfile: { select: { candidateAccountId: true } },
      },
    });
    if (!request) throw new NotFoundException('Contact request not found');
    return request;
  }

  private emitRequestUpdate(
    request: {
      id: string;
      conversationId: string;
      currentAttempt: { sentByRecruiterId: string } | null;
      candidateProfile: { candidateAccountId: string };
    },
    reason: string,
  ) {
    const payload = { schemaVersion: 1, requestId: request.id, reason };
    this.realtime.emitToConversation(request.conversationId, 'talent_request:updated', payload);
    this.realtime.emitToUser(
      'candidate',
      request.candidateProfile.candidateAccountId,
      'talent_request:updated',
      payload,
    );
    if (request.currentAttempt) {
      this.realtime.emitToUser(
        'recruiter',
        request.currentAttempt.sentByRecruiterId,
        'talent_request:updated',
        payload,
      );
    }
  }

  private async eligibility(dto: CreateTalentContactDto, user: AuthenticatedUser) {
    const [job, candidate, block, application] = await Promise.all([
      this.prisma.jobPost.findFirst({
        where: {
          id: dto.jobPostId,
          companyId: user.companyId!,
          status: JobStatus.PUBLISHED,
          moderationStatus: ModerationStatus.APPROVED,
          isHidden: false,
          deletedAt: null,
          OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
        },
        select: { id: true, title: true, companyId: true, company: { select: { name: true } } },
      }),
      this.prisma.candidateProfile.findFirst({
        where: {
          id: dto.candidateProfileId,
          jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
          profileVisibility: ProfileVisibility.PUBLIC,
          contactPreference: { is: { status: CandidateContactPreferenceStatus.OPTED_IN } },
        },
        select: { id: true, candidateAccountId: true },
      }),
      this.prisma.companyCandidateBlock.findFirst({
        where: {
          companyId: user.companyId!,
          candidateProfileId: dto.candidateProfileId,
          revokedAt: null,
        },
      }),
      this.prisma.application.findUnique({
        where: {
          candidateProfileId_jobPostId: {
            candidateProfileId: dto.candidateProfileId,
            jobPostId: dto.jobPostId,
          },
        },
      }),
    ]);
    if (!job || !candidate) throw new NotFoundException('Eligible candidate or job not found');
    if (block) throw new ConflictException('Candidate has blocked this company');
    if (application) throw new ConflictException('Candidate already applied to this job');
    return { jobTitle: job.title, companyName: job.company.name, candidate };
  }

  private assertRecruiter(user: AuthenticatedUser) {
    if (
      user.role !== ActorType.RECRUITER ||
      !user.companyId ||
      !user.permissions.some((code) =>
        ['applications:manage', 'applications:review_assigned'].includes(code),
      )
    ) {
      throw new ForbiddenException('Talent outreach permission required');
    }
  }

  private async assertOutreachRate(user: AuthenticatedUser) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const [recruiterAttempts, companyAttempts] = await Promise.all([
      this.prisma.talentContactAttempt.count({
        where: { sentByRecruiterId: user.id, sentAt: { gte: since } },
      }),
      this.prisma.talentContactAttempt.count({
        where: { request: { companyId: user.companyId! }, sentAt: { gte: since } },
      }),
    ]);
    if (recruiterAttempts >= 20 || companyAttempts >= 100) {
      throw new ConflictException({
        code: 'OUTREACH_RATE_LIMITED',
        message: 'Daily talent outreach limit reached',
      });
    }
  }

  private assertEnabled() {
    if (!this.config.get<boolean>('chatOutreachEnabled')) {
      throw new ServiceUnavailableException('Talent outreach is not enabled');
    }
  }
}
