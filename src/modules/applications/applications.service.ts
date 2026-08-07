/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, ApplicationStatus, JobStatus, InterviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApplyJobDto } from './dto/apply-job.dto';
import { OutboxService } from '../outbox/outbox.service';
import { ConversationLifecycleService } from '../conversations/services/conversation-lifecycle.service';
import { ApplicationTransitionPolicy } from './application-transition.policy';
import { isValidVietnamesePhoneNumber } from '../../common/validation/vietnamese-phone';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { UpdateApplicationCvDto } from './dto/update-application-cv.dto';
import { CV_SCORING_RUBRIC } from '../cv-screening/scoring-rubric';

const PIPELINE_SCORE_FIELD_BY_RUBRIC_KEY: Record<string, string> = {
  skills: 'skillScore',
  experience: 'experienceScore',
  projects: 'projectScore',
  education: 'educationScore',
};

const PIPELINE_STAGES = [
  {
    id: 'applied',
    status: ApplicationStatus.SUBMITTED,
    title: 'Applied',
    description: 'New applications received',
  },
  {
    id: 'screening',
    status: ApplicationStatus.VIEWED,
    title: 'Screening',
    description: 'Initial resume & profile review',
  },
  {
    id: 'technical_test',
    status: ApplicationStatus.SHORTLISTED,
    title: 'Technical Test',
    description: 'Coding challenge and assessment',
  },
  {
    id: 'interview',
    status: ApplicationStatus.INTERVIEWING,
    title: 'Interview',
    description: 'Technical & cultural interview phases',
  },
  {
    id: 'offering',
    status: ApplicationStatus.OFFERED,
    title: 'Offering',
    description: 'Salary negotiation & job offer extended',
  },
  {
    id: 'hired',
    status: ApplicationStatus.HIRED,
    title: 'Hired',
    description: 'Successfully signed and hired',
  },
  {
    id: 'rejected',
    status: ApplicationStatus.REJECTED,
    title: 'Rejected',
    description: 'Unsuitable candidates for this position',
  },
] as const;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly conversationLifecycle: ConversationLifecycleService,
    private readonly transitionPolicy: ApplicationTransitionPolicy,
  ) {}

  async applyJob(candidateAccountId: string, dto: ApplyJobDto) {
    const candidateAccount = await this.prisma.candidateAccount.findUnique({
      where: { id: candidateAccountId },
      select: {
        emailVerifiedAt: true,
        fullName: true,
        profile: true,
      },
    });

    if (!candidateAccount?.profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    if (!candidateAccount.emailVerifiedAt) {
      throw new ForbiddenException('Please verify your email before applying to jobs');
    }

    const profile = candidateAccount.profile;

    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    if (!isValidVietnamesePhoneNumber(profile.phoneNumber)) {
      throw new BadRequestException(
        'Vui lòng cập nhật số điện thoại Việt Nam hợp lệ trước khi nộp hồ sơ',
      );
    }

    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: dto.jobPostId },
    });
    if (!jobPost) {
      throw new NotFoundException('Job post not found');
    }
    if (jobPost.status !== JobStatus.PUBLISHED) {
      throw new BadRequestException('Cannot apply to a job post that is not published');
    }
    if (jobPost.expiredAt && jobPost.expiredAt < new Date()) {
      throw new BadRequestException('Tin tuyển dụng đã hết hạn nộp hồ sơ');
    }

    const cvVersion = await this.prisma.cVVersion.findUnique({
      where: { id: dto.cvVersionId },
      include: { cv: true },
    });
    if (!cvVersion) {
      throw new NotFoundException('CV version not found');
    }
    if (cvVersion.cv.candidateProfileId !== profile.id) {
      throw new BadRequestException('CV version does not belong to the candidate');
    }

    const existing = await this.prisma.application.findUnique({
      where: {
        candidateProfileId_jobPostId: {
          candidateProfileId: profile.id,
          jobPostId: dto.jobPostId,
        },
      },
    });

    // Withdrawing only flips the status, and (candidateProfileId, jobPostId) is unique —
    // so re-applying has to revive that row; a second insert could never succeed.
    const withdrawnApplication =
      existing?.status === ApplicationStatus.WITHDRAWN ? existing : null;

    if (existing && !withdrawnApplication) {
      throw new ConflictException('You have already applied to this job');
    }

    const app = await this.prisma.$transaction(async (tx) => {
      const createdApp = withdrawnApplication
        ? await tx.application.update({
            where: { id: withdrawnApplication.id },
            data: {
              cvVersionId: dto.cvVersionId,
              coverLetter: dto.coverLetter ?? null,
              status: ApplicationStatus.SUBMITTED,
              // Treated as a fresh submission, so the previous round's timestamps go.
              submittedAt: new Date(),
              viewedAt: null,
              rejectedAt: null,
              hiredAt: null,
              version: { increment: 1 },
            },
          })
        : await tx.application.create({
            data: {
              jobPostId: dto.jobPostId,
              candidateProfileId: profile.id,
              cvVersionId: dto.cvVersionId,
              coverLetter: dto.coverLetter ?? null,
              status: ApplicationStatus.SUBMITTED,
            },
          });

      await tx.applicationStatusLog.create({
        data: {
          applicationId: createdApp.id,
          actorType: ActorType.CANDIDATE,
          actorId: candidateAccountId,
          oldStatus: withdrawnApplication ? ApplicationStatus.WITHDRAWN : null,
          newStatus: ApplicationStatus.SUBMITTED,
          note: withdrawnApplication
            ? 'Candidate re-submitted application after withdrawing'
            : 'Candidate submitted application',
        },
      });

      // The withdrawn row keeps its assignment, so only assign when one is not active.
      const activeAssignment = withdrawnApplication
        ? await tx.applicationAssignment.findFirst({
            where: {
              applicationId: createdApp.id,
              recruiterAccountId: jobPost.createdByRecruiterId,
              unassignedAt: null,
            },
            select: { id: true },
          })
        : null;

      if (!activeAssignment) {
        await tx.applicationAssignment.create({
          data: {
            applicationId: createdApp.id,
            recruiterAccountId: jobPost.createdByRecruiterId,
            assignedByActorType: ActorType.SYSTEM,
            reason: 'Assigned to the recruiter who created the job post',
          },
        });
      }

      await this.conversationLifecycle.applyApplicationStatus(
        tx,
        createdApp.id,
        ApplicationStatus.SUBMITTED,
        {
          type: ActorType.CANDIDATE,
          id: candidateAccountId,
        },
      );

      await this.outbox.enqueue(
        {
          aggregateType: 'application',
          aggregateId: createdApp.id,
          eventType: 'notification.create',
          // A revived row reuses its id, so the original key would dedupe the
          // re-application away and the recruiter would never hear about it.
          dedupeKey: withdrawnApplication
            ? `application:${createdApp.id}:resubmitted:v${createdApp.version}:recruiter:${jobPost.createdByRecruiterId}`
            : `application:${createdApp.id}:created:recruiter:${jobPost.createdByRecruiterId}`,
          payload: {
            recipientId: jobPost.createdByRecruiterId,
            recipientType: ActorType.RECRUITER,
            title: 'Có hồ sơ ứng tuyển mới',
            body: `${candidateAccount.fullName} đã nộp hồ sơ ứng tuyển vào vị trí ${jobPost.title}.`,
            targetType: 'APPLICATION',
            targetId: createdApp.id,
          },
        },
        tx,
      );

      return createdApp;
    });

    return app;
  }

  async withdrawApplication(candidateAccountId: string, id: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    const application = await this.prisma.application.findUnique({
      where: { id },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (application.candidateProfileId !== profile.id) {
      throw new ForbiddenException('You do not own this application');
    }
    if (application.status === ApplicationStatus.WITHDRAWN) {
      throw new ConflictException('Application is already withdrawn');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedApp = await tx.application.update({
        where: { id },
        data: { status: ApplicationStatus.WITHDRAWN, version: { increment: 1 } },
      });

      await tx.applicationStatusLog.create({
        data: {
          applicationId: id,
          actorType: ActorType.CANDIDATE,
          actorId: candidateAccountId,
          oldStatus: application.status,
          newStatus: ApplicationStatus.WITHDRAWN,
          note: 'Candidate withdrew application',
        },
      });

      await this.conversationLifecycle.applyApplicationStatus(tx, id, ApplicationStatus.WITHDRAWN, {
        type: ActorType.CANDIDATE,
        id: candidateAccountId,
      });

      return updatedApp;
    });
  }

  async updateCv(candidateAccountId: string, id: string, dto: UpdateApplicationCvDto) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    const application = await this.prisma.application.findUnique({
      where: { id },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (application.candidateProfileId !== profile.id) {
      throw new ForbiddenException('You do not own this application');
    }
    if (application.status !== ApplicationStatus.SUBMITTED) {
      throw new ConflictException({
        code: 'APPLICATION_CV_LOCKED',
        message: 'CV can only be changed while the application has not been viewed yet',
      });
    }

    const cvVersion = await this.prisma.cVVersion.findUnique({
      where: { id: dto.cvVersionId },
      include: { cv: true },
    });
    if (!cvVersion) {
      throw new NotFoundException('CV version not found');
    }
    if (cvVersion.cv.candidateProfileId !== profile.id) {
      throw new BadRequestException('CV version does not belong to the candidate');
    }

    const changed = await this.prisma.application.updateMany({
      where: { id, status: ApplicationStatus.SUBMITTED },
      data: { cvVersionId: dto.cvVersionId, version: { increment: 1 } },
    });
    if (changed.count !== 1) {
      throw new ConflictException({
        code: 'APPLICATION_CV_LOCKED',
        message: 'Application changed; reload and retry',
      });
    }

    return this.prisma.application.findUniqueOrThrow({ where: { id } });
  }

  async findOne(id: string, candidateAccountId?: string, recruiterId?: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        candidateProfile: {
          include: {
            account: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        jobPost: {
          include: {
            company: {
              include: {
                logoFile: true,
              },
            },
          },
        },
        cvVersion: {
          include: {
            sourceFile: true,
            cv: {
              select: {
                source: true,
                title: true,
              },
            },
          },
        },
        statusLogs: {
          orderBy: { changedAt: 'asc' },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (candidateAccountId) {
      if (application.candidateProfile.candidateAccountId !== candidateAccountId) {
        throw new ForbiddenException('You are not authorized to view this application');
      }
    } else if (recruiterId) {
      const recruiter = await this.prisma.recruiterAccount.findUnique({
        where: { id: recruiterId },
      });
      if (!recruiter) {
        throw new NotFoundException('Recruiter account not found');
      }
      if (application.jobPost.companyId !== recruiter.companyId) {
        throw new ForbiddenException('You are not authorized to view this application');
      }
    } else {
      throw new ForbiddenException('Authorization details missing');
    }

    return this.mapApplicationCvVersion(application);
  }

  async getMyApplications(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    const apps = await this.prisma.application.findMany({
      where: { candidateProfileId: profile.id },
      include: {
        jobPost: {
          include: {
            company: {
              include: {
                logoFile: true,
              },
            },
            experienceLevel: true,
            employmentType: true,
          },
        },
        cvVersion: {
          include: {
            sourceFile: true,
            cv: {
              select: {
                source: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return apps.map((app) => this.mapApplicationCvVersion(app));
  }

  async getJobApplicants(jobId: string, recruiterId: string) {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
    });
    if (!recruiter) {
      throw new NotFoundException('Recruiter account not found');
    }

    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobId },
    });
    if (!jobPost) {
      throw new NotFoundException('Job post not found');
    }
    if (jobPost.companyId !== recruiter.companyId) {
      throw new ForbiddenException(
        'You do not have permission to view applicants for this job post',
      );
    }

    const apps = await this.prisma.application.findMany({
      where: { jobPostId: jobId },
      include: {
        candidateProfile: {
          include: {
            account: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        cvVersion: {
          include: {
            sourceFile: true,
            cv: {
              select: {
                source: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return apps.map((app) => this.mapApplicationCvVersion(app));
  }

  async checkAppliedJob(jobId: string, candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    const application = await this.prisma.application.findUnique({
      where: {
        candidateProfileId_jobPostId: {
          candidateProfileId: profile.id,
          jobPostId: jobId,
        },
      },
    });

    // A withdrawn application leaves its row behind, but the candidate is free to apply
    // again — so it must not report as applied, or the job stays locked to them forever.
    if (application && application.status !== ApplicationStatus.WITHDRAWN) {
      return {
        applied: application.status !== ApplicationStatus.WITHDRAWN,
        applicationId: application.id,
        status: application.status,
      };
    }

    return {
      applied: false,
    };
  }

  async getCompanyApplications(
    recruiterId: string,
    query?: {
      jobPostId?: string;
      status?: ApplicationStatus;
      search?: string;
    },
  ) {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
    });
    if (!recruiter) {
      throw new NotFoundException('Recruiter account not found');
    }
    if (!recruiter.companyId) {
      throw new BadRequestException('Recruiter does not belong to any company');
    }

    const whereClause: any = {
      jobPost: {
        companyId: recruiter.companyId,
      },
    };

    if (query?.jobPostId) {
      whereClause.jobPostId = query.jobPostId;
    }

    if (query?.status) {
      whereClause.status = query.status;
    }

    if (query?.search) {
      whereClause.candidateProfile = {
        account: {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      };
    }

    const apps = await this.prisma.application.findMany({
      where: whereClause,
      include: {
        candidateProfile: {
          include: {
            account: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        jobPost: {
          select: {
            id: true,
            title: true,
          },
        },
        cvVersion: {
          include: {
            sourceFile: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return apps.map((app) => this.mapApplicationCvVersion(app));
  }

  async getRecruiterPipeline(
    recruiterId: string,
    query?: {
      search?: string;
      jobPostId?: string;
      stageId?: string;
    },
  ) {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
    });
    if (!recruiter) {
      throw new NotFoundException('Recruiter account not found');
    }
    if (!recruiter.companyId) {
      throw new BadRequestException('Recruiter does not belong to any company');
    }

    const whereClause: any = {
      jobPost: { companyId: recruiter.companyId },
      status: { in: PIPELINE_STAGES.map((stage) => stage.status) },
    };

    if (query?.jobPostId && query.jobPostId !== 'all') {
      whereClause.jobPostId = query.jobPostId;
    }

    const matchedStage = query?.stageId
      ? PIPELINE_STAGES.find((stage) => stage.id === query.stageId)
      : undefined;
    if (matchedStage) {
      whereClause.status = matchedStage.status;
    }

    if (query?.search) {
      whereClause.candidateProfile = {
        account: {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      };
    }

    const apps = await this.prisma.application.findMany({
      where: whereClause,
      include: {
        candidateProfile: {
          include: {
            account: { select: { id: true, fullName: true, email: true } },
            skills: {
              include: { skill: { select: { name: true } } },
              orderBy: { sortOrder: 'asc' },
            },
            experiences: {
              select: { startDate: true, endDate: true, isCurrent: true },
            },
          },
        },
        jobPost: { select: { id: true, title: true } },
        aiScore: {
          select: {
            finalScore: true,
            skillScore: true,
            experienceScore: true,
            projectScore: true,
            educationScore: true,
          },
        },
        interviews: {
          where: {
            status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] },
          },
          include: { recruiterProfile: { select: { fullName: true } } },
          orderBy: { scheduledStartAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const candidates = apps.map((app) => this.mapPipelineCandidate(app));

    const hiredCount = candidates.filter((c) => c.stageId === 'hired').length;
    const rejectedCount = candidates.filter((c) => c.stageId === 'rejected').length;
    const decidedCount = hiredCount + rejectedCount;

    return {
      stages: PIPELINE_STAGES.map(({ id, title, description }) => ({ id, title, description })),
      candidates,
      metrics: {
        totalCandidates: candidates.length,
        inInterview: candidates.filter((c) => c.stageId === 'interview').length,
        offersSent: candidates.filter((c) => c.stageId === 'offering' || c.stageId === 'hired')
          .length,
        passRate: decidedCount > 0 ? Math.round((hiredCount / decidedCount) * 100) : 0,
      },
    };
  }

  private mapPipelineCandidate(app: any) {
    const stage = PIPELINE_STAGES.find((s) => s.status === app.status);
    const account = app.candidateProfile.account;
    const interview = app.interviews?.[0];

    return {
      id: app.id,
      applicationId: app.id,
      candidateId: app.candidateProfile.id,
      name: account.fullName,
      role: app.jobPost.title,
      stageId: stage?.id ?? 'applied',
      avatarUrl: null,
      location: app.candidateProfile.address ?? null,
      experienceYears: this.computeExperienceYears(
        app.candidateProfile.experiences as {
          startDate: Date | null;
          endDate: Date | null;
          isCurrent: boolean;
        }[],
      ),
      techStack: (app.candidateProfile.skills ?? []).map((s: any) => s.skill.name),
      scores: app.aiScore
        ? [
            {
              label: 'Overall Match',
              value: Math.round(Number(app.aiScore.finalScore)),
              maxValue: 100,
            },
            ...CV_SCORING_RUBRIC.map((criterion) => ({
              label: criterion.label,
              value: Math.round(
                Number(app.aiScore[PIPELINE_SCORE_FIELD_BY_RUBRIC_KEY[criterion.key]]),
              ),
              maxValue: criterion.maxScore,
            })),
          ]
        : undefined,
      lastUpdatedAt: app.updatedAt.toISOString(),
      interview: interview
        ? {
            id: interview.id,
            scheduledAt: interview.scheduledStartAt.toISOString(),
            interviewerName: interview.recruiterProfile?.fullName ?? null,
            mode: interview.type,
          }
        : null,
    };
  }

  private computeExperienceYears(
    experiences: { startDate: Date | null; endDate: Date | null; isCurrent: boolean }[],
  ): number | null {
    if (!experiences?.length) return null;

    const now = new Date();
    let totalMonths = 0;
    for (const exp of experiences) {
      if (!exp.startDate) continue;
      const end = exp.isCurrent || !exp.endDate ? now : exp.endDate;
      const months =
        (end.getFullYear() - exp.startDate.getFullYear()) * 12 +
        (end.getMonth() - exp.startDate.getMonth());
      if (months > 0) totalMonths += months;
    }

    return totalMonths > 0 ? Math.round(totalMonths / 12) : null;
  }

  private mapApplicationCvVersion(app: any) {
    if (!app) return null;
    const cvVersion = app.cvVersion;
    const fileAsset = cvVersion?.sourceFile;
    return {
      ...app,
      cvVersion: cvVersion
        ? {
            ...cvVersion,
            fileName:
              fileAsset?.originalName ||
              `CV-${app.candidateProfile?.account?.fullName || 'Candidate'}.pdf`,
            fileUrl: fileAsset?.publicUrl || '',
          }
        : null,
    };
  }

  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdateApplicationStatusDto) {
    const status = dto.status;
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        jobPost: true,
        assignments: { where: { unassignedAt: null }, select: { recruiterAccountId: true } },
        candidateProfile: {
          select: {
            candidateAccountId: true,
          },
        },
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const isAssigned = application.assignments.some(
      (assignment) => assignment.recruiterAccountId === user.id,
    );
    const recruiterAllowed =
      user.role === ActorType.RECRUITER &&
      application.jobPost.companyId === user.companyId &&
      (user.permissions.includes('applications:manage') ||
        (isAssigned && user.permissions.includes('applications:review_assigned')));
    const adminAllowed =
      user.role === ActorType.ADMIN && user.permissions.includes('applications:manage');
    if (!recruiterAllowed && !adminAllowed) {
      throw new ForbiddenException('You do not have permission to manage this application');
    }

    this.transitionPolicy.assertAllowed(application.status, status);
    const expectedVersion = dto.expectedVersion ?? application.version;

    const updatedApp = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.application.updateMany({
        where: { id, version: expectedVersion, status: application.status },
        data: { status, version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          code: 'STALE_APPLICATION_VERSION',
          message: 'Application changed; reload and retry',
        });
      }

      await tx.applicationStatusLog.create({
        data: {
          applicationId: id,
          actorType: user.role,
          actorId: user.id,
          oldStatus: application.status,
          newStatus: status,
          note: dto.note ?? `${user.role} updated status to ${status}`,
        },
      });

      await this.conversationLifecycle.applyApplicationStatus(tx, id, status, {
        type: user.role,
        id: user.id,
      });

      if (application.candidateProfile?.candidateAccountId) {
        await this.outbox.enqueue(
          {
            aggregateType: 'application',
            aggregateId: id,
            eventType: 'notification.create',
            dedupeKey: `application:${id}:status:${status}:version:${application.version + 1}`,
            payload: {
              recipientId: application.candidateProfile.candidateAccountId,
              recipientType: ActorType.CANDIDATE,
              title: 'Trạng thái hồ sơ thay đổi',
              body: `Hồ sơ ứng tuyển vị trí ${application.jobPost.title} của bạn đã được cập nhật thành: ${status}.`,
              targetType: 'APPLICATION',
              targetId: id,
            },
          },
          tx,
        );
      }

      return tx.application.findUniqueOrThrow({ where: { id } });
    });

    return updatedApp;
  }
}
