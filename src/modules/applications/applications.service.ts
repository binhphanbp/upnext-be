import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, JobStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../shared/decorators/current-user.decorator';
import { PaginationQueryDto, toPagination } from '../../shared/dto/pagination-query.dto';
import { CompaniesService } from '../companies/companies.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

const applicationInclude = {
  job: {
    include: {
      company: true,
    },
  },
  candidate: {
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
    },
  },
} satisfies Prisma.ApplicationInclude;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesService: CompaniesService,
  ) {}

  async apply(user: AuthenticatedUser, dto: CreateApplicationDto) {
    const job = await this.prisma.job.findFirst({
      where: { id: dto.jobId, status: JobStatus.PUBLISHED },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    try {
      return await this.prisma.application.create({
        data: {
          jobId: dto.jobId,
          candidateId: user.id,
          coverLetter: dto.coverLetter,
          resumeUrl: dto.resumeUrl,
        },
        include: applicationInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already applied to this job');
      }
      throw error;
    }
  }

  async findMine(user: AuthenticatedUser, query: PaginationQueryDto) {
    const where: Prisma.ApplicationWhereInput = { candidateId: user.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        ...toPagination(query),
        orderBy: { createdAt: 'desc' },
        include: applicationInclude,
      }),
      this.prisma.application.count({ where }),
    ]);

    return { items, meta: { total, page: query.page, limit: query.limit } };
  }

  async findByJob(user: AuthenticatedUser, jobId: string, query: PaginationQueryDto) {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    await this.companiesService.assertCanManageCompany(user, job.companyId);

    const where: Prisma.ApplicationWhereInput = { jobId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        ...toPagination(query),
        orderBy: { createdAt: 'desc' },
        include: applicationInclude,
      }),
      this.prisma.application.count({ where }),
    ]);

    return { items, meta: { total, page: query.page, limit: query.limit } };
  }

  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdateApplicationStatusDto) {
    const application = await this.prisma.application.findUniqueOrThrow({
      where: { id },
      include: { job: true },
    });
    await this.companiesService.assertCanManageCompany(user, application.job.companyId);

    return this.prisma.application.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes,
      },
      include: applicationInclude,
    });
  }

  async withdraw(user: AuthenticatedUser, id: string) {
    const application = await this.prisma.application.findUniqueOrThrow({ where: { id } });
    if (application.candidateId !== user.id) {
      throw new ForbiddenException('You cannot withdraw this application');
    }

    return this.prisma.application.update({
      where: { id },
      data: { status: ApplicationStatus.WITHDRAWN },
      include: applicationInclude,
    });
  }
}
