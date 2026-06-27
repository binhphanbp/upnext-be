import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyVerificationStatus, JobStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import {
  AddLocationToJobDto,
  AddSkillToJobDto,
  AddSpecializationToJobDto,
} from './dto/job-post-relations.dto';
import { ListAdminJobPostsQueryDto } from './dto/list-admin-job-posts-query.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';

@Injectable()
export class JobPostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, createJobPostDto: CreateJobPostDto) {
    const context = await this.resolveRecruiterContext(user.id);
    const slug = this.createSlug(createJobPostDto.title);

    return this.prisma.jobPost.create({
      data: {
        ...createJobPostDto,
        slug,
        createdByRecruiterId: user.id,
        companyId: context.company.id,
        status: JobStatus.DRAFT,
      },
      include: this.ownerJobPostInclude(),
    });
  }

  async findAll() {
    return this.prisma.jobPost.findMany({
      where: {
        status: JobStatus.PUBLISHED,
        deletedAt: null,
      },
      include: this.publicJobPostInclude(),
      orderBy: { publishedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const jobPost = await this.prisma.jobPost.findFirst({
      where: {
        id,
        status: JobStatus.PUBLISHED,
        deletedAt: null,
      },
      include: this.publicJobPostInclude(),
    });

    if (!jobPost) {
      throw new NotFoundException(`Job post ${id} not found`);
    }

    return jobPost;
  }

  async update(id: string, recruiterId: string, updateJobPostDto: UpdateJobPostDto) {
    await this.verifyJobOwner(id, recruiterId);

    return this.prisma.jobPost.update({
      where: { id },
      data: updateJobPostDto,
      include: this.ownerJobPostInclude(),
    });
  }

  async remove(id: string, recruiterId: string) {
    await this.verifyJobOwner(id, recruiterId);
    await this.prisma.jobPost.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: JobStatus.CLOSED,
      },
    });
  }

  async updateStatus(id: string, recruiterId: string, status: JobStatus) {
    const job = await this.verifyJobOwner(id, recruiterId);

    if (status === JobStatus.PUBLISHED) {
      await this.ensureCompanyCanPublish(job.companyId);
    }

    const data: Prisma.JobPostUpdateInput = { status };
    if (status === JobStatus.PUBLISHED) {
      data.publishedAt = new Date();
    }

    return this.prisma.jobPost.update({
      where: { id },
      data,
      include: this.ownerJobPostInclude(),
    });
  }

  async getMyJobPosts(recruiterId: string) {
    return this.prisma.jobPost.findMany({
      where: { createdByRecruiterId: recruiterId },
      include: this.ownerJobPostInclude(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForAdmin(query: ListAdminJobPostsQueryDto) {
    const where: Prisma.JobPostWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.moderationStatus ? { moderationStatus: query.moderationStatus } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { company: { is: { name: { contains: query.q, mode: 'insensitive' } } } },
              {
                createdByRecruiter: {
                  is: { email: { contains: query.q, mode: 'insensitive' } },
                },
              },
              {
                createdByRecruiter: {
                  is: {
                    profile: {
                      is: { fullName: { contains: query.q, mode: 'insensitive' } },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const totalPages = (total: number) => Math.ceil(total / query.limit);

    const [items, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: this.adminJobPostInclude(),
      }),
      this.prisma.jobPost.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: totalPages(total),
        hasNextPage: query.page < totalPages(total),
        hasPrevPage: query.page > 1,
      },
    };
  }

  async addSkillToJob(jobId: string, recruiterId: string, dto: AddSkillToJobDto) {
    await this.verifyJobOwner(jobId, recruiterId);
    return this.prisma.jobPostSkill.create({
      data: {
        jobPostId: jobId,
        ...dto,
      },
    });
  }

  async removeSkillFromJob(jobId: string, skillId: string, recruiterId: string) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.jobPostSkill.delete({
      where: {
        jobPostId_skillId: {
          jobPostId: jobId,
          skillId,
        },
      },
    });
  }

  async addLocationToJob(jobId: string, recruiterId: string, dto: AddLocationToJobDto) {
    await this.verifyJobOwner(jobId, recruiterId);
    return this.prisma.jobPostLocation.create({
      data: {
        jobPostId: jobId,
        jobLocationId: dto.jobLocationId,
      },
    });
  }

  async removeLocationFromJob(jobId: string, locationId: string, recruiterId: string) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.jobPostLocation.delete({
      where: {
        jobPostId_jobLocationId: {
          jobPostId: jobId,
          jobLocationId: locationId,
        },
      },
    });
  }

  async addSpecializationToJob(jobId: string, recruiterId: string, dto: AddSpecializationToJobDto) {
    await this.verifyJobOwner(jobId, recruiterId);
    return this.prisma.jobPostSpecialization.create({
      data: {
        jobPostId: jobId,
        ...dto,
      },
    });
  }

  async removeSpecializationFromJob(jobId: string, specializationId: string, recruiterId: string) {
    await this.verifyJobOwner(jobId, recruiterId);
    await this.prisma.jobPostSpecialization.delete({
      where: {
        jobPostId_specializationId: {
          jobPostId: jobId,
          specializationId,
        },
      },
    });
  }

  async recordView(
    jobId: string,
    ipAddress?: string,
    userAgent?: string,
    candidateAccountId?: string,
  ) {
    await this.findOne(jobId);
    let profileId: string | undefined;

    if (candidateAccountId) {
      const profile = await this.prisma.candidateProfile.findUnique({
        where: { candidateAccountId },
        select: { id: true },
      });

      profileId = profile?.id;
    }

    return this.prisma.jobView.create({
      data: {
        jobPostId: jobId,
        ipAddress,
        userAgent,
        candidateProfileId: profileId,
      },
    });
  }

  async getViewStats(jobId: string, recruiterId: string) {
    await this.verifyJobOwner(jobId, recruiterId);
    const views = await this.prisma.jobView.count({
      where: { jobPostId: jobId },
    });
    return { views };
  }

  private async verifyJobOwner(jobId: string, recruiterId: string) {
    const job = await this.prisma.jobPost.findFirst({
      where: {
        id: jobId,
        deletedAt: null,
      },
      select: {
        id: true,
        createdByRecruiterId: true,
        companyId: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job post not found');
    }

    if (job.createdByRecruiterId !== recruiterId) {
      throw new ForbiddenException('You are not allowed to modify this job post');
    }

    return job;
  }

  private async resolveRecruiterContext(recruiterId: string) {
    const account = await this.prisma.recruiterAccount.findUnique({
      where: { id: recruiterId },
      select: {
        id: true,
        company: {
          select: {
            id: true,
            verificationStatus: true,
            businessLicenseFileId: true,
          },
        },
      },
    });

    if (!account?.company) {
      throw new BadRequestException('Recruiter account has not been attached to a company');
    }

    if (!account.company.businessLicenseFileId) {
      throw new BadRequestException(
        'Company business license is required before creating job posts',
      );
    }

    return { company: account.company };
  }

  private async ensureCompanyCanPublish(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        verificationStatus: true,
        businessLicenseFileId: true,
      },
    });

    if (!company?.businessLicenseFileId) {
      throw new BadRequestException(
        'Company business license is required before publishing job posts',
      );
    }

    if (company.verificationStatus !== CompanyVerificationStatus.VERIFIED) {
      throw new ForbiddenException('Company must be verified before publishing job posts');
    }
  }

  private publicJobPostInclude() {
    return {
      company: true,
      jobCategory: true,
      employmentType: true,
      experienceLevel: true,
      jobPostSkills: { include: { skill: true } },
      jobPostLocations: { include: { jobLocation: true } },
      jobPostSpecializations: { include: { specialization: true } },
    } satisfies Prisma.JobPostInclude;
  }

  private ownerJobPostInclude() {
    return {
      company: {
        select: {
          id: true,
          name: true,
          verificationStatus: true,
          businessLicenseFileId: true,
        },
      },
      jobCategory: true,
      employmentType: true,
      experienceLevel: true,
      jobPostSkills: { include: { skill: true } },
      jobPostLocations: { include: { jobLocation: true } },
      jobPostSpecializations: { include: { specialization: true } },
      _count: {
        select: {
          applications: true,
          views: true,
        },
      },
    } satisfies Prisma.JobPostInclude;
  }

  private adminJobPostInclude() {
    return {
      company: {
        select: {
          id: true,
          name: true,
          status: true,
          verificationStatus: true,
        },
      },
      createdByRecruiter: {
        select: {
          id: true,
          email: true,
          status: true,
          profile: {
            select: {
              id: true,
              fullName: true,
              phoneNumber: true,
            },
          },
          recruiterRole: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
      jobCategory: true,
      employmentType: true,
      experienceLevel: true,
      _count: {
        select: {
          applications: true,
          views: true,
          savedJobs: true,
        },
      },
    } satisfies Prisma.JobPostInclude;
  }

  private createSlug(title: string) {
    const normalizedTitle = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return `${normalizedTitle || 'job'}-${Date.now()}`;
  }
}
