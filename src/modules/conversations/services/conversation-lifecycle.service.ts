import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActorType,
  ApplicationStatus,
  ConversationParticipantRole,
  ConversationStatus,
  ConversationType,
  Prisma,
} from '@prisma/client';
import { MessageService } from './message.service';

const applicationChatStatuses = new Set<ApplicationStatus>([
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.VIEWED,
  ApplicationStatus.CONSIDERING,
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.INTERVIEWING,
  ApplicationStatus.OFFERED,
  ApplicationStatus.HIRED,
]);

@Injectable()
export class ConversationLifecycleService {
  constructor(
    private readonly messages: MessageService,
    private readonly config: ConfigService,
  ) {}

  async applyApplicationStatus(
    tx: Prisma.TransactionClient,
    applicationId: string,
    status: ApplicationStatus,
    actor: { type: ActorType; id?: string | null },
  ) {
    if (!this.config.get<boolean>('chatApplicationEnabled')) return null;
    if (applicationChatStatuses.has(status)) {
      return this.ensureApplicationConversation(tx, applicationId, actor, status);
    }

    if (status === ApplicationStatus.REJECTED || status === ApplicationStatus.WITHDRAWN) {
      const conversation = await tx.conversation.findUnique({ where: { applicationId } });
      if (!conversation) return null;
      const writableUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
      const updated = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          status: ConversationStatus.ACTIVE,
          writableUntil,
          readOnlyAt: null,
          closeReason: status.toLowerCase(),
          version: { increment: 1 },
        },
      });
      await this.messages.createSystemMessage(
        tx,
        updated.id,
        'APPLICATION_CHAT_GRACE_STARTED',
        'Hội thoại sẽ chuyển sang chỉ đọc sau 7 ngày.',
        { applicationStatus: status, writableUntil: writableUntil.toISOString() },
      );
      return updated;
    }

    return null;
  }

  async ensureApplicationConversation(
    tx: Prisma.TransactionClient,
    applicationId: string,
    actor: { type: ActorType; id?: string | null },
    reason: ApplicationStatus | 'INTERVIEW_SCHEDULED',
  ) {
    if (!this.config.get<boolean>('chatApplicationEnabled')) return null;
    const application = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        id: true,
        candidateProfile: { select: { candidateAccountId: true } },
        jobPost: {
          select: {
            id: true,
            companyId: true,
            createdByRecruiterId: true,
            hiringTeamMembers: {
              where: { leftAt: null },
              select: { recruiterAccountId: true },
            },
          },
        },
        assignments: {
          where: { unassignedAt: null },
          select: { recruiterAccountId: true },
        },
      },
    });
    const existing = await tx.conversation.findUnique({ where: { applicationId } });
    const conversation = await tx.conversation.upsert({
      where: { applicationId },
      update: {
        status: ConversationStatus.ACTIVE,
        writableUntil: null,
        readOnlyAt: null,
        closedAt: null,
        closeReason: null,
        version: { increment: 1 },
      },
      create: {
        type: ConversationType.APPLICATION_CHAT,
        status: ConversationStatus.ACTIVE,
        companyId: application.jobPost.companyId,
        applicationId: application.id,
        jobPostId: application.jobPost.id,
        createdByActorType: actor.type,
        createdByActorId: actor.id,
      },
    });

    await tx.conversationParticipant.upsert({
      where: {
        conversationId_candidateAccountId: {
          conversationId: conversation.id,
          candidateAccountId: application.candidateProfile.candidateAccountId,
        },
      },
      update: { leftAt: null },
      create: {
        conversationId: conversation.id,
        candidateAccountId: application.candidateProfile.candidateAccountId,
        role: ConversationParticipantRole.CANDIDATE,
      },
    });
    // At submission this is deliberately just the job author (the initial
    // assignment). The hiring team is opt-in per job and can be expanded later.
    const recruiterIds = new Set(application.assignments.map((entry) => entry.recruiterAccountId));
    for (const member of application.jobPost.hiringTeamMembers ?? []) {
      recruiterIds.add(member.recruiterAccountId);
    }
    if (actor.type === ActorType.RECRUITER && actor.id) {
      recruiterIds.add(actor.id);
    }
    if (!recruiterIds.size) {
      recruiterIds.add(application.jobPost.createdByRecruiterId);
    }
    for (const recruiterAccountId of recruiterIds) {
      await tx.conversationParticipant.upsert({
        where: {
          conversationId_recruiterAccountId: {
            conversationId: conversation.id,
            recruiterAccountId,
          },
        },
        update: { leftAt: null },
        create: {
          conversationId: conversation.id,
          recruiterAccountId,
          role: ConversationParticipantRole.RECRUITER,
        },
      });
    }

    if (!existing || existing.status !== ConversationStatus.ACTIVE || existing.writableUntil) {
      await this.messages.createSystemMessage(
        tx,
        conversation.id,
        existing ? 'APPLICATION_CHAT_REOPENED' : 'APPLICATION_CHAT_OPENED',
        'Hội thoại ứng tuyển đã được mở.',
        { reason },
      );
    }
    return conversation;
  }
}
