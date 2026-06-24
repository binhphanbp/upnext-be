import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, InterviewResult, InterviewStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { RescheduleInterviewDto } from './dto/reschedule-interview.dto';
import { CancelInterviewDto } from './dto/cancel-interview.dto';
import { UpdateInterviewResultDto } from './dto/update-interview-result.dto';

@Injectable()
export class InterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInterviewDto, user: AuthenticatedUser) {
    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
      include: {
        jobPost: true,
      },
    });

    if (!application) {
      throw new NotFoundException(`Application ${dto.applicationId} not found`);
    }

    // Role checks
    if (user.role === ActorType.RECRUITER) {
      if (application.jobPost.companyId !== user.companyId) {
        throw new ForbiddenException('You do not have permission to schedule interviews for this application');
      }
    }

    let recruiterProfileId = dto.recruiterProfileId;

    if (recruiterProfileId) {
      // Ensure target recruiter profile exists and belongs to the same company
      const profile = await this.prisma.recruiterProfile.findUnique({
        where: { id: recruiterProfileId },
        include: { recruiterAccount: true },
      });

      if (!profile) {
        throw new NotFoundException(`Recruiter profile ${recruiterProfileId} not found`);
      }

      if (user.role === ActorType.RECRUITER && profile.recruiterAccount.companyId !== user.companyId) {
        throw new ForbiddenException('Cannot assign an interviewer from another company');
      }
    } else {
      if (user.role === ActorType.ADMIN) {
        throw new BadRequestException('recruiterProfileId is required for admin users');
      }

      const profile = await this.prisma.recruiterProfile.findUnique({
        where: { recruiterAccountId: user.id },
      });

      if (!profile) {
        throw new NotFoundException(`Recruiter profile not found for your account`);
      }

      recruiterProfileId = profile.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.create({
        data: {
          applicationId: dto.applicationId,
          recruiterProfileId: recruiterProfileId,
          interviewRound: dto.interviewRound ?? 1,
          type: dto.type ?? 'ONLINE',
          scheduledStartAt: new Date(dto.scheduledStartAt),
          scheduledEndAt: new Date(dto.scheduledEndAt),
          meetingUrl: dto.meetingUrl ?? null,
          location: dto.location ?? null,
          recruiterNote: dto.recruiterNote ?? null,
          candidateNote: dto.candidateNote ?? null,
          status: InterviewStatus.SCHEDULED,
          result: InterviewResult.PENDING,
        },
      });

      await tx.interviewLog.create({
        data: {
          interviewId: interview.id,
          newStatus: InterviewStatus.SCHEDULED,
          actorType: user.role,
          actorId: user.id,
          note: 'Phỏng vấn được tạo và lên lịch mới.',
        },
      });

      return interview;
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: true,
          },
        },
        recruiterProfile: true,
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${id} not found`);
    }

    this.checkAccessPermission(interview, user);

    return interview;
  }

  async findAll(query: { applicationId?: string }, user: AuthenticatedUser) {
    const where: Prisma.InterviewWhereInput = {};

    if (user.role === ActorType.CANDIDATE) {
      where.application = {
        candidateProfile: {
          candidateAccountId: user.id,
        },
      };
    } else if (user.role === ActorType.RECRUITER) {
      where.application = {
        jobPost: {
          companyId: user.companyId || undefined,
        },
      };
    }

    if (query.applicationId) {
      where.applicationId = query.applicationId;
    }

    return this.prisma.interview.findMany({
      where,
      orderBy: { scheduledStartAt: 'asc' },
      include: {
        application: {
          include: {
            jobPost: {
              select: {
                title: true,
                company: { select: { name: true } },
              },
            },
            candidateProfile: {
              select: {
                phoneNumber: true,
                account: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
          },
        },
        recruiterProfile: {
          select: {
            fullName: true,
          },
        },
      },
    });
  }

  async reschedule(id: string, dto: RescheduleInterviewDto, user: AuthenticatedUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${id} not found`);
    }

    this.checkAccessPermission(interview, user);

    if (
      interview.status === InterviewStatus.CANCELLED ||
      interview.status === InterviewStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot reschedule a cancelled or completed interview');
    }

    if (interview.rescheduleCount >= interview.maxRescheduleCount) {
      throw new BadRequestException(`Maximum reschedule count of ${interview.maxRescheduleCount} reached`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.interview.update({
        where: { id },
        data: {
          scheduledStartAt: new Date(dto.scheduledStartAt),
          scheduledEndAt: new Date(dto.scheduledEndAt),
          status: InterviewStatus.RESCHEDULED,
          rescheduleCount: {
            increment: 1,
          },
        },
      });

      await tx.interviewLog.create({
        data: {
          interviewId: id,
          oldStatus: interview.status,
          newStatus: InterviewStatus.RESCHEDULED,
          proposedStartAt: new Date(dto.scheduledStartAt),
          proposedEndAt: new Date(dto.scheduledEndAt),
          actorType: user.role,
          actorId: user.id,
          note: dto.note ?? 'Lịch phỏng vấn được dời thời gian.',
        },
      });

      return updated;
    });
  }

  async cancel(id: string, dto: CancelInterviewDto, user: AuthenticatedUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${id} not found`);
    }

    this.checkAccessPermission(interview, user);

    if (
      interview.status === InterviewStatus.CANCELLED ||
      interview.status === InterviewStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot cancel a cancelled or completed interview');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.interview.update({
        where: { id },
        data: {
          status: InterviewStatus.CANCELLED,
        },
      });

      await tx.interviewLog.create({
        data: {
          interviewId: id,
          oldStatus: interview.status,
          newStatus: InterviewStatus.CANCELLED,
          actorType: user.role,
          actorId: user.id,
          note: dto.note,
        },
      });

      return updated;
    });
  }

  async updateResult(id: string, dto: UpdateInterviewResultDto, user: AuthenticatedUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${id} not found`);
    }

    // Candidates cannot update interview results
    if (user.role !== ActorType.ADMIN && user.role !== ActorType.RECRUITER) {
      throw new ForbiddenException('Only admins and recruiters can update interview results');
    }

    if (user.role === ActorType.RECRUITER && interview.application.jobPost.companyId !== user.companyId) {
      throw new ForbiddenException('You do not have permission to manage this interview');
    }

    if (interview.status === InterviewStatus.CANCELLED) {
      throw new BadRequestException('Cannot update result of a cancelled interview');
    }

    return this.prisma.$transaction(async (tx) => {
      const feedback = dto.feedbackNote ? `[Feedback]: ${dto.feedbackNote}` : '';
      const updatedNote = interview.recruiterNote
        ? `${interview.recruiterNote}\n${feedback}`.trim()
        : feedback;

      const updated = await tx.interview.update({
        where: { id },
        data: {
          result: dto.result,
          status: InterviewStatus.COMPLETED,
          recruiterNote: updatedNote || null,
        },
      });

      await tx.interviewLog.create({
        data: {
          interviewId: id,
          oldStatus: interview.status,
          newStatus: InterviewStatus.COMPLETED,
          actorType: user.role,
          actorId: user.id,
          note: `Cập nhật kết quả phỏng vấn: ${dto.result}`,
        },
      });

      return updated;
    });
  }

  private checkAccessPermission(
    interview: any,
    user: AuthenticatedUser,
  ) {
    if (user.role === ActorType.CANDIDATE) {
      if (interview.application.candidateProfile.candidateAccountId !== user.id) {
        throw new ForbiddenException('You do not have permission to access this interview');
      }
    } else if (user.role === ActorType.RECRUITER) {
      if (interview.application.jobPost.companyId !== user.companyId) {
        throw new ForbiddenException('You do not have permission to access this interview');
      }
    }
  }
}
