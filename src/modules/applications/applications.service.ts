/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  ApplicationStatus,
  CvStatus,
  InterviewStatus,
  JobStatus,
  OfferResponse,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApplyJobDto } from './dto/apply-job.dto';
import { OutboxService } from '../outbox/outbox.service';
import { ConversationLifecycleService } from '../conversations/services/conversation-lifecycle.service';
import { ApplicationTransitionPolicy } from './application-transition.policy';
import { isValidInternationalPhoneNumber } from '../../common/validation/phone';
import { recruiterAccessibleJobPostFilter } from '../../common/authorization/job-post-access';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { UpdateApplicationCvDto } from './dto/update-application-cv.dto';
import {
  CandidateApplicationActivityQueryDto,
  type CandidateApplicationActivityGroup,
} from './dto/candidate-application-activity-query.dto';
import { CV_SCORING_RUBRIC } from '../cv-screening/scoring-rubric';
import { EmailService } from '../../common/email/email.service';

const PIPELINE_SCORE_FIELD_BY_RUBRIC_KEY: Record<string, string> = {
  skills: 'skillScore',
  experience: 'experienceScore',
  projects: 'projectScore',
  education: 'educationScore',
};

/** Hồ sơ nộp quá số ngày này mà chưa được đẩy sang vòng nào thì tính là tồn đọng. */
const STALE_APPLICATION_DAYS = 7;

const RECENT_APPLICATIONS_LIMIT = 7;

/** Cùng ngưỡng với bộ lọc aiLabel của getCompanyApplications để hai màn hình không lệch số. */
const AI_SCORE_BUCKETS = [
  { id: 'excellent', where: { aiScore: { finalScore: { gte: 85 } } } },
  { id: 'good', where: { aiScore: { finalScore: { gte: 70, lt: 85 } } } },
  { id: 'average', where: { aiScore: { finalScore: { gte: 50, lt: 70 } } } },
  { id: 'low', where: { aiScore: { finalScore: { lt: 50 } } } },
  { id: 'unscored', where: { aiScore: null } },
] as const;

/** Phễu hiển thị trên dashboard: chỉ các trạng thái còn trong quy trình, theo đúng thứ tự. */
const CANDIDATE_FUNNEL_STATUSES = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.VIEWED,
  ApplicationStatus.CONSIDERING,
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.INTERVIEWING,
  ApplicationStatus.OFFERED,
  ApplicationStatus.HIRED,
] as const;

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
    private readonly emailService: EmailService,
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

    if (!isValidInternationalPhoneNumber(profile.phoneNumber)) {
      throw new BadRequestException(
        'Vui lòng cập nhật số điện thoại liên hệ hợp lệ trước khi nộp hồ sơ',
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
    if (cvVersion.cv.status && cvVersion.cv.status !== CvStatus.ACTIVE) {
      throw new BadRequestException('Hãy chọn một CV đang hoạt động để nộp hồ sơ');
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
    const withdrawnApplication = existing?.status === ApplicationStatus.WITHDRAWN ? existing : null;

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
              // JSON fields distinguish SQL NULL from a JSON `null` value.
              // A resubmission must clear the prior offer entirely.
              offerDetails: Prisma.DbNull,
              offerDeadlineAt: null,
              offerResponse: null,
              offerRespondedAt: null,
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

      // Find all active recruiters belonging to this company
      const companyRecruiters = await tx.recruiterAccount.findMany({
        where: { companyId: jobPost.companyId, status: 'ACTIVE' },
        select: { id: true },
      });

      const recruiterIdsToNotify = Array.from(
        new Set(
          [jobPost.createdByRecruiterId, ...companyRecruiters.map((r) => r.id)].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      );

      for (const recId of recruiterIdsToNotify) {
        await this.outbox.enqueue(
          {
            aggregateType: 'application',
            aggregateId: createdApp.id,
            eventType: 'notification.create',
            dedupeKey: withdrawnApplication
              ? `application:${createdApp.id}:resubmitted:v${createdApp.version}:recruiter:${recId}`
              : `application:${createdApp.id}:created:recruiter:${recId}`,
            payload: {
              recipientId: recId,
              recipientType: ActorType.RECRUITER,
              title: 'Có hồ sơ ứng tuyển mới',
              body: `${candidateAccount.fullName} đã nộp hồ sơ ứng tuyển vào vị trí ${jobPost.title}.`,
              targetType: 'APPLICATION',
              targetId: createdApp.id,
            },
          },
          tx,
        );
      }

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
    if (
      !(
        [
          ApplicationStatus.SUBMITTED,
          ApplicationStatus.VIEWED,
          ApplicationStatus.CONSIDERING,
          ApplicationStatus.SHORTLISTED,
          ApplicationStatus.INTERVIEWING,
        ] as readonly ApplicationStatus[]
      ).includes(application.status)
    ) {
      throw new ConflictException({
        code: 'APPLICATION_WITHDRAWAL_LOCKED',
        message: 'This application can no longer be withdrawn at its current stage',
      });
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
    if (cvVersion.cv.status && cvVersion.cv.status !== CvStatus.ACTIVE) {
      throw new BadRequestException('Hãy chọn một CV đang hoạt động để cập nhật đơn ứng tuyển');
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
            experienceLevel: true,
            employmentType: true,
            jobPostLocations: { include: { jobLocation: true } },
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
        interviews: {
          orderBy: { scheduledStartAt: 'asc' },
          include: {
            recruiterProfile: {
              select: { fullName: true },
            },
          },
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
      await this.assertRecruiterCanAccessJobPost(recruiterId, application.jobPostId);
    } else {
      throw new ForbiddenException('Authorization details missing');
    }

    return candidateAccountId
      ? this.mapCandidateApplication(application)
      : this.mapApplicationCvVersion(application);
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
            jobPostLocations: { include: { jobLocation: true } },
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
        interviews: {
          orderBy: { scheduledStartAt: 'asc' },
          include: {
            recruiterProfile: {
              select: { fullName: true },
            },
          },
        },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
    });

    return apps.map((app) => this.mapCandidateApplication(app));
  }

  /**
   * Candidate-only activity read model. It deliberately does not reuse the
   * historic `/applications/me` array so existing consumers retain their
   * contract while this screen can paginate and filter on the server.
   */
  async getMyApplicationActivity(
    candidateAccountId: string,
    query: CandidateApplicationActivityQueryDto,
  ) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    const now = new Date();
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const group = query.group ?? 'all';
    const q = query.q?.trim();
    const where: Prisma.ApplicationWhereInput = {
      candidateProfileId: profile.id,
      ...this.getCandidateActivityGroupWhere(group, now),
      ...(q
        ? {
            jobPost: {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { company: { name: { contains: q, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };
    const orderBy: Prisma.ApplicationOrderByWithRelationInput =
      query.sort === 'oldest'
        ? { submittedAt: 'asc' }
        : query.sort === 'newest'
          ? { submittedAt: 'desc' }
          : { updatedAt: 'desc' };

    const allWhere: Prisma.ApplicationWhereInput = { candidateProfileId: profile.id };
    const actionRequiredWhere = this.getCandidateActivityGroupWhere('action_required', now);
    const interviewWhere = this.getCandidateActivityGroupWhere('interview', now);
    const activeWhere = this.getCandidateActivityGroupWhere('active', now);

    const [
      items,
      total,
      totalCount,
      activeCount,
      interviewCount,
      actionRequiredCount,
      nextInterview,
    ] = await Promise.all([
      this.prisma.application.findMany({
        where,
        include: {
          jobPost: {
            include: {
              company: { include: { logoFile: true } },
              experienceLevel: true,
              employmentType: true,
              jobPostLocations: { include: { jobLocation: true } },
            },
          },
          cvVersion: {
            include: {
              sourceFile: true,
              cv: { select: { source: true, title: true } },
            },
          },
          interviews: {
            orderBy: { scheduledStartAt: 'asc' },
            include: { recruiterProfile: { select: { fullName: true } } },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.application.count({ where }),
      this.prisma.application.count({ where: allWhere }),
      this.prisma.application.count({ where: { candidateProfileId: profile.id, ...activeWhere } }),
      this.prisma.application.count({
        where: { candidateProfileId: profile.id, ...interviewWhere },
      }),
      this.prisma.application.count({
        where: { candidateProfileId: profile.id, ...actionRequiredWhere },
      }),
      this.prisma.interview.findFirst({
        where: {
          application: { candidateProfileId: profile.id },
          status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] },
          scheduledStartAt: { gte: now },
        },
        orderBy: { scheduledStartAt: 'asc' },
        select: { id: true, applicationId: true, scheduledStartAt: true, type: true },
      }),
    ]);

    return {
      items: items.map((item) => this.mapCandidateApplication(item, now)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      summary: {
        total: totalCount,
        active: activeCount,
        interviewing: interviewCount,
        actionRequired: actionRequiredCount,
        nextInterviewAt: nextInterview?.scheduledStartAt ?? null,
        nextInterviewApplicationId: nextInterview?.applicationId ?? null,
      },
    };
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
    await this.assertRecruiterCanAccessJobPost(recruiterId, jobId);

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
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
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
        applied: true,
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
      viewed?: 'unviewed';
      aiLabel?: 'excellent' | 'good' | 'average' | 'low' | 'unscored';
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
        // Tin đã xoá mềm không còn trong danh sách tin, hồ sơ của nó cũng không nên còn ở đây —
        // và phải khớp với bộ đếm của dashboard, nếu không bấm vào thẻ sẽ ra số khác.
        deletedAt: null,
        ...recruiterAccessibleJobPostFilter(recruiterId),
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
        OR: [
          { account: { fullName: { contains: query.search, mode: 'insensitive' } } },
          { account: { email: { contains: query.search, mode: 'insensitive' } } },
          { phoneNumber: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    if (query?.viewed === 'unviewed') {
      whereClause.viewedAt = null;
      // Cùng định nghĩa với thẻ "Chưa xem" trên dashboard, để con số và danh sách khớp nhau.
      // Không ghi đè khi người dùng đã chọn trạng thái cụ thể — đó là lựa chọn của họ.
      whereClause.status ??= ApplicationStatus.SUBMITTED;
    }

    if (query?.aiLabel === 'unscored') {
      whereClause.aiScore = null;
    } else if (query?.aiLabel) {
      const scoreRanges: Record<
        'excellent' | 'good' | 'average' | 'low',
        { gte?: number; lt?: number }
      > = {
        excellent: { gte: 85 },
        good: { gte: 70, lt: 85 },
        average: { gte: 50, lt: 70 },
        low: { lt: 50 },
      };
      whereClause.aiScore = { finalScore: scoreRanges[query.aiLabel] };
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
        aiScore: {
          select: {
            finalScore: true,
          },
        },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
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
      jobPost: {
        companyId: recruiter.companyId,
        deletedAt: null,
        ...recruiterAccessibleJobPostFilter(recruiterId),
      },
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

  /**
   * Chặn nhà tuyển dụng đã bị thu hồi quyền với tin tuyển dụng chạm vào hồ sơ của tin đó.
   * Dùng ở các đường vào một hồ sơ cụ thể; truy vấn danh sách thì lọc thẳng trong where.
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

  /**
   * Số liệu ứng viên cho dashboard nhà tuyển dụng: trả về đúng các con số cần hiển thị thay vì
   * để FE tải toàn bộ hồ sơ của công ty rồi tự đếm (endpoint company-applications không phân trang).
   */
  async getRecruiterCandidateSummary(recruiterId: string) {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
    });
    if (!recruiter) {
      throw new NotFoundException('Recruiter account not found');
    }
    if (!recruiter.companyId) {
      throw new BadRequestException('Recruiter does not belong to any company');
    }

    // Bỏ tin đã xoá mềm, giống danh sách tin của dashboard (getCompanyJobPosts lọc deletedAt).
    // Không lọc thì ngay khi có tin bị xoá, thẻ "Tổng hồ sơ ứng tuyển" và phễu sẽ lệch nhau.
    // Đồng thời tôn trọng quyền theo từng tin: số liệu phải khớp phạm vi mà người này được xem.
    const companyScope = {
      jobPost: {
        companyId: recruiter.companyId,
        deletedAt: null,
        ...recruiterAccessibleJobPostFilter(recruiterId),
      },
    };
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_APPLICATION_DAYS * 24 * 60 * 60 * 1000);

    const [statusGroups, counters, aiBucketCounts, recentApplications] = await Promise.all([
      this.prisma.application.groupBy({
        by: ['status'],
        where: companyScope,
        _count: { _all: true },
      }),
      Promise.all([
        // "Chưa xem" = còn nằm im ở SUBMITTED. Hồ sơ đã được đẩy sang vòng khác thì hiển nhiên
        // đã có người xử lý, đếm nó là chưa xem sẽ mâu thuẫn với chính cột trạng thái.
        this.prisma.application.count({
          where: { ...companyScope, viewedAt: null, status: ApplicationStatus.SUBMITTED },
        }),
        this.prisma.application.count({
          where: { ...companyScope, submittedAt: { gte: staleBefore } },
        }),
        // Tồn đọng: đã nộp quá hạn mà vẫn chưa được đẩy sang bất kỳ vòng nào.
        this.prisma.application.count({
          where: {
            ...companyScope,
            status: { in: [ApplicationStatus.SUBMITTED, ApplicationStatus.VIEWED] },
            submittedAt: { lt: staleBefore },
          },
        }),
        this.prisma.interview.count({
          where: {
            application: companyScope,
            status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] },
            scheduledStartAt: { gte: now },
          },
        }),
      ]),
      Promise.all(
        AI_SCORE_BUCKETS.map((bucket) =>
          this.prisma.application.count({ where: { ...companyScope, ...bucket.where } }),
        ),
      ),
      this.prisma.application.findMany({
        where: companyScope,
        orderBy: { submittedAt: 'desc' },
        take: RECENT_APPLICATIONS_LIMIT,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          viewedAt: true,
          candidateProfile: {
            select: {
              id: true,
              account: { select: { id: true, fullName: true, email: true } },
            },
          },
          jobPost: { select: { id: true, title: true } },
          aiScore: { select: { finalScore: true } },
        },
      }),
    ]);

    const [unviewed, newLast7Days, staleOver7Days, upcomingInterviews] = counters;

    const byStatus = Object.values(ApplicationStatus).reduce<Record<string, number>>(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {},
    );
    let total = 0;
    for (const group of statusGroups) {
      byStatus[group.status] = group._count._all;
      total += group._count._all;
    }

    const aiScoreBuckets = AI_SCORE_BUCKETS.reduce<Record<string, number>>((acc, bucket, index) => {
      acc[bucket.id] = aiBucketCounts[index] ?? 0;
      return acc;
    }, {});

    return {
      totals: {
        total,
        unviewed,
        newLast7Days,
        staleOver7Days,
        upcomingInterviews,
        staleThresholdDays: STALE_APPLICATION_DAYS,
      },
      funnel: CANDIDATE_FUNNEL_STATUSES.map((status) => ({
        status,
        count: byStatus[status] ?? 0,
      })),
      byStatus,
      aiScoreBuckets,
      recentApplications: recentApplications.map((app) => ({
        id: app.id,
        status: app.status,
        submittedAt: app.submittedAt.toISOString(),
        viewedAt: app.viewedAt ? app.viewedAt.toISOString() : null,
        candidateId: app.candidateProfile.id,
        candidateName: app.candidateProfile.account.fullName,
        candidateEmail: app.candidateProfile.account.email,
        jobPostId: app.jobPost.id,
        jobPostTitle: app.jobPost.title,
        aiScore: app.aiScore ? Number(app.aiScore.finalScore) : null,
      })),
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
            fileUrl:
              fileAsset?.publicUrl ||
              (cvVersion?.id ? `/api/v1/cv-versions/${cvVersion.id}/download` : ''),
          }
        : null,
    };
  }

  private mapCandidateApplication(app: any, now = new Date()) {
    const status = app.status as ApplicationStatus;
    const offerResponse =
      status === ApplicationStatus.OFFERED
        ? (app.offerResponse ?? OfferResponse.PENDING)
        : app.offerResponse;
    const offerExpired =
      status === ApplicationStatus.OFFERED &&
      app.offerDeadlineAt instanceof Date &&
      app.offerDeadlineAt.getTime() <= now.getTime();
    const canRespondToOffer =
      status === ApplicationStatus.OFFERED &&
      offerResponse === OfferResponse.PENDING &&
      !offerExpired;

    return {
      ...this.mapApplicationCvVersion(app),
      offerResponse,
      activityGroup: this.getCandidateActivityGroup(app, now),
      availableActions: {
        canChangeCv: status === ApplicationStatus.SUBMITTED,
        canRespondToOffer,
        canWithdraw: (
          [
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.VIEWED,
            ApplicationStatus.CONSIDERING,
            ApplicationStatus.SHORTLISTED,
            ApplicationStatus.INTERVIEWING,
          ] as readonly ApplicationStatus[]
        ).includes(status),
      },
    };
  }

  private getCandidateActivityGroup(app: any, now: Date): CandidateApplicationActivityGroup {
    const status = app.status as ApplicationStatus;
    if (status === ApplicationStatus.INTERVIEWING) return 'interview';
    if (status === ApplicationStatus.OFFERED) {
      const response = app.offerResponse ?? OfferResponse.PENDING;
      const expired =
        app.offerDeadlineAt instanceof Date && app.offerDeadlineAt.getTime() <= now.getTime();
      if (response === OfferResponse.PENDING && !expired) return 'action_required';
      if (response === OfferResponse.ACCEPTED) return 'active';
      return 'closed';
    }
    if (
      (
        [
          ApplicationStatus.SUBMITTED,
          ApplicationStatus.VIEWED,
          ApplicationStatus.CONSIDERING,
          ApplicationStatus.SHORTLISTED,
        ] as readonly ApplicationStatus[]
      ).includes(status)
    ) {
      return 'active';
    }
    return 'closed';
  }

  private getCandidateActivityGroupWhere(group: CandidateApplicationActivityGroup, now: Date) {
    if (group === 'all') return {};
    if (group === 'interview') return { status: ApplicationStatus.INTERVIEWING };
    if (group === 'action_required') {
      return {
        AND: [
          { status: ApplicationStatus.OFFERED },
          { OR: [{ offerResponse: null }, { offerResponse: OfferResponse.PENDING }] },
          { OR: [{ offerDeadlineAt: null }, { offerDeadlineAt: { gt: now } }] },
        ],
      };
    }
    if (group === 'active') {
      return {
        OR: [
          {
            status: {
              in: [
                ApplicationStatus.SUBMITTED,
                ApplicationStatus.VIEWED,
                ApplicationStatus.CONSIDERING,
                ApplicationStatus.SHORTLISTED,
              ],
            },
          },
          { status: ApplicationStatus.OFFERED, offerResponse: OfferResponse.ACCEPTED },
        ],
      };
    }

    return {
      OR: [
        {
          status: {
            in: [ApplicationStatus.HIRED, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN],
          },
        },
        {
          AND: [
            { status: ApplicationStatus.OFFERED },
            {
              OR: [{ offerResponse: OfferResponse.DECLINED }, { offerDeadlineAt: { lte: now } }],
            },
          ],
        },
      ],
    };
  }

  private resolveOfferDetails(dto: UpdateApplicationStatusDto, now: Date) {
    const direct = dto.offer;
    const legacy = direct ? null : this.parseLegacyOfferDetails(dto.note, now);
    const offer = direct ?? legacy;
    if (!offer) {
      throw new BadRequestException({
        code: 'OFFER_DETAILS_REQUIRED',
        message: 'Offer details are required when sending an offer',
      });
    }

    const deadline = new Date(offer.expiresAt);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= now.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_OFFER_DEADLINE',
        message: 'Offer deadline must be in the future',
      });
    }

    return {
      deadline,
      details: {
        salaryOffer: offer.salaryOffer.trim(),
        startDate: offer.startDate.trim(),
        ...(offer.note?.trim() ? { note: offer.note.trim() } : {}),
      },
    };
  }

  private parseLegacyOfferDetails(note: string | undefined, now: Date) {
    if (!note) return null;
    try {
      const value = JSON.parse(note) as Partial<{
        salaryOffer: unknown;
        startDate: unknown;
        expiryDays: unknown;
        expiresAt: unknown;
        note: unknown;
      }>;
      if (typeof value.salaryOffer !== 'string' || typeof value.startDate !== 'string') return null;
      const expiresAt =
        typeof value.expiresAt === 'string'
          ? value.expiresAt
          : typeof value.expiryDays === 'number' && value.expiryDays >= 1
            ? new Date(now.getTime() + value.expiryDays * 86_400_000).toISOString()
            : null;
      if (!expiresAt) return null;
      return {
        salaryOffer: value.salaryOffer,
        startDate: value.startDate,
        expiresAt,
        note: typeof value.note === 'string' ? value.note : undefined,
      };
    } catch {
      return null;
    }
  }

  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdateApplicationStatusDto) {
    const status = dto.status;
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        jobPost: {
          include: {
            company: true,
          },
        },
        assignments: { where: { unassignedAt: null }, select: { recruiterAccountId: true } },
        candidateProfile: {
          include: {
            account: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
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
    if (user.role === ActorType.RECRUITER) {
      await this.assertRecruiterCanAccessJobPost(user.id, application.jobPostId);
    }

    this.transitionPolicy.assertAllowed(application.status, status);
    const expectedVersion = dto.expectedVersion ?? application.version;
    const now = new Date();
    const offer = status === ApplicationStatus.OFFERED ? this.resolveOfferDetails(dto, now) : null;

    const updatedApp = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.application.updateMany({
        where: { id, version: expectedVersion, status: application.status },
        data: {
          status,
          version: { increment: 1 },
          viewedAt: application.viewedAt ?? now,
          rejectedAt: status === ApplicationStatus.REJECTED ? now : application.rejectedAt,
          hiredAt: status === ApplicationStatus.HIRED ? now : application.hiredAt,
          ...(offer
            ? {
                offerDetails: offer.details,
                offerDeadlineAt: offer.deadline,
                offerResponse: OfferResponse.PENDING,
                offerRespondedAt: null,
              }
            : {}),
        },
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
          note:
            status === ApplicationStatus.OFFERED
              ? (offer?.details.note ?? 'Recruiter sent a job offer')
              : (dto.note ?? `${user.role} updated status to ${status}`),
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

    if (status === ApplicationStatus.OFFERED && application.candidateProfile?.account?.email) {
      void this.emailService
        .sendOfferLetter({
          to: application.candidateProfile.account.email,
          candidateName: application.candidateProfile.account.fullName,
          jobTitle: application.jobPost.title,
          companyName: application.jobPost.company?.name ?? 'UpNext Employer',
          salaryOffer: offer?.details.salaryOffer,
          offerNote: offer?.details.note,
          applicationLink: `${process.env.APP_FRONTEND_URL || 'http://localhost:3000'}/candidate/applications/${id}`,
        })
        .catch((err) => {
          console.error('Failed to send offer letter email:', err);
        });
    }

    return updatedApp;
  }

  async markViewed(user: AuthenticatedUser, id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        jobPost: true,
        assignments: { where: { unassignedAt: null }, select: { recruiterAccountId: true } },
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
    if (user.role === ActorType.RECRUITER) {
      await this.assertRecruiterCanAccessJobPost(user.id, application.jobPostId);
    }

    await this.prisma.application.updateMany({
      where: { id, viewedAt: null },
      data: { viewedAt: new Date() },
    });

    return this.prisma.application.findUniqueOrThrow({ where: { id } });
  }

  async respondOffer(candidateAccountId: string, id: string, action: 'ACCEPT' | 'DECLINE') {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        jobPost: {
          select: { title: true, companyId: true, createdByRecruiterId: true },
        },
      },
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.candidateProfileId !== profile.id) {
      throw new ForbiddenException('You do not have permission to respond to this offer');
    }

    if (application.status !== ApplicationStatus.OFFERED) {
      throw new BadRequestException('Application is not in OFFERED status');
    }
    if (application.offerResponse && application.offerResponse !== OfferResponse.PENDING) {
      throw new ConflictException({
        code: 'OFFER_ALREADY_RESPONDED',
        message: 'This offer has already received a response',
      });
    }
    if (application.offerDeadlineAt && application.offerDeadlineAt.getTime() <= Date.now()) {
      throw new ConflictException({
        code: 'OFFER_EXPIRED',
        message: 'This offer has expired and can no longer be accepted',
      });
    }

    const response = action === 'ACCEPT' ? OfferResponse.ACCEPTED : OfferResponse.DECLINED;

    const updatedApp = await this.prisma.$transaction(async (tx) => {
      const app = await tx.application.update({
        where: { id },
        data: {
          offerResponse: response,
          offerRespondedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await tx.applicationStatusLog.create({
        data: {
          applicationId: id,
          actorType: ActorType.CANDIDATE,
          actorId: candidateAccountId,
          oldStatus: ApplicationStatus.OFFERED,
          newStatus: ApplicationStatus.OFFERED,
          note: action === 'ACCEPT' ? 'OFFER_RESPONSE:ACCEPTED' : 'OFFER_RESPONSE:DECLINED',
        },
      });

      const companyRecruiters = await tx.recruiterAccount.findMany({
        where: { companyId: application.jobPost.companyId, status: 'ACTIVE' },
        select: { id: true },
      });

      const recruiterIdsToNotify = Array.from(
        new Set(
          [application.jobPost.createdByRecruiterId, ...companyRecruiters.map((r) => r.id)].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      );

      for (const recId of recruiterIdsToNotify) {
        await this.outbox.enqueue(
          {
            aggregateType: 'application',
            aggregateId: id,
            eventType: 'notification.create',
            dedupeKey: `application:${id}:offer-response:${response}:v${application.version + 1}:recruiter:${recId}`,
            payload: {
              recipientId: recId,
              recipientType: ActorType.RECRUITER,
              title: 'Ứng viên đã phản hồi đề nghị',
              body: `Ứng viên đã ${action === 'ACCEPT' ? 'đồng ý' : 'từ chối'} đề nghị cho vị trí ${application.jobPost.title}.`,
              targetType: 'APPLICATION',
              targetId: id,
            },
          },
          tx,
        );
      }

      return app;
    });

    return updatedApp;
  }
}
