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
import { recruiterAccessibleJobPostFilter } from '../../common/authorization/job-post-access';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationLifecycleService } from '../conversations/services/conversation-lifecycle.service';

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly conversationLifecycle: ConversationLifecycleService,
  ) {}

  async create(dto: CreateInterviewDto, user: AuthenticatedUser) {
    const start = new Date(dto.scheduledStartAt);
    const end = new Date(dto.scheduledEndAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Bắt buộc nhập Ngày Giờ phỏng vấn hợp lệ');
    }

    if (start.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Ngày hẹn không hợp lệ. Thời gian phỏng vấn phải ở tương lai.');
    }

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu.');
    }

    const application = await this.prisma.application.findUnique({
      where: { id: dto.applicationId },
      include: {
        jobPost: true,
        assignments: {
          where: { unassignedAt: null },
          select: { recruiterAccountId: true },
        },
        candidateProfile: {
          select: {
            candidateAccountId: true,
          },
        },
      },
    });

    if (!application) {
      throw new NotFoundException(`Application ${dto.applicationId} not found`);
    }

    // Role checks
    if (user.role === ActorType.RECRUITER) {
      const assigned = application.assignments.some(
        (assignment) => assignment.recruiterAccountId === user.id,
      );
      const allowed =
        application.jobPost.companyId === user.companyId &&
        (user.permissions.includes('interviews:manage') ||
          (assigned && user.permissions.includes('interviews:review_assigned')));
      if (!allowed) {
        throw new ForbiddenException(
          'You do not have permission to schedule interviews for this application',
        );
      }
      await this.assertRecruiterCanAccessJobPost(user.id, application.jobPostId);
    } else if (user.role !== ActorType.ADMIN || !user.permissions.includes('interviews:manage')) {
      throw new ForbiddenException('Interview management permission required');
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

      if (
        user.role === ActorType.RECRUITER &&
        profile.recruiterAccount.companyId !== user.companyId
      ) {
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

    const targetRound = dto.interviewRound ?? 1;

    // Prevent duplicate rounds for the same application
    const existingRound = await this.prisma.interview.findFirst({
      where: {
        applicationId: dto.applicationId,
        interviewRound: targetRound,
        status: { not: InterviewStatus.CANCELLED },
      },
    });
    if (existingRound) {
      throw new BadRequestException(
        `Vòng phỏng vấn ${targetRound} đã tồn tại cho hồ sơ này.`,
      );
    }

    // Enforce sequential rounds: round N requires round N-1 to be COMPLETED + PASSED
    if (targetRound > 1) {
      const previousRound = await this.prisma.interview.findFirst({
        where: {
          applicationId: dto.applicationId,
          interviewRound: targetRound - 1,
          status: { not: InterviewStatus.CANCELLED },
        },
      });
      if (!previousRound) {
        throw new BadRequestException(
          `Không thể tạo vòng ${targetRound} — vòng ${targetRound - 1} chưa tồn tại.`,
        );
      }
      if (
        previousRound.status !== InterviewStatus.COMPLETED ||
        previousRound.result !== InterviewResult.PASSED
      ) {
        throw new BadRequestException(
          `Không thể tạo vòng ${targetRound} — vòng ${targetRound - 1} chưa hoàn thành hoặc chưa đạt.`,
        );
      }
    }

    const interview = await this.prisma.$transaction(async (tx) => {
      const createdInterview = await tx.interview.create({
        data: {
          applicationId: dto.applicationId,
          recruiterProfileId: recruiterProfileId,
          interviewRound: targetRound,
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
          interviewId: createdInterview.id,
          newStatus: InterviewStatus.SCHEDULED,
          actorType: user.role,
          actorId: user.id,
          note: 'Phỏng vấn được tạo và lên lịch mới.',
        },
      });

      await this.conversationLifecycle.ensureApplicationConversation(
        tx,
        dto.applicationId,
        { type: user.role, id: user.id },
        'INTERVIEW_SCHEDULED',
      );

      return createdInterview;
    });

    if (application.candidateProfile?.candidateAccountId) {
      this.notificationsService
        .createNotification({
          recipientId: application.candidateProfile.candidateAccountId,
          recipientType: ActorType.CANDIDATE,
          title: 'Lịch hẹn phỏng vấn mới',
          body: `Bạn có một lịch hẹn phỏng vấn mới cho vị trí ${application.jobPost.title}.`,
          targetType: 'INTERVIEW',
          targetId: interview.id,
        })
        .catch(() => {});
    }

    return interview;
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: {
              include: {
                account: {
                  select: {
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
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

    await this.checkAccessPermission(interview, user);

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
          ...recruiterAccessibleJobPostFilter(user.id),
        },
      };
    }

    if (query.applicationId) {
      where.applicationId = query.applicationId;
    }

    return this.prisma.interview.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { scheduledStartAt: 'desc' }],
      include: {
        application: {
          include: {
            jobPost: {
              select: {
                id: true,
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
    const start = new Date(dto.scheduledStartAt);
    const end = new Date(dto.scheduledEndAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Bắt buộc nhập Ngày Giờ phỏng vấn hợp lệ');
    }

    if (start.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Ngày hẹn không hợp lệ. Thời gian phỏng vấn phải ở tương lai.');
    }

    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu.');
    }

    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: {
              select: {
                candidateAccountId: true,
              },
            },
          },
        },
        recruiterProfile: {
          select: {
            recruiterAccountId: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${id} not found`);
    }

    await this.checkAccessPermission(interview, user);

    if (
      interview.status === InterviewStatus.CANCELLED ||
      interview.status === InterviewStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot reschedule a cancelled or completed interview');
    }

    if (interview.rescheduleCount >= interview.maxRescheduleCount) {
      throw new BadRequestException(
        `Maximum reschedule count of ${interview.maxRescheduleCount} reached`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedInterview = await tx.interview.update({
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

      return updatedInterview;
    });

    const isCandidate = user.role === ActorType.CANDIDATE;
    const recipientId = isCandidate
      ? interview.recruiterProfile?.recruiterAccountId
      : interview.application.candidateProfile?.candidateAccountId;
    const recipientType = isCandidate ? ActorType.RECRUITER : ActorType.CANDIDATE;

    if (recipientId) {
      this.notificationsService
        .createNotification({
          recipientId,
          recipientType,
          title: 'Lịch phỏng vấn thay đổi',
          body: `Lịch phỏng vấn vị trí ${interview.application.jobPost.title} đã được dời thời gian.`,
          targetType: 'INTERVIEW',
          targetId: id,
        })
        .catch(() => {});
    }

    return updated;
  }

  async cancel(id: string, dto: CancelInterviewDto, user: AuthenticatedUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: {
              select: {
                candidateAccountId: true,
              },
            },
          },
        },
        recruiterProfile: {
          select: {
            recruiterAccountId: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${id} not found`);
    }

    await this.checkAccessPermission(interview, user);

    if (
      interview.status === InterviewStatus.CANCELLED ||
      interview.status === InterviewStatus.COMPLETED
    ) {
      throw new BadRequestException('Cannot cancel a cancelled or completed interview');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedInterview = await tx.interview.update({
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

      return updatedInterview;
    });

    const isCandidate = user.role === ActorType.CANDIDATE;
    const recipientId = isCandidate
      ? interview.recruiterProfile?.recruiterAccountId
      : interview.application.candidateProfile?.candidateAccountId;
    const recipientType = isCandidate ? ActorType.RECRUITER : ActorType.CANDIDATE;

    if (recipientId) {
      this.notificationsService
        .createNotification({
          recipientId,
          recipientType,
          title: 'Lịch phỏng vấn bị hủy',
          body: `Lịch phỏng vấn vị trí ${interview.application.jobPost.title} đã bị hủy.`,
          targetType: 'INTERVIEW',
          targetId: id,
        })
        .catch(() => {});
    }

    return updated;
  }

  async markNoShow(id: string, dto: CancelInterviewDto, user: AuthenticatedUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: {
              select: {
                candidateAccountId: true,
              },
            },
          },
        },
        recruiterProfile: {
          select: {
            recruiterAccountId: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException(`Interview ${id} not found`);
    }

    await this.checkAccessPermission(interview, user);

    if (
      interview.status === InterviewStatus.CANCELLED ||
      interview.status === InterviewStatus.COMPLETED ||
      interview.status === InterviewStatus.NO_SHOW
    ) {
      throw new BadRequestException(
        'Cannot mark as no-show a cancelled, completed or already no-show interview',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedInterview = await tx.interview.update({
        where: { id },
        data: {
          status: InterviewStatus.NO_SHOW,
        },
      });

      await tx.interviewLog.create({
        data: {
          interviewId: id,
          oldStatus: interview.status,
          newStatus: InterviewStatus.NO_SHOW,
          actorType: user.role,
          actorId: user.id,
          note: dto.note,
        },
      });

      return updatedInterview;
    });

    // Notify the candidate about the no-show
    if (interview.application.candidateProfile?.candidateAccountId) {
      this.notificationsService
        .createNotification({
          recipientId: interview.application.candidateProfile.candidateAccountId,
          recipientType: ActorType.CANDIDATE,
          title: 'Phỏng vấn — không có mặt',
          body: `Buổi phỏng vấn vị trí ${interview.application.jobPost.title} đã được đánh dấu là không có mặt.`,
          targetType: 'INTERVIEW',
          targetId: id,
        })
        .catch(() => {});
    }

    return updated;
  }

  async updateResult(id: string, dto: UpdateInterviewResultDto, user: AuthenticatedUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            jobPost: true,
            candidateProfile: {
              select: {
                candidateAccountId: true,
              },
            },
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

    if (
      user.role === ActorType.RECRUITER &&
      interview.application.jobPost.companyId !== user.companyId
    ) {
      throw new ForbiddenException('You do not have permission to manage this interview');
    }
    if (user.role === ActorType.RECRUITER) {
      await this.assertRecruiterCanAccessJobPost(user.id, interview.application.jobPostId);
    }

    if (interview.status === InterviewStatus.CANCELLED) {
      throw new BadRequestException('Cannot update result of a cancelled interview');
    }

    const nextStatus =
      dto.result === InterviewResult.UNDER_REVIEW ? interview.status : InterviewStatus.COMPLETED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const feedback = dto.feedbackNote ? `[Feedback]: ${dto.feedbackNote}` : '';
      const updatedNote = interview.recruiterNote
        ? `${interview.recruiterNote}\n${feedback}`.trim()
        : feedback;

      const updatedInterview = await tx.interview.update({
        where: { id },
        data: {
          result: dto.result,
          status: nextStatus,
          recruiterNote: updatedNote || null,
        },
      });

      await tx.interviewLog.create({
        data: {
          interviewId: id,
          oldStatus: interview.status,
          newStatus: nextStatus,
          actorType: user.role,
          actorId: user.id,
          note: `Cập nhật kết quả phỏng vấn: ${dto.result}`,
        },
      });

      return updatedInterview;
    });

    if (interview.application.candidateProfile?.candidateAccountId) {
      this.notificationsService
        .createNotification({
          recipientId: interview.application.candidateProfile.candidateAccountId,
          recipientType: ActorType.CANDIDATE,
          title: 'Kết quả phỏng vấn',
          body: `Kết quả phỏng vấn vị trí ${interview.application.jobPost.title} của bạn đã được cập nhật thành: ${dto.result}.`,
          targetType: 'INTERVIEW',
          targetId: id,
        })
        .catch(() => {});
    }

    return updated;
  }

  private async checkAccessPermission(interview: any, user: AuthenticatedUser) {
    const application = interview.application as {
      jobPostId: string;
      jobPost: { companyId: string };
      candidateProfile: { candidateAccountId: string };
    };

    if (user.role === ActorType.CANDIDATE) {
      if (application.candidateProfile.candidateAccountId !== user.id) {
        throw new ForbiddenException('You do not have permission to access this interview');
      }
    } else if (user.role === ActorType.RECRUITER) {
      if (application.jobPost.companyId !== user.companyId) {
        throw new ForbiddenException('You do not have permission to access this interview');
      }
      await this.assertRecruiterCanAccessJobPost(user.id, application.jobPostId);
    }
  }

  /**
   * Nhà tuyển dụng bị thu hồi quyền với tin thì cũng mất quyền với lịch phỏng vấn của tin đó —
   * lịch có kèm tên, email và ghi chú về ứng viên.
   */
  private async assertRecruiterCanAccessJobPost(recruiterId: string, jobPostId: string) {
    const accessible = await this.prisma.jobPost.findFirst({
      where: { id: jobPostId, ...recruiterAccessibleJobPostFilter(recruiterId) },
      select: { id: true },
    });

    if (!accessible) {
      throw new ForbiddenException('Bạn không có quyền truy cập tin tuyển dụng này.');
    }
  }
}
