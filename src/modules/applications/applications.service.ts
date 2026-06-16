import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActorType, ApplicationStatus, JobStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyJobDto } from './dto/apply-job.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async applyJob(candidateAccountId: string, dto: ApplyJobDto) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
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

    return this.prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
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
          applicationId: app.id,
          actorType: ActorType.CANDIDATE,
          actorId: candidateAccountId,
          oldStatus: null,
          newStatus: ApplicationStatus.SUBMITTED,
          note: 'Candidate submitted application',
        },
      });

      return app;
    });
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
        cvVersion: true,
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

    return application;
  }

  async getMyApplications(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
    });
    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    return this.prisma.application.findMany({
      where: { candidateProfileId: profile.id },
      include: {
        jobPost: {
          include: {
            company: true,
            experienceLevel: true,
            employmentType: true,
          },
        },
        cvVersion: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
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

    return this.prisma.application.findMany({
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
        cvVersion: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
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
}
