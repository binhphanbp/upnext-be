import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus, ActorType, ConversationParticipantRole, Prisma } from '@prisma/client';
import { isJobPostAccessibleToRecruiter } from '../../common/authorization/job-post-access';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AssignApplicationDto, UnassignApplicationDto } from './dto/assign-application.dto';

@Injectable()
export class ApplicationAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(applicationId: string, dto: AssignApplicationDto, user: AuthenticatedUser) {
    const context = await this.applicationContext(applicationId, user.id);
    this.assertCanManage(context.jobPost, user);
    const target = await this.prisma.recruiterAccount.findFirst({
      where: {
        id: dto.recruiterAccountId,
        companyId: context.jobPost.companyId,
        status: AccountStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Recruiter not found in this company');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.applicationAssignment.findFirst({
        where: { applicationId, recruiterAccountId: target.id, unassignedAt: null },
      });
      if (existing) throw new ConflictException('Recruiter is already assigned');
      const assignment = await tx.applicationAssignment.create({
        data: {
          applicationId,
          recruiterAccountId: target.id,
          assignedByActorType: user.role,
          assignedByActorId: user.id,
          reason: dto.reason,
        },
      });
      if (context.conversation) {
        await tx.conversationParticipant.upsert({
          where: {
            conversationId_recruiterAccountId: {
              conversationId: context.conversation.id,
              recruiterAccountId: target.id,
            },
          },
          update: { leftAt: null },
          create: {
            conversationId: context.conversation.id,
            recruiterAccountId: target.id,
            role: ConversationParticipantRole.RECRUITER,
          },
        });
      }
      return assignment;
    });
  }

  async unassign(
    applicationId: string,
    assignmentId: string,
    dto: UnassignApplicationDto,
    user: AuthenticatedUser,
  ) {
    const context = await this.applicationContext(applicationId, user.id);
    this.assertCanManage(context.jobPost, user);
    return this.prisma.$transaction(
      async (tx) => {
        const assignment = await tx.applicationAssignment.findFirst({
          where: { id: assignmentId, applicationId, unassignedAt: null },
        });
        if (!assignment) throw new NotFoundException('Active assignment not found');
        const remaining = await tx.applicationAssignment.count({
          where: { applicationId, unassignedAt: null, id: { not: assignmentId } },
        });
        if (!remaining) {
          throw new ConflictException(
            'Assign a replacement recruiter before removing the final assignee',
          );
        }
        const updated = await tx.applicationAssignment.update({
          where: { id: assignment.id },
          data: { unassignedAt: new Date(), reason: dto.reason ?? assignment.reason },
        });
        if (context.conversation) {
          const remainsOnJobTeam = await tx.jobHiringTeamMember.findFirst({
            where: {
              jobPostId: context.jobPost.id,
              recruiterAccountId: assignment.recruiterAccountId,
              leftAt: null,
            },
            select: { id: true },
          });
          const participant = await tx.conversationParticipant.findFirst({
            where: {
              conversationId: context.conversation.id,
              recruiterAccountId: assignment.recruiterAccountId,
              leftAt: null,
            },
            select: { id: true, explicitlyAdded: true },
          });
          const isJobAuthor =
            context.jobPost.createdByRecruiterId === assignment.recruiterAccountId;
          if (participant && !isJobAuthor && !remainsOnJobTeam && !participant.explicitlyAdded) {
            await tx.conversationParticipant.update({
              where: { id: participant.id },
              data: { leftAt: new Date() },
            });
          }
        }
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private applicationContext(applicationId: string, recruiterId: string) {
    return this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      select: {
        jobPost: {
          select: {
            id: true,
            companyId: true,
            createdByRecruiterId: true,
            // Chỉ lấy bản ghi thu hồi của chính người đang gọi, đủ để biết họ còn quyền hay không.
            accessRevocations: {
              where: { recruiterAccountId: recruiterId },
              select: { id: true },
              take: 1,
            },
          },
        },
        conversation: { select: { id: true } },
      },
    });
  }

  private assertCanManage(
    jobPost: { companyId: string; createdByRecruiterId: string; accessRevocations: unknown[] },
    user: AuthenticatedUser,
  ) {
    if (
      user.role !== ActorType.RECRUITER ||
      user.companyId !== jobPost.companyId ||
      !user.permissions.includes('applications:manage') ||
      !isJobPostAccessibleToRecruiter(jobPost, user.id)
    ) {
      throw new ForbiddenException('You cannot manage application assignments');
    }
  }
}
