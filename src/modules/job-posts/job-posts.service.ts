import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';
import { AddSkillToJobDto, AddLocationToJobDto, AddSpecializationToJobDto } from './dto/job-post-relations.dto';
import { JobStatus, Prisma } from '@prisma/client';

@Injectable()
export class JobPostsService {
  constructor(private prisma: PrismaService) {}

  async create(recruiterId: string, companyId: string, createJobPostDto: CreateJobPostDto) {
    // Generate slug from title
    const slug = `${createJobPostDto.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

    return this.prisma.jobPost.create({
      data: {
        ...createJobPostDto,
        slug,
        createdByRecruiterId: recruiterId,
        companyId,
        status: JobStatus.DRAFT,
      },
    });
  }

  async findAll(query?: any) {
    return this.prisma.jobPost.findMany({
      where: {
        status: JobStatus.PUBLISHED,
        // add filters later if needed
      },
      include: {
        company: true,
        jobCategory: true,
        employmentType: true,
        experienceLevel: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id },
      include: {
        company: true,
        jobPostSkills: { include: { skill: true } },
        jobPostLocations: { include: { jobLocation: true } },
        jobPostSpecializations: { include: { specialization: true } },
        jobCategory: true,
        employmentType: true,
        experienceLevel: true,
      },
    });

    if (!jobPost) {
      throw new NotFoundException(`JobPost with ID ${id} not found`);
    }

    return jobPost;
  }

  async update(id: string, recruiterId: string, updateJobPostDto: UpdateJobPostDto) {
    const job = await this.findOne(id);
    if (job.createdByRecruiterId !== recruiterId) {
      throw new ForbiddenException('You are not allowed to update this job post');
    }

    return this.prisma.jobPost.update({
      where: { id },
      data: updateJobPostDto,
    });
  }

  async remove(id: string, recruiterId: string) {
    const job = await this.findOne(id);
    if (job.createdByRecruiterId !== recruiterId) {
      throw new ForbiddenException('You are not allowed to delete this job post');
    }

    await this.prisma.jobPost.delete({ where: { id } });
  }

  async updateStatus(id: string, recruiterId: string, status: JobStatus) {
    const job = await this.findOne(id);
    if (job.createdByRecruiterId !== recruiterId) {
      throw new ForbiddenException(`You are not allowed to ${status.toLowerCase()} this job post`);
    }

    const data: Prisma.JobPostUpdateInput = { status };
    if (status === JobStatus.PUBLISHED) {
      data.publishedAt = new Date();
    }

    return this.prisma.jobPost.update({
      where: { id },
      data,
    });
  }

  async getMyJobPosts(recruiterId: string) {
    return this.prisma.jobPost.findMany({
      where: { createdByRecruiterId: recruiterId },
      include: {
        jobCategory: true,
        employmentType: true,
        experienceLevel: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Relations
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

  private async verifyJobOwner(jobId: string, recruiterId: string) {
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job post not found');
    if (job.createdByRecruiterId !== recruiterId) {
      throw new ForbiddenException('You are not allowed to modify this job post');
    }
    return job;
  }
}
