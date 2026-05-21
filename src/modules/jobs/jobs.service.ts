import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../shared/decorators/current-user.decorator';
import { toPagination } from '../../shared/dto/pagination-query.dto';
import { slugify } from '../../shared/utils/slugify';
import { CompaniesService } from '../companies/companies.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, SkillInputDto } from './dto/create-job.dto';
import { JobsQueryDto } from './dto/jobs-query.dto';
import { UpdateJobDto } from './dto/update-job.dto';

const jobInclude = {
  company: true,
  skills: {
    include: {
      skill: true,
    },
  },
} satisfies Prisma.JobInclude;

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
  ) {}

  async findPublished(query: JobsQueryDto) {
    const where: Prisma.JobWhereInput = {
      status: JobStatus.PUBLISHED,
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.location ? { location: { contains: query.location, mode: 'insensitive' } } : {}),
      ...(query.remoteOnly ? { isRemote: true } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              { requirements: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.skill
        ? {
            skills: {
              some: {
                skill: {
                  name: { equals: query.skill, mode: 'insensitive' },
                },
              },
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        ...toPagination(query),
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        include: jobInclude,
      }),
      this.prisma.job.count({ where }),
    ]);

    return { items, meta: { total, page: query.page, limit: query.limit } };
  }

  async findPublishedById(id: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, status: JobStatus.PUBLISHED },
      include: jobInclude,
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async create(user: AuthenticatedUser, dto: CreateJobDto) {
    await this.companiesService.assertCanManageCompany(user, dto.companyId);

    try {
      return await this.prisma.job.create({
        data: {
          companyId: dto.companyId,
          title: dto.title,
          slug: slugify(dto.title),
          description: dto.description,
          requirements: dto.requirements,
          benefits: dto.benefits,
          location: dto.location,
          isRemote: dto.isRemote ?? false,
          employmentType: dto.employmentType,
          experienceLevel: dto.experienceLevel,
          minSalary: dto.minSalary,
          maxSalary: dto.maxSalary,
          currency: dto.currency,
          expiresAt: dto.expiresAt,
          status: dto.status ?? JobStatus.DRAFT,
          publishedAt: dto.status === JobStatus.PUBLISHED ? new Date() : undefined,
          skills: this.toSkillCreateInput(dto.skills),
        },
        include: jobInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Job slug is already taken for this company');
      }
      throw error;
    }
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateJobDto) {
    const current = await this.prisma.job.findUniqueOrThrow({ where: { id } });
    await this.companiesService.assertCanManageCompany(user, current.companyId);

    const status = dto.status;

    return this.prisma.job.update({
      where: { id },
      data: {
        title: dto.title,
        slug: dto.title ? slugify(dto.title) : undefined,
        description: dto.description,
        requirements: dto.requirements,
        benefits: dto.benefits,
        location: dto.location,
        isRemote: dto.isRemote,
        employmentType: dto.employmentType,
        experienceLevel: dto.experienceLevel,
        minSalary: dto.minSalary,
        maxSalary: dto.maxSalary,
        currency: dto.currency,
        expiresAt: dto.expiresAt,
        status,
        publishedAt:
          status === JobStatus.PUBLISHED && current.status !== JobStatus.PUBLISHED
            ? new Date()
            : undefined,
        ...(dto.skills
          ? {
              skills: {
                deleteMany: {},
                ...this.toSkillCreateInput(dto.skills),
              },
            }
          : {}),
      },
      include: jobInclude,
    });
  }

  async publish(user: AuthenticatedUser, id: string) {
    const current = await this.prisma.job.findUniqueOrThrow({ where: { id } });
    await this.companiesService.assertCanManageCompany(user, current.companyId);

    return this.prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.PUBLISHED,
        publishedAt: current.publishedAt ?? new Date(),
      },
      include: jobInclude,
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    const current = await this.prisma.job.findUniqueOrThrow({ where: { id } });
    await this.companiesService.assertCanManageCompany(user, current.companyId);
    await this.prisma.job.delete({ where: { id } });
    return { deleted: true };
  }

  private toSkillCreateInput(
    skills?: SkillInputDto[],
  ): Prisma.JobSkillCreateNestedManyWithoutJobInput {
    const normalized = Array.from(
      new Map(
        (skills ?? []).map((skill) => [
          skill.name.trim().toLowerCase(),
          { name: skill.name.trim(), required: skill.required ?? false },
        ]),
      ).values(),
    );

    return {
      create: normalized.map((skill) => ({
        required: skill.required,
        skill: {
          connectOrCreate: {
            where: { name: skill.name },
            create: { name: skill.name },
          },
        },
      })),
    };
  }
}
