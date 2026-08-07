import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApplicationStatus,
  CompanyStatus,
  JobStatus,
  JobSearchStatus,
  ModerationStatus,
  PostStatus,
  Prisma,
  WorkingModel,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HomeJobTab, HomeQueryDto } from './dto/home-query.dto';
import {
  HomeApiResponse,
  HomeData,
  HomeJobCard,
  HomeJobsSectionTab,
  HomeLatestJobCard,
  HomePostCard,
  HomeAction,
  HomePersonalization,
  HomeRecommendation,
  HomeRecommendationSection,
} from './home.types';

const SALARY_BUCKETS = [
  { key: 'under-10', label: 'Dưới 10 triệu' },
  { key: '10-20', label: '10 - 20 triệu' },
  { key: '20-30', label: '20 - 30 triệu' },
  { key: '30-50', label: '30 - 50 triệu' },
  { key: 'over-50', label: 'Trên 50 triệu' },
] as const;

type FeaturedJobRecord = Prisma.PromiseReturnType<HomeService['findFeaturedJobRecords']>[number];
type LatestJobRecord = Prisma.PromiseReturnType<HomeService['findLatestJobRecords']>[number];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const INTEREST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const RECOMMENDATION_MIN_SCORE = 50;
// Three distinct matches are enough to establish a useful personalized set;
// a larger desktop grid may still be paginated by the client without hiding
// relevant recommendations from candidates with a narrower profile.
const RECOMMENDATION_MIN_ITEMS = 3;

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(
    query: HomeQueryDto,
    candidateProfileId?: string,
  ): Promise<HomeApiResponse<HomeData>> {
    const [stats, jobsSection, topCompanies, marketInsight, companyLogos, latestPosts] =
      await Promise.all([
        this.getStatsOverview(),
        this.getJobsSection(
          query.jobPage,
          query.jobLimit,
          query.expiringJobsLimit,
          candidateProfileId,
        ),
        this.getTopCompanies(query.topCompaniesLimit),
        this.getMarketInsight(query.latestJobsLimit),
        this.getCompanyLogos(5),
        this.getLatestPosts(8),
      ]);

    return {
      success: true,
      data: {
        stats,
        jobsSection,
        topCompanies,
        marketInsight,
        companyLogos,
        latestPosts,
      },
    };
  }

  async getCandidateHome(candidateAccountId: string, query: HomeQueryDto) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Candidate profile not found');
    }

    const [base, personalization, recommendations, actions] = await Promise.all([
      this.getHome(query, profile.id),
      this.getPersonalization(profile.id),
      this.getRecommendations(profile.id),
      this.getCandidateActions(profile.id),
    ]);

    return {
      ...base,
      data: {
        ...base.data,
        personalization,
        recommendations: personalization.state === 'ELIGIBLE' ? recommendations : undefined,
        actions,
      },
    };
  }

  async getFeaturedJobs(
    tab: HomeJobTab,
    page: number,
    limit: number,
    candidateProfileId?: string,
  ): Promise<HomeJobsSectionTab> {
    const where = this.buildPublicJobWhere(tab, candidateProfileId);
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
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        type: string;
        description: string | null;
        logo_url: string | null;
        cover_url: string | null;
        active_jobs_count: bigint | number;
        applications_count: bigint | number;
        latest_published_at: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        c.id,
        c.name,
        c.type::text AS type,
        c.description,
        f.public_url AS logo_url,
        cover.public_url AS cover_url,
        COUNT(DISTINCT jp.id) AS active_jobs_count,
        COUNT(DISTINCT a.id) AS applications_count,
        MAX(jp.published_at) AS latest_published_at
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
       AND jp.moderation_status = ${'approved'}::"ModerationStatus"
       AND jp.is_hidden = FALSE
       AND jp.deleted_at IS NULL
       AND jp.published_at IS NOT NULL
       AND (jp.expired_at IS NULL OR jp.expired_at >= NOW())
      LEFT JOIN applications a ON a.job_post_id = jp.id
      WHERE c.status = ${'active'}::"CompanyStatus"
      GROUP BY c.id, c.name, c.type, c.description, f.public_url, cover.public_url
      ORDER BY active_jobs_count DESC, latest_published_at DESC NULLS LAST, c.name ASC
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
      latestPublishedAt: row.latest_published_at?.toISOString() ?? null,
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

  private async getJobsSection(
    page: number,
    limit: number,
    expiringLimit: number,
    candidateProfileId?: string,
  ) {
    const [all, remote, partTime, latest, popular, expiring] = await Promise.all([
      this.getFeaturedJobs('all', page, limit, candidateProfileId),
      this.getFeaturedJobs('remote', page, limit, candidateProfileId),
      this.getFeaturedJobs('parttime', page, limit, candidateProfileId),
      this.getFeaturedJobs('latest', page, limit, candidateProfileId),
      this.getFeaturedJobs('popular', page, limit, candidateProfileId),
      this.getFeaturedJobs('expiring', page, expiringLimit, candidateProfileId),
    ]);

    const expiringIds = new Set(expiring.items.map((item) => item.id));
    latest.items = latest.items.filter((item) => !expiringIds.has(item.id));

    return {
      all,
      remote,
      partTime,
      latest,
      popular,
      expiring,
    };
  }

  private async getPersonalization(candidateProfileId: string): Promise<HomePersonalization> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: {
        jobSearchStatus: true,
        skills: { select: { skill: { select: { id: true, name: true } } } },
        jobPreference: {
          select: {
            desiredPosition: true,
            desiredSalaryMin: true,
            desiredSalaryMax: true,
            workingModel: true,
            desiredLevelId: true,
          },
        },
      },
    });
    if (!profile) return { state: 'INSUFFICIENT', signalGroups: [], missingSignals: ['PROFILE'] };
    if (profile.jobSearchStatus === JobSearchStatus.NOT_LOOKING) {
      return { state: 'NOT_LOOKING', signalGroups: [], missingSignals: [] };
    }

    const signalGroups: string[] = [];
    if (profile.skills.length > 0) signalGroups.push('SKILLS');
    if (profile.jobPreference?.desiredPosition) signalGroups.push('POSITION');
    if (profile.jobPreference?.workingModel) signalGroups.push('WORKING_MODEL');
    if (profile.jobPreference?.desiredLevelId) signalGroups.push('LEVEL');
    if (profile.jobPreference?.desiredSalaryMin || profile.jobPreference?.desiredSalaryMax) {
      signalGroups.push('SALARY');
    }

    return {
      state: signalGroups.length >= 2 ? 'ELIGIBLE' : 'INSUFFICIENT',
      signalGroups,
      missingSignals: [
        profile.skills.length === 0 ? 'SKILLS' : '',
        profile.jobPreference?.desiredPosition ? '' : 'POSITION',
      ].filter(Boolean),
    };
  }

  private async getRecommendations(candidateProfileId: string): Promise<HomeRecommendationSection> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: {
        jobSearchStatus: true,
        skills: { select: { skillId: true, skill: { select: { name: true } } } },
        companyFollows: { select: { companyId: true } },
        jobPreference: {
          select: {
            desiredPosition: true,
            desiredSalaryMin: true,
            desiredSalaryMax: true,
            workingModel: true,
            desiredLevelId: true,
          },
        },
      },
    });
    if (!profile || profile.jobSearchStatus === JobSearchStatus.NOT_LOOKING) {
      return { title: 'LATEST', items: [] };
    }

    const jobs = await this.prisma.jobPost.findMany({
      where: this.buildPublicJobWhere('all', candidateProfileId),
      take: 200,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        companyId: true,
        experienceLevelId: true,
        salaryMin: true,
        salaryMax: true,
        jobPostSkills: { select: { skillId: true, skill: { select: { name: true } } } },
        jobPostLocations: { select: { jobLocation: { select: { workingModel: true } } } },
      },
    });
    const desiredPosition = profile.jobPreference?.desiredPosition?.toLowerCase();
    const desiredSkillIds = new Set(profile.skills.map((item) => item.skillId));
    const followedCompanies = new Set(profile.companyFollows.map((item) => item.companyId));
    const scored = jobs
      .map((job) => {
        const matchingSkills = job.jobPostSkills
          .filter((item) => desiredSkillIds.has(item.skillId))
          .map((item) => item.skill.name);
        const positionMatch = Boolean(
          desiredPosition && job.title.toLowerCase().includes(desiredPosition),
        );
        const modelMatch = Boolean(
          profile.jobPreference?.workingModel &&
          job.jobPostLocations.some(
            (item) => item.jobLocation.workingModel === profile.jobPreference?.workingModel,
          ),
        );
        const salaryMatch = this.salaryOverlap(
          job.salaryMin,
          job.salaryMax,
          profile.jobPreference?.desiredSalaryMin,
          profile.jobPreference?.desiredSalaryMax,
        );
        const reasons: string[] = [];
        let score = 0;
        if (matchingSkills.length) {
          score += 40;
          reasons.push('SKILL_MATCH');
        }
        if (positionMatch) {
          score += 25;
          reasons.push('POSITION_MATCH');
        }
        if (modelMatch) {
          score += 10;
          reasons.push('WORKING_MODEL_MATCH');
        }
        if (
          profile.jobPreference?.desiredLevelId &&
          job.experienceLevelId === profile.jobPreference.desiredLevelId
        ) {
          score += 10;
          reasons.push('LEVEL_MATCH');
        }
        if (salaryMatch) {
          score += 10;
          reasons.push('SALARY_OVERLAP');
        }
        if (followedCompanies.has(job.companyId)) {
          score += 5;
          reasons.push('FOLLOWED_COMPANY');
        }
        return { id: job.id, score, reasons, matchingSkills };
      })
      .filter((job) => job.score >= RECOMMENDATION_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (scored.length < RECOMMENDATION_MIN_ITEMS) {
      const latest = await this.getFeaturedJobs(
        'latest',
        1,
        RECOMMENDATION_MIN_ITEMS,
        candidateProfileId,
      );
      return {
        title: 'LATEST',
        items: latest.items.map(
          (job): HomeRecommendation => ({
            job,
            score: 0,
            reasonCodes: [],
            matchedSkills: [],
          }),
        ),
      };
    }
    const cards = await this.findFeaturedJobRecords(
      {
        ...this.buildPublicJobWhere('all', candidateProfileId),
        id: { in: scored.map((item) => item.id) },
      },
      [{ publishedAt: 'desc' }],
      0,
      scored.length,
    );
    const cardById = new Map(cards.map((card) => [card.id, this.mapJobCard(card)]));
    return {
      title: 'RECOMMENDED',
      items: scored.flatMap((item) => {
        const job = cardById.get(item.id);
        return job
          ? [
              {
                job,
                score: item.score,
                reasonCodes: item.reasons,
                matchedSkills: item.matchingSkills,
              },
            ]
          : [];
      }),
    };
  }

  private async getCandidateActions(candidateProfileId: string): Promise<HomeAction[]> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: {
        jobSearchStatus: true,
        jobPreference: { select: { id: true } },
        cvs: { select: { id: true }, take: 1 },
      },
    });
    if (!profile || profile.jobSearchStatus === JobSearchStatus.NOT_LOOKING) return [];
    const actions: HomeAction[] = [];
    if (profile.cvs.length === 0) actions.push({ type: 'MISSING_CV' });
    if (!profile.jobPreference) actions.push({ type: 'MISSING_PREFERENCES' });
    const application = await this.prisma.application.findFirst({
      where: {
        candidateProfileId,
        status: {
          in: [
            ApplicationStatus.VIEWED,
            ApplicationStatus.SHORTLISTED,
            ApplicationStatus.INTERVIEWING,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, jobPostId: true, status: true },
    });
    if (application)
      actions.push({
        type: 'APPLICATION_UPDATED',
        applicationId: application.id,
        jobId: application.jobPostId,
        status: application.status,
      });
    return actions;
  }

  private salaryOverlap(
    jobMin: Prisma.Decimal | null,
    jobMax: Prisma.Decimal | null,
    desiredMin?: Prisma.Decimal | null,
    desiredMax?: Prisma.Decimal | null,
  ) {
    if (!desiredMin && !desiredMax) return false;
    const min = jobMin ? Number(jobMin) : Number(jobMax ?? 0);
    const max = jobMax ? Number(jobMax) : Number(jobMin ?? 0);
    const wantedMin = desiredMin ? Number(desiredMin) : 0;
    const wantedMax = desiredMax ? Number(desiredMax) : Number.MAX_SAFE_INTEGER;
    return max >= wantedMin && min <= wantedMax;
  }

  private async getStatsOverview() {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
    const [jobsCount, companiesCount, candidatesCount, newJobs7dCount] = await Promise.all([
      this.prisma.jobPost.count({
        where: this.buildPublicJobWhere('all'),
      }),
      this.prisma.company.count({
        where: {
          status: CompanyStatus.ACTIVE,
          jobPosts: { some: this.buildPublicJobWhere('all') },
        },
      }),
      this.prisma.candidateProfile.count(),
      this.prisma.jobPost.count({
        where: {
          ...this.buildPublicJobWhere('all'),
          publishedAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

    return {
      jobsCount,
      companiesCount,
      candidatesCount,
      openJobsCount: jobsCount,
      activeEmployersCount: companiesCount,
      newJobs7dCount,
    };
  }

  private async getMarketInsightSummary(
    lastMonthStart: Date,
    currentMonthStart: Date,
    lastMonthEnd: Date,
  ) {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      newJobsCount,
      activeJobsCount,
      hiringCompaniesCount,
      openJobsCount,
      activeEmployersCount,
      newJobs7dCount,
      newJobs24hCount,
    ] = await Promise.all([
      this.prisma.jobPost.count({
        where: {
          ...this.buildPublicJobWhere('all'),
          publishedAt: {
            gte: lastMonthStart,
            lt: currentMonthStart,
          },
        },
      }),
      this.prisma.jobPost.count({
        where: {
          ...this.buildPublicJobWhere('all'),
          publishedAt: { lte: lastMonthEnd },
          OR: [{ expiredAt: null }, { expiredAt: { gte: lastMonthEnd } }],
        },
      }),
      this.prisma.jobPost
        .findMany({
          where: {
            ...this.buildPublicJobWhere('all'),
            publishedAt: { lte: lastMonthEnd },
            OR: [{ expiredAt: null }, { expiredAt: { gte: lastMonthEnd } }],
          },
          select: {
            companyId: true,
          },
          distinct: ['companyId'],
        })
        .then((rows) => rows.length),
      this.prisma.jobPost.count({ where: this.buildPublicJobWhere('all') }),
      this.prisma.company.count({
        where: {
          status: CompanyStatus.ACTIVE,
          jobPosts: { some: this.buildPublicJobWhere('all') },
        },
      }),
      this.prisma.jobPost.count({
        where: { ...this.buildPublicJobWhere('all'), publishedAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.jobPost.count({
        where: { ...this.buildPublicJobWhere('all'), publishedAt: { gte: oneDayAgo } },
      }),
    ]);

    return {
      month: lastMonthStart.getMonth() + 1,
      year: lastMonthStart.getFullYear(),
      newJobsCount,
      activeJobsCount,
      hiringCompaniesCount,
      openJobsCount,
      activeEmployersCount,
      newJobs7dCount,
      newJobs24hCount,
    };
  }

  private async getJobGrowthLineChart(from: Date, to: Date) {
    const jobs = await this.prisma.jobPost.findMany({
      where: {
        ...this.buildPublicJobWhere('all'),
        publishedAt: { gte: from, lte: to },
      },
      select: { publishedAt: true },
    });
    const points: Array<{ date: string; jobsCount: number }> = [];
    const interval = (to.getTime() - from.getTime()) / 4;

    for (let i = 0; i < 5; i++) {
      const d = new Date(from.getTime() + interval * i);
      const start = new Date(from.getTime() + interval * i);
      const end = i === 4 ? to : new Date(from.getTime() + interval * (i + 1));
      const dayStr = String(d.getDate()).padStart(2, '0');
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dateLabel = `${dayStr}/${monthStr}`;
      points.push({
        date: dateLabel,
        jobsCount: jobs.filter((job) => {
          const publishedAt = job.publishedAt?.getTime() ?? 0;
          return publishedAt >= start.getTime() && publishedAt <= end.getTime();
        }).length,
      });
    }

    const values = points.map((p) => p.jobsCount);
    const firstValue = values[0] ?? 0;
    const lastValue = values[values.length - 1] ?? 0;

    return {
      from: this.toIsoDate(from),
      to: this.toIsoDate(to),
      minValue: values.length > 0 ? Math.min(...values) : 0,
      maxValue: values.length > 0 ? Math.max(...values) : 0,
      growthPercent:
        firstValue > 0 ? Number((((lastValue - firstValue) / firstValue) * 100).toFixed(1)) : 0,
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
        salaryIsVisible: true,
      },
    });

    const counts = new Map<string, number>(SALARY_BUCKETS.map((bucket) => [bucket.key, 0]));

    for (const job of jobs) {
      if (!job.salaryIsVisible) continue;
      const bucket = this.resolveSalaryBucket(job.salaryMin, job.salaryMax, job.salaryIsNegotiable);
      if (bucket) {
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      }
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
        publishedAt: true,
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
        _count: {
          select: {
            views: true,
          },
        },
      },
    });
  }

  private findLatestJobRecords(limit: number) {
    return this.prisma.jobPost.findMany({
      where: this.buildPublicJobWhere('latest'),
      orderBy: [{ publishedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
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

  private async getLatestPosts(limit: number): Promise<HomePostCard[]> {
    const posts = await this.prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
        metaDescription: true,
        createdAt: true,
        thumbnailFile: {
          select: { publicUrl: true },
        },
        coverImageFile: {
          select: { publicUrl: true },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      type: String(post.type),
      thumbnailUrl: post.thumbnailFile?.publicUrl ?? undefined,
      coverImageUrl: post.coverImageFile?.publicUrl ?? undefined,
      metaDescription: post.metaDescription ?? undefined,
      category: post.category
        ? {
            id: post.category.id,
            name: post.category.name,
            slug: post.category.slug,
          }
        : undefined,
      createdAt: post.createdAt.toISOString(),
    }));
  }

  private buildPublicJobWhere(
    tab: HomeJobTab,
    candidateProfileId?: string,
  ): Prisma.JobPostWhereInput {
    const now = new Date();
    const baseWhere: Prisma.JobPostWhereInput = {
      status: JobStatus.PUBLISHED,
      moderationStatus: ModerationStatus.APPROVED,
      deletedAt: null,
      isHidden: false,
      publishedAt: { not: null },
      company: { status: CompanyStatus.ACTIVE },
    };

    if (tab === 'expiring') {
      baseWhere.expiredAt = { gt: now, lte: new Date(now.getTime() + FOURTEEN_DAYS_MS) };
    } else if (tab === 'popular') {
      // Keep the interest feed separate from expiring opportunities. A recent
      // view is a real interaction signal; zero-view jobs are never labelled
      // as being "of interest" merely to fill a homepage slot.
      baseWhere.OR = [
        { expiredAt: null },
        { expiredAt: { gt: new Date(now.getTime() + FOURTEEN_DAYS_MS) } },
      ];
      baseWhere.views = {
        some: { viewedAt: { gte: new Date(now.getTime() - INTEREST_WINDOW_MS) } },
      };
    } else {
      baseWhere.OR = [{ expiredAt: null }, { expiredAt: { gte: now } }];
    }

    if (candidateProfileId) {
      baseWhere.applications = { none: { candidateProfileId } };
    }

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
      return [{ publishedAt: 'desc' }];
    }
    if (tab === 'expiring') {
      return [{ expiredAt: 'asc' }];
    }
    if (tab === 'popular') {
      return [
        { views: { _count: 'desc' } },
        { savedJobs: { _count: 'desc' } },
        { publishedAt: 'desc' },
      ];
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
    const now = Date.now();
    const daysRemaining = job.expiredAt
      ? Math.max(0, Math.ceil((job.expiredAt.getTime() - now) / (24 * 60 * 60 * 1000)))
      : null;
    const badges: Array<'NEW' | 'REMOTE'> = [];
    if (job.publishedAt && now - job.publishedAt.getTime() <= SEVEN_DAYS_MS) badges.push('NEW');
    if (
      job.jobPostLocations.some((item) => item.jobLocation.workingModel === WorkingModel.REMOTE)
    ) {
      badges.push('REMOTE');
    }

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
      viewCount: job._count.views,
      publishedAt: job.publishedAt?.toISOString() ?? null,
      daysRemaining,
      urgencyTone:
        daysRemaining !== null && daysRemaining <= 3
          ? 'URGENT'
          : daysRemaining !== null && daysRemaining <= 7
            ? 'WARNING'
            : 'NORMAL',
      badges,
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
      publishedAt: job.publishedAt?.toISOString() ?? null,
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

  private resolveSalaryBucket(
    min: Prisma.Decimal | null,
    max: Prisma.Decimal | null,
    isNegotiable: boolean,
  ) {
    if (isNegotiable) return null;

    const minValue = min ? Number(min) : null;
    const maxValue = max ? Number(max) : null;
    const anchor = minValue && maxValue ? (minValue + maxValue) / 2 : (minValue ?? maxValue);

    if (!anchor) {
      return null;
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

    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');

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
