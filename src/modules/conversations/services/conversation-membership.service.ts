import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, ConversationParticipantRole, ConversationType } from '@prisma/client';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConversationPolicyService } from './conversation-policy.service';

const recruiterSelect = {
  id: true,
  email: true,
  profile: { select: { fullName: true, avatarUrl: true } },
} as const;

@Injectable()
export class ConversationMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ConversationPolicyService,
  ) {}

  async listRecruiters(conversationId: string, user: AuthenticatedUser) {
    const context = await this.policy.assertCanManageApplicationChat(conversationId, user);
    const [recruiters, participants, hiringTeam] = await Promise.all([
      this.prisma.recruiterAccount.findMany({
        where: { companyId: context.companyId!, status: AccountStatus.ACTIVE },
        select: recruiterSelect,
        orderBy: [{ profile: { fullName: 'asc' } }, { email: 'asc' }],
      }),
      this.prisma.conversationParticipant.findMany({
        where: { conversationId, recruiterAccountId: { not: null }, leftAt: null },
        select: { recruiterAccountId: true },
      }),
      this.prisma.jobHiringTeamMember.findMany({
        where: { jobPostId: context.jobPostId!, leftAt: null },
        select: { recruiterAccountId: true },
      }),
    ]);
    const participantIds = new Set(participants.map((item) => item.recruiterAccountId));
    const hiringTeamIds = new Set(hiringTeam.map((item) => item.recruiterAccountId));
    return {
      data: recruiters.map((recruiter) => ({
        ...recruiter,
        isConversationParticipant: participantIds.has(recruiter.id),
        isHiringTeamMember: hiringTeamIds.has(recruiter.id),
      })),
    };
  }

  async listHiringTeam(conversationId: string, user: AuthenticatedUser) {
    const context = await this.policy.assertCanManageApplicationChat(conversationId, user);
    const members = await this.prisma.jobHiringTeamMember.findMany({
      where: { jobPostId: context.jobPostId!, leftAt: null },
      orderBy: { joinedAt: 'asc' },
      select: {
        id: true,
        recruiterAccountId: true,
        joinedAt: true,
        recruiterAccount: { select: recruiterSelect },
      },
    });
    return { data: members };
  }

  async addToConversation(
    conversationId: string,
    recruiterAccountId: string,
    user: AuthenticatedUser,
  ) {
    const context = await this.policy.assertCanManageApplicationChat(conversationId, user);
    const recruiter = await this.assertActiveCompanyRecruiter(
      recruiterAccountId,
      context.companyId!,
    );
    const participant = await this.prisma.conversationParticipant.upsert({
      where: {
        conversationId_recruiterAccountId: { conversationId, recruiterAccountId: recruiter.id },
      },
      update: { leftAt: null, explicitlyAdded: true },
      create: {
        conversationId,
        recruiterAccountId: recruiter.id,
        role: ConversationParticipantRole.RECRUITER,
        explicitlyAdded: true,
      },
      select: {
        id: true,
        recruiterAccountId: true,
        joinedAt: true,
        recruiterAccount: { select: recruiterSelect },
      },
    });
    return { data: participant };
  }

  async addToHiringTeam(
    conversationId: string,
    recruiterAccountId: string,
    user: AuthenticatedUser,
  ) {
    const context = await this.policy.assertCanManageApplicationChat(conversationId, user);
    const recruiter = await this.assertActiveCompanyRecruiter(
      recruiterAccountId,
      context.companyId!,
    );
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.jobHiringTeamMember.upsert({
        where: {
          jobPostId_recruiterAccountId: {
            jobPostId: context.jobPostId!,
            recruiterAccountId: recruiter.id,
          },
        },
        update: { leftAt: null, joinedAt: now, addedByRecruiterId: user.id },
        create: {
          jobPostId: context.jobPostId!,
          recruiterAccountId: recruiter.id,
          addedByRecruiterId: user.id,
          joinedAt: now,
        },
        select: {
          id: true,
          recruiterAccountId: true,
          joinedAt: true,
          recruiterAccount: { select: recruiterSelect },
        },
      });

      const conversations = await tx.conversation.findMany({
        where: { type: ConversationType.APPLICATION_CHAT, jobPostId: context.jobPostId! },
        select: { id: true },
      });
      for (const conversation of conversations) {
        await tx.conversationParticipant.upsert({
          where: {
            conversationId_recruiterAccountId: {
              conversationId: conversation.id,
              recruiterAccountId: recruiter.id,
            },
          },
          update: { leftAt: null },
          create: {
            conversationId: conversation.id,
            recruiterAccountId: recruiter.id,
            role: ConversationParticipantRole.RECRUITER,
          },
        });
      }
      return { data: { member, conversationsUpdated: conversations.length } };
    });
  }

  private async assertActiveCompanyRecruiter(recruiterAccountId: string, companyId: string) {
    const recruiter = await this.prisma.recruiterAccount.findFirst({
      where: { id: recruiterAccountId, companyId, status: AccountStatus.ACTIVE },
      select: recruiterSelect,
    });
    if (!recruiter) throw new NotFoundException('Recruiter not found in this company');
    return recruiter;
  }
}
