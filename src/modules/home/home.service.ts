import { Injectable } from '@nestjs/common';
import {
  CompanyStatus,
  CompanyVerificationStatus,
  JobStatus,
  Prisma,
  WorkingModel,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HomeJobTab, HomeQueryDto } from './dto/home-query.dto';
import { HomeApiResponse, HomeData, HomeJobCard, HomeJobsSectionTab, HomeLatestJobCard } from './home.types';

const SALARY_BUCKETS = [
  { key: 'under-10', label: 'Duoi 10 trieu' },
  { key: '10-20', label: '10 - 20 trieu' },
  { key: '20-30', label: '20 - 30 trieu' },
  { key: '30-50', label: '30 - 50 trieu' },
  { key: 'over-50', label: 'Tren 50 trieu' },
  { key: 'negotiable', label: 'Thoa thuan' },
] as const;

type FeaturedJobRecord = Prisma.PromiseReturnType<HomeService['findFeaturedJobRecords']>[number];
type LatestJobRecord = Prisma.PromiseReturnType<HomeService['findLatestJobRecords']>[number];

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(query: HomeQueryDto): Promise<HomeApiResponse<HomeData>> {
    const [stats, jobsSection, topCompanies, marketInsight, companyLogos] = await Promise.all([
      this.getStatsOverview(),
      this.getJobsSection(query.jobPage, query.jobLimit),
      this.getTopCompanies(query.topCompaniesLimit),
      this.getMarketInsight(query.latestJobsLimit),
      this.getCompanyLogos(5),
    ]);

    return {
      success: true,
      data: {
        stats,
        jobsSection,
        topCompanies,
        marketInsight,
        companyLogos,
      },
    };
  }

  async getFeaturedJobs(tab: HomeJobTab, page: number, limit: number): Promise<HomeJobsSectionTab> {
    const where = this.buildPublicJobWhere(tab);
    const skip = (page - 1) * limit;
    const orderBy = this.getFeaturedJobOrderBy(tab);

    const [items, total] = await Promise.all([
      this.findFeaturedJobRecords(where, orderBy, skip, limit),
      this.prisma.jobPost.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return {
      items: items.map((item) => this.mapJobCard(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getTopCompanies(limit: number) {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      type: string;
      description: string | null;
      logo_url: string | null;
      cover_url: string | null;
      active_jobs_count: bigint | number;
      applications_count: bigint | number;
    }>>(Prisma.sql`
      SELECT
        c.id,
        c.name,
        c.type::text AS type,
        c.description,
        f.public_url AS logo_url,
        cover.public_url AS cover_url,
        COUNT(DISTINCT jp.id) AS active_jobs_count,
        COUNT(a.id) AS applications_count
      FROM companies c
      LEFT JOIN files f ON f.id = c.logo_file_id
      LEFT JOIN LATERAL (
        SELECT public_url
        FROM files
        WHERE owner_type = 'company_cover'
          AND owner_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) cover ON TRUE
      LEFT JOIN job_posts jp
        ON jp.company_id = c.id
       AND jp.status = ${'published'}::"JobStatus"
       AND jp.deleted_at IS NULL
       AND (jp.expired_at IS NULL OR jp.expired_at >= NOW())
      LEFT JOIN applications a ON a.job_post_id = jp.id
      WHERE c.status = ${'active'}::"CompanyStatus"
         OR c.verification_status = ${'verified'}::"CompanyVerificationStatus"
      GROUP BY c.id, c.name, c.type, c.description, f.public_url, cover.public_url
      ORDER BY applications_count DESC, active_jobs_count DESC, c.created_at DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      logo: row.logo_url ?? undefined,
      coverImage: row.cover_url ?? undefined,
      companyType: this.normalizeEnumText(row.type),
      shortDescription: row.description ?? '',
      activeJobsCount: this.toNumber(row.active_jobs_count),
      applicationsCount: this.toNumber(row.applications_count),
    }));
  }

  async getCompanyLogos(limit: number) {
    const companies = await this.prisma.company.findMany({
      where: {
        logoFileId: { not: null },
        status: CompanyStatus.ACTIVE,
      },
      take: limit,
      select: {
        slug: true,
        name: true,
        logoFile: {
          select: {
            publicUrl: true,
          },
        },
      },
      orderBy: {
        reputationScore: 'desc',
      },
    });

    return companies.map((c) => ({
      slug: c.slug,
      name: c.name,
      logo: c.logoFile?.publicUrl || '',
    }));
  }

  async getMarketInsight(latestJobsLimit: number) {
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthEnd = new Date(currentMonthStart.getTime() - 1);

    const lineChartTo = currentMonthStart;
    const lineChartFrom = new Date(lineChartTo);
    lineChartFrom.setDate(lineChartFrom.getDate() - 28);

    const [summary, jobGrowthLineChart, salaryDemandBarChart, latestJobs] = await Promise.all([
      this.getMarketInsightSummary(lastMonthStart, currentMonthStart, lastMonthEnd),
      this.getJobGrowthLineChart(lineChartFrom, lineChartTo),
      this.getSalaryDemandBarChart(),
      this.getLatestJobs(latestJobsLimit),
    ]);

    return {
      summary,
      jobGrowthLineChart,
      salaryDemandBarChart,
      latestJobs,
    };
  }

  private async getJobsSection(page: number, limit: number) {
    const [all, remote, partTime, latest] = await Promise.all([
      this.getFeaturedJobs('all', page, limit),
      this.getFeaturedJobs('remote', page, limit),
      this.getFeaturedJobs('parttime', page, limit),
      this.getFeaturedJobs('latest', page, limit),
    ]);

    return {
      all,
      remote,
      partTime,
      latest,
    };
  }

  private async getStatsOverview() {
    const [jobsCount, companiesCount, candidatesCount] = await Promise.all([
      this.prisma.jobPost.count({
        where: this.buildPublicJobWhere('all'),
      }),
      this.prisma.company.count({
        where: {
          OR: [
            { status: CompanyStatus.ACTIVE },
            { verificationStatus: CompanyVerificationStatus.VERIFIED },
          ],
        },
      }),
      this.prisma.candidateProfile.count(),
    ]);

    return {
      jobsCount,
      companiesCount,
      candidatesCount,
    };
  }

  private async getMarketInsightSummary(lastMonthStart: Date, currentMonthStart: Date, lastMonthEnd: Date) {
    const [newJobsCount, activeJobsCount, hiringCompaniesCount] = await Promise.all([
      this.prisma.jobPost.count({
        where: {
          ...this.buildPublicJobWhere('all'),
          createdAt: {
            gte: lastMonthStart,
            lt: currentMonthStart,
          },
        },
      }),
      this.prisma.jobPost.count({
        where: {
          ...this.buildPublicJobWhere('all'),
          createdAt: { lte: lastMonthEnd },
          OR: [{ expiredAt: null }, { expiredAt: { gte: lastMonthEnd } }],
        },
      }),
      this.prisma.jobPost
        .findMany({
          where: {
            ...this.buildPublicJobWhere('all'),
            createdAt: { lte: lastMonthEnd },
            OR: [{ expiredAt: null }, { expiredAt: { gte: lastMonthEnd } }],
          },
          select: {
            companyId: true,
          },
          distinct: ['companyId'],
        })
        .then((rows) => rows.length),
    ]);

    return {
      month: lastMonthStart.getMonth() + 1,
      year: lastMonthStart.getFullYear(),
      newJobsCount,
      activeJobsCount,
      hiringCompaniesCount,
    };
  }

  private async getJobGrowthLineChart(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ date: Date; jobs_count: bigint | number }>>(Prisma.sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS jobs_count
      FROM job_posts
      WHERE status = ${'published'}::"JobStatus"
        AND deleted_at IS NULL
        AND created_at >= ${from}
        AND created_at < ${to}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `);

    const countsByDate = new Map(rows.map((row) => [this.toIsoDate(row.date), this.toNumber(row.jobs_count)]));
    const points: Array<{ date: string; jobsCount: number }> = [];

    for (const date = new Date(from); date < to; date.setDate(date.getDate() + 1)) {
      const isoDate = this.toIsoDate(date);
      points.push({
        date: isoDate,
        jobsCount: countsByDate.get(isoDate) ?? 0,
      });
    }

    const values = points.map((point) => point.jobsCount);
    const firstValue = values[0] ?? 0;
    const lastValue = values[values.length - 1] ?? 0;

    return {
      from: this.toIsoDate(from),
      to: this.toIsoDate(to),
      minValue: values.length > 0 ? Math.min(...values) : 0,
      maxValue: values.length > 0 ? Math.max(...values) : 0,
      growthPercent: firstValue > 0 ? Number((((lastValue - firstValue) / firstValue) * 100).toFixed(1)) : 0,
      points,
    };
  }

  private async getSalaryDemandBarChart() {
    const jobs = await this.prisma.jobPost.findMany({
      where: this.buildPublicJobWhere('all'),
      select: {
        salaryMin: true,
        salaryMax: true,
        salaryIsNegotiable: true,
      },
    });

    const counts = new Map<string, number>(SALARY_BUCKETS.map((bucket) => [bucket.key, 0]));

    for (const job of jobs) {
      const bucket = this.resolveSalaryBucket(job.salaryMin, job.salaryMax, job.salaryIsNegotiable);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    return SALARY_BUCKETS.map((bucket) => ({
      salaryRange: bucket.label,
      jobsCount: counts.get(bucket.key) ?? 0,
    }));
  }

  private async getLatestJobs(limit: number): Promise<HomeLatestJobCard[]> {
    const jobs = await this.findLatestJobRecords(limit);
    return jobs.map((job) => this.mapLatestJobCard(job));
  }

  private findFeaturedJobRecords(
    where: Prisma.JobPostWhereInput,
    orderBy: Prisma.JobPostOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    return this.prisma.jobPost.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        title: true,
        slug: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryIsNegotiable: true,
        salaryIsVisible: true,
        expiredAt: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
            logoFile: {
              select: {
                publicUrl: true,
              },
            },
          },
        },
        employmentType: {
          select: {
            name: true,
          },
        },
        experienceLevel: {
          select: {
            name: true,
          },
        },
        jobPostSkills: {
          take: 4,
          select: {
            skill: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        jobPostLocations: {
          take: 1,
          select: {
            jobLocation: {
              select: {
                country: true,
                city: true,
                district: true,
                address: true,
                workingModel: true,
              },
            },
          },
        },
      },
    });
  }

  private findLatestJobRecords(limit: number) {
    return this.prisma.jobPost.findMany({
      where: this.buildPublicJobWhere('latest'),
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
            logoFile: {
              select: {
                publicUrl: true,
              },
            },
          },
        },
        employmentType: {
          select: {
            name: true,
          },
        },
        experienceLevel: {
          select: {
            name: true,
          },
        },
        jobCategory: {
          select: {
            name: true,
          },
        },
        jobPostLocations: {
          take: 1,
          select: {
            jobLocation: {
              select: {
                country: true,
                city: true,
                district: true,
                address: true,
                workingModel: true,
              },
            },
          },
        },
      },
    });
  }

  private buildPublicJobWhere(tab: HomeJobTab): Prisma.JobPostWhereInput {
    const now = new Date();
    const baseWhere: Prisma.JobPostWhereInput = {
      status: JobStatus.PUBLISHED,
      deletedAt: null,
      OR: [{ expiredAt: null }, { expiredAt: { gte: now } }],
    };

    if (tab === 'remote') {
      return {
        ...baseWhere,
        jobPostLocations: {
          some: {
            jobLocation: {
              workingModel: WorkingModel.REMOTE,
            },
          },
        },
      };
    }

    if (tab === 'parttime') {
      return {
        ...baseWhere,
        employmentType: {
          name: {
            contains: 'part',
            mode: 'insensitive',
          },
        },
      };
    }

    return baseWhere;
  }

  private getFeaturedJobOrderBy(tab: HomeJobTab): Prisma.JobPostOrderByWithRelationInput[] {
    if (tab === 'latest') {
      return [{ createdAt: 'desc' }];
    }

    return [
      { applications: { _count: 'desc' } },
      { views: { _count: 'desc' } },
      { savedJobs: { _count: 'desc' } },
      { createdAt: 'desc' },
    ];
  }

  private mapJobCard(job: FeaturedJobRecord): HomeJobCard {
    const primaryLocation = job.jobPostLocations[0]?.jobLocation;
    const logoUrl = job.company.logoFile?.publicUrl ?? undefined;

    return {
      id: job.id,
      title: job.title,
      slug: job.slug,
      skills: job.jobPostSkills.map((item) => item.skill),
      location: this.formatLocation(primaryLocation),
      workMode: primaryLocation?.workingModel ?? 'ONSITE',
      employmentType: this.normalizeEmploymentType(job.employmentType?.name),
      experience: job.experienceLevel?.name ?? '',
      salary: this.mapSalary(
        job.salaryMin,
        job.salaryMax,
        job.salaryCurrency,
        job.salaryIsNegotiable,
        job.salaryIsVisible,
      ),
      company: {
        id: job.company.id,
        name: job.company.name,
        logo: logoUrl,
        avatar: logoUrl,
      },
      deadline: job.expiredAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
    };
  }

  private mapLatestJobCard(job: LatestJobRecord): HomeLatestJobCard {
    const primaryLocation = job.jobPostLocations[0]?.jobLocation;
    const logoUrl = job.company.logoFile?.publicUrl ?? undefined;

    return {
      id: job.id,
      title: job.title,
      slug: job.slug,
      company: {
        id: job.company.id,
        name: job.company.name,
        logo: logoUrl,
        avatar: logoUrl,
      },
      location: this.formatLocation(primaryLocation),
      workMode: primaryLocation?.workingModel ?? 'ONSITE',
      employmentType: this.normalizeEmploymentType(job.employmentType?.name),
      positionName: job.jobCategory?.name ?? job.experienceLevel?.name ?? undefined,
      createdAt: job.createdAt.toISOString(),
    };
  }

  private mapSalary(
    min: Prisma.Decimal | null,
    max: Prisma.Decimal | null,
    currency: string,
    isNegotiable: boolean,
    isVisible: boolean,
  ) {
    const salaryMin = min ? Number(min) : undefined;
    const salaryMax = max ? Number(max) : undefined;

    if (!isVisible || isNegotiable || (!salaryMin && !salaryMax)) {
      return {
        min: salaryMin,
        max: salaryMax,
        currency,
        label: 'Thoa thuan',
      };
    }

    return {
      min: salaryMin,
      max: salaryMax,
      currency,
      label: this.formatSalaryLabel(salaryMin, salaryMax, currency),
    };
  }

  private formatSalaryLabel(min?: number, max?: number, currency = 'VND') {
    if (min && max) {
      return `${this.formatCurrency(min, currency)} - ${this.formatCurrency(max, currency)}`;
    }

    if (min) {
      return `Tu ${this.formatCurrency(min, currency)}`;
    }

    if (max) {
      return `Den ${this.formatCurrency(max, currency)}`;
    }

    return 'Thoa thuan';
  }

  private formatCurrency(value: number, currency: string) {
    if (currency === 'VND') {
      return `${Math.round(value / 1_000_000)} trieu`;
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private resolveSalaryBucket(min: Prisma.Decimal | null, max: Prisma.Decimal | null, isNegotiable: boolean) {
    if (isNegotiable) {
      return 'negotiable';
    }

    const minValue = min ? Number(min) : null;
    const maxValue = max ? Number(max) : null;
    const anchor = maxValue ?? minValue;

    if (!anchor) {
      return 'negotiable';
    }

    if (anchor < 10_000_000) {
      return 'under-10';
    }
    if (anchor <= 20_000_000) {
      return '10-20';
    }
    if (anchor <= 30_000_000) {
      return '20-30';
    }
    if (anchor <= 50_000_000) {
      return '30-50';
    }

    return 'over-50';
  }

  private formatLocation(location?: {
    country: string;
    city: string | null;
    district: string | null;
    address: string | null;
    workingModel: WorkingModel;
  }) {
    if (!location) {
      return '';
    }

    const parts = [location.address, location.district, location.city, location.country].filter(
      (value): value is string => Boolean(value),
    );

    if (parts.length > 0) {
      return parts.join(', ');
    }

    return this.normalizeEnumText(location.workingModel);
  }

  private normalizeEmploymentType(value?: string | null) {
    if (!value) {
      return 'FULL_TIME';
    }

    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');

    if (normalized.includes('PART')) {
      return 'PART_TIME';
    }
    if (normalized.includes('INTERN')) {
      return 'INTERNSHIP';
    }
    if (normalized.includes('FULL')) {
      return 'FULL_TIME';
    }

    return normalized;
  }

  private normalizeEnumText(value: string) {
    return value.toUpperCase().replace(/[\s-]+/g, '_');
  }

  private toNumber(value: bigint | number) {
    return typeof value === 'bigint' ? Number(value) : value;
  }

  private toIsoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
