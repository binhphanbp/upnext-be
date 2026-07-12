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
import { ApplyJobDto } from './dto/apply-job.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
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

    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: dto.jobPostId },
    });
    if (!jobPost) {
      throw new NotFoundException('Job post not found');
    }
    if (jobPost.status !== JobStatus.PUBLISHED) {
      throw new BadRequestException('Cannot apply to a job post that is not published');
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
    if (existing) {
      throw new ConflictException('You have already applied to this job');
    }

    const app = await this.prisma.$transaction(async (tx) => {
      const createdApp = await tx.application.create({
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
          oldStatus: null,
          newStatus: ApplicationStatus.SUBMITTED,
          note: 'Candidate submitted application',
        },
      });

      return createdApp;
    });

    if (jobPost.createdByRecruiterId) {
      this.notificationsService.createNotification({
        recipientId: jobPost.createdByRecruiterId,
        recipientType: ActorType.RECRUITER,
        title: 'Có hồ sơ ứng tuyển mới',
        body: `${candidateAccount.fullName} đã nộp hồ sơ ứng tuyển vào vị trí ${jobPost.title}.`,
        targetType: 'APPLICATION',
        targetId: app.id,
      }).catch(() => {});
    }

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
        data: { status: ApplicationStatus.WITHDRAWN },
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

      return updatedApp;
    });
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
            company: true,
          },
        },
        cvVersion: {
          include: {
            sourceFile: true,
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
            company: true,
            experienceLevel: true,
            employmentType: true,
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

    if (application) {
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

  private mapApplicationCvVersion(app: any) {
    if (!app) return null;
    const cvVersion = app.cvVersion;
    const fileAsset = cvVersion?.sourceFile;
    return {
      ...app,
      cvVersion: cvVersion
        ? {
            ...cvVersion,
            fileName: fileAsset?.originalName || `CV-${app.candidateProfile?.account?.fullName || 'Candidate'}.pdf`,
            fileUrl: fileAsset?.publicUrl || '',
          }
        : null,
    };
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
      },
    };

    if (query?.jobPostId) {
      whereClause.jobPostId = query.jobPostId;
    }

    if (query?.stageId) {
      const pipelineStageToApplicationStatuses = {
        applied: ['SUBMITTED'],
        screening: ['VIEWED'],
        technical_test: ['SHORTLISTED'],
        interview: ['INTERVIEWING'],
        offering: ['OFFERED'],
        hired: ['HIRED'],
        rejected: ['REJECTED', 'WITHDRAWN'],
      } as const;

      const statuses = pipelineStageToApplicationStatuses[query.stageId as keyof typeof pipelineStageToApplicationStatuses];
      if (statuses) {
        whereClause.status = { in: statuses };
      }
    }

    if (query?.search) {
      const searchPattern = query.search;
      whereClause.OR = [
        {
          candidateProfile: {
            account: {
              fullName: { contains: searchPattern, mode: 'insensitive' },
            },
          },
        },
        {
          candidateProfile: {
            account: {
              email: { contains: searchPattern, mode: 'insensitive' },
            },
          },
        },
        {
          jobPost: {
            title: { contains: searchPattern, mode: 'insensitive' },
          },
        },
        {
          candidateProfile: {
            skills: {
              some: {
                skill: {
                  name: { contains: searchPattern, mode: 'insensitive' },
                },
              },
            },
          },
        },
      ];
    }

    const applications = await this.prisma.application.findMany({
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
            skills: {
              include: {
                skill: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            experiences: true,
          },
        },
        jobPost: {
          include: {
            jobPostSkills: {
              include: {
                skill: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        interviews: {
          where: {
            status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] },
          },
          orderBy: {
            scheduledStartAt: 'asc',
          },
          take: 1,
          include: {
            recruiterProfile: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const applicationStatusToPipelineStage = {
      SUBMITTED: 'applied',
      VIEWED: 'screening',
      SHORTLISTED: 'technical_test',
      INTERVIEWING: 'interview',
      OFFERED: 'offering',
      HIRED: 'hired',
      REJECTED: 'rejected',
      WITHDRAWN: 'rejected',
    } as const;

    const candidates = applications.map((app) => {
      // Name fallback
      const name = app.candidateProfile.account.fullName || app.candidateProfile.account.email;

      // Tech Stack derivation
      let techStack: string[] = [];
      if (app.candidateProfile.skills && app.candidateProfile.skills.length > 0) {
        techStack = app.candidateProfile.skills.map((s) => s.skill.name);
      } else if (app.jobPost.jobPostSkills && app.jobPost.jobPostSkills.length > 0) {
        techStack = app.jobPost.jobPostSkills.map((s) => s.skill.name);
      }

      // Experience calculation
      let totalMonths = 0;
      for (const exp of app.candidateProfile.experiences) {
        const start = exp.startDate ? new Date(exp.startDate) : new Date();
        const end = exp.isCurrent || !exp.endDate ? new Date() : new Date(exp.endDate);
        const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        totalMonths += Math.max(0, diffMonths);
      }
      const experienceYears = totalMonths > 0 ? Math.round(totalMonths / 12) : 0;

      // Interview derivation
      const interviewObj = app.interviews[0];
      const interview = interviewObj
        ? {
            id: interviewObj.id,
            scheduledAt: interviewObj.scheduledStartAt.toISOString(),
            interviewerName: interviewObj.recruiterProfile?.fullName || null,
            mode: interviewObj.type,
          }
        : null;

      const stageId = applicationStatusToPipelineStage[app.status] || 'applied';

      return {
        id: app.id,
        applicationId: app.id,
        candidateId: app.candidateProfile.id,
        name,
        role: app.jobPost.title,
        stageId,
        avatarUrl: null,
        location: app.candidateProfile.address || null,
        experienceYears,
        techStack,
        scores: [],
        lastUpdatedAt: app.updatedAt.toISOString(),
        interview,
      };
    });

    const totalCandidates = candidates.length;
    const inInterview = candidates.filter((c) => c.stageId === 'interview').length;
    const offersSent = candidates.filter((c) => c.stageId === 'offering').length;
    const hiredCount = candidates.filter((c) => c.stageId === 'hired').length;
    const passRate = totalCandidates > 0 ? Math.round((hiredCount / totalCandidates) * 100) : 0;

    const stages = [
      { id: 'applied', title: 'Applied', description: 'New applications received' },
      { id: 'screening', title: 'Screening', description: 'Initial resume & profile review' },
      { id: 'technical_test', title: 'Technical Test', description: 'Coding challenge and assessment' },
      { id: 'interview', title: 'Interview', description: 'Technical & cultural interview phases' },
      { id: 'offering', title: 'Offering', description: 'Salary negotiation & job offer extended' },
      { id: 'hired', title: 'Hired', description: 'Successfully signed and hired' },
      { id: 'rejected', title: 'Rejected', description: 'Unsuitable candidates for this position' },
    ];

    return {
      stages,
      candidates,
      metrics: {
        totalCandidates,
        inInterview,
        offersSent,
        passRate,
      },
    };
  }

  async updateStatus(recruiterId: string, id: string, status: ApplicationStatus, note?: string) {
    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
    });
    if (!recruiter) {
      throw new NotFoundException('Recruiter account not found');
    }

    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        jobPost: true,
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

    if (application.jobPost.companyId !== recruiter.companyId) {
      throw new ForbiddenException('You do not have permission to manage this application');
    }

    const updatedApp = await this.prisma.$transaction(async (tx) => {
      const app = await tx.application.update({
        where: { id },
        data: { status },
      });

      await tx.applicationStatusLog.create({
        data: {
          applicationId: id,
          actorType: ActorType.RECRUITER,
          actorId: recruiterId,
          oldStatus: application.status,
          newStatus: status,
          note: note ?? `Recruiter updated status to ${status}`,
        },
      });

      return app;
    });

    if (application.candidateProfile?.candidateAccountId) {
      this.notificationsService.createNotification({
        recipientId: application.candidateProfile.candidateAccountId,
        recipientType: ActorType.CANDIDATE,
        title: 'Trạng thái hồ sơ thay đổi',
        body: `Hồ sơ ứng tuyển vị trí ${application.jobPost.title} của bạn đã được cập nhật thành: ${status}.`,
        targetType: 'APPLICATION',
        targetId: id,
      }).catch(() => {});
    }

    return updatedApp;
  }
}
