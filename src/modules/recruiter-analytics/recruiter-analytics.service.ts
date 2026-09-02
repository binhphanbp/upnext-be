import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, JobStatus, ModerationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RecruiterAnalyticsQueryDto,
  RecruiterAnalyticsWindowDays,
} from './dto/recruiter-analytics-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

// The funnel's INTERVIEWING/OFFERED/HIRED stages are derived from status-log history rather
// than Application.status, because status is the CURRENT state only — an application that
// moved OFFERED -> HIRED would otherwise vanish from the OFFERED stage even though it
// genuinely passed through it. See the plan doc for the full rationale.
const FUNNEL_LOG_STATUSES = [
  ApplicationStatus.INTERVIEWING,
  ApplicationStatus.OFFERED,
  ApplicationStatus.HIRED,
] as const;

type FunnelStageKey = 'VIEWED' | 'APPLIED' | 'INTERVIEWING' | 'OFFERED' | 'HIRED';

type JobScope = {
  id: string;
  title: string;
  status: JobStatus;
  moderationStatus: ModerationStatus;
  publishedAt: Date | null;
  vacanciesCount: number;
};

type StatusLogRow = {
  applicationId: string;
  newStatus: ApplicationStatus;
  changedAt: Date;
  application: { jobPostId: string; submittedAt: Date };
};

@Injectable()
export class RecruiterAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(recruiterId: string, query: RecruiterAnalyticsQueryDto) {
    const windowDays = query.windowDays;
    const to = new Date();
    const from = new Date(to.getTime() - windowDays * DAY_MS);

    const scopedJob = query.jobPostId
      ? await this.assertJobOwnership(query.jobPostId, recruiterId)
      : null;

    const jobPosts = await this.prisma.jobPost.findMany({
      where: {
        createdByRecruiterId: recruiterId,
        deletedAt: null,
        ...(scopedJob ? { id: scopedJob.id } : {}),
      },
      select: {
        id: true,
        title: true,
        status: true,
        moderationStatus: true,
        publishedAt: true,
        vacanciesCount: true,
      },
    });
    const jobPostIds = jobPosts.map((job) => job.id);

    if (jobPostIds.length === 0) {
      return this.buildResponse({
        windowDays,
        from,
        to,
        scopedJob,
        jobPosts: [],
        views: [],
        applications: [],
        statusLogs: [],
        interviewsScheduled: 0,
      });
    }

    const [views, applications, statusLogs, interviewsScheduled] = await Promise.all([
      this.prisma.jobView.findMany({
        where: { jobPostId: { in: jobPostIds }, viewedAt: { gte: from, lte: to } },
        select: { jobPostId: true, viewedAt: true },
      }),
      this.prisma.application.findMany({
        where: { jobPostId: { in: jobPostIds }, submittedAt: { gte: from, lte: to } },
        select: { jobPostId: true, submittedAt: true },
      }),
      this.prisma.applicationStatusLog.findMany({
        where: {
          newStatus: { in: [...FUNNEL_LOG_STATUSES] },
          changedAt: { gte: from, lte: to },
          application: { jobPostId: { in: jobPostIds } },
        },
        select: {
          applicationId: true,
          newStatus: true,
          changedAt: true,
          application: { select: { jobPostId: true, submittedAt: true } },
        },
      }),
      this.prisma.interview.count({
        where: {
          createdAt: { gte: from, lte: to },
          application: { jobPostId: { in: jobPostIds } },
        },
      }),
    ]);

    return this.buildResponse({
      windowDays,
      from,
      to,
      scopedJob,
      jobPosts,
      views,
      applications,
      statusLogs,
      interviewsScheduled,
    });
  }

  private async assertJobOwnership(jobPostId: string, recruiterId: string): Promise<JobScope> {
    const job = await this.prisma.jobPost.findFirst({
      where: { id: jobPostId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        moderationStatus: true,
        publishedAt: true,
        vacanciesCount: true,
        createdByRecruiterId: true,
      },
    });

    if (!job) {
      throw new NotFoundException('Job post not found');
    }
    if (job.createdByRecruiterId !== recruiterId) {
      throw new ForbiddenException('You are not allowed to view analytics for this job post');
    }

    return job;
  }

  /**
   * Keeps, per applicationId, only the earliest in-window occurrence of the given status.
   * INTERVIEWING/OFFERED are not terminal states, so an application can generate more than
   * one log row with the same newStatus within a single window (e.g. re-interviewed after a
   * reschedule) — without this, stage counts wouldn't match the per-job/time-series breakdowns.
   */
  private dedupeEarliestByApplication(
    rows: StatusLogRow[],
    status: ApplicationStatus,
  ): StatusLogRow[] {
    const earliestByApplication = new Map<string, StatusLogRow>();
    for (const row of rows) {
      if (row.newStatus !== status) continue;
      const existing = earliestByApplication.get(row.applicationId);
      if (!existing || row.changedAt.getTime() < existing.changedAt.getTime()) {
        earliestByApplication.set(row.applicationId, row);
      }
    }
    return [...earliestByApplication.values()];
  }

  private median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  private toIsoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private buildResponse(params: {
    windowDays: RecruiterAnalyticsWindowDays;
    from: Date;
    to: Date;
    scopedJob: JobScope | null;
    jobPosts: JobScope[];
    views: Array<{ jobPostId: string; viewedAt: Date }>;
    applications: Array<{ jobPostId: string; submittedAt: Date }>;
    statusLogs: StatusLogRow[];
    interviewsScheduled: number;
  }) {
    const {
      windowDays,
      from,
      to,
      scopedJob,
      jobPosts,
      views,
      applications,
      statusLogs,
      interviewsScheduled,
    } = params;

    const interviewing = this.dedupeEarliestByApplication(
      statusLogs,
      ApplicationStatus.INTERVIEWING,
    );
    const offered = this.dedupeEarliestByApplication(statusLogs, ApplicationStatus.OFFERED);
    const hired = this.dedupeEarliestByApplication(statusLogs, ApplicationStatus.HIRED);

    const timeToHireDaysSamples = hired.map(
      (row) => (row.changedAt.getTime() - row.application.submittedAt.getTime()) / DAY_MS,
    );
    const avgTimeToHire =
      timeToHireDaysSamples.length > 0
        ? timeToHireDaysSamples.reduce((sum, d) => sum + d, 0) / timeToHireDaysSamples.length
        : null;
    const medianTimeToHire = this.median(timeToHireDaysSamples);

    const stageOrder: Array<{ key: FunnelStageKey; count: number }> = [
      { key: 'VIEWED', count: views.length },
      { key: 'APPLIED', count: applications.length },
      { key: 'INTERVIEWING', count: interviewing.length },
      { key: 'OFFERED', count: offered.length },
      { key: 'HIRED', count: hired.length },
    ];
    const firstStageCount = stageOrder[0].count;
    const funnelStages = stageOrder.map((stage, index) => {
      const previousCount = index > 0 ? stageOrder[index - 1].count : null;
      return {
        stage: stage.key,
        count: stage.count,
        conversionFromPrevious:
          index === 0 || !previousCount ? null : round1((stage.count / previousCount) * 100),
        conversionFromFirst:
          index === 0 || !firstStageCount ? null : round1((stage.count / firstStageCount) * 100),
      };
    });

    const timeSeries = this.buildTimeSeries(from, to, views, applications, hired);

    const jobs =
      scopedJob === null
        ? jobPosts.map((job) =>
            this.buildJobRow(job, views, applications, interviewing, offered, hired),
          )
        : null;

    return {
      window: { days: windowDays, from: from.toISOString(), to: to.toISOString() },
      scope: {
        jobPostId: scopedJob?.id ?? null,
        job: scopedJob
          ? {
              id: scopedJob.id,
              title: scopedJob.title,
              status: scopedJob.status,
              moderationStatus: scopedJob.moderationStatus,
              publishedAt: scopedJob.publishedAt?.toISOString() ?? null,
              vacanciesCount: scopedJob.vacanciesCount,
            }
          : null,
      },
      kpis: {
        totalViews: views.length,
        totalApplications: applications.length,
        interviewsScheduled,
        hires: hired.length,
        timeToHireDays: {
          average: avgTimeToHire !== null ? round1(avgTimeToHire) : null,
          median: medianTimeToHire !== null ? round1(medianTimeToHire) : null,
          sampleSize: timeToHireDaysSamples.length,
        },
      },
      funnel: { stages: funnelStages },
      timeSeries: { points: timeSeries },
      jobs,
    };
  }

  private buildTimeSeries(
    from: Date,
    to: Date,
    views: Array<{ jobPostId: string; viewedAt: Date }>,
    applications: Array<{ jobPostId: string; submittedAt: Date }>,
    hired: StatusLogRow[],
  ) {
    const points = new Map<
      string,
      { date: string; views: number; applications: number; hires: number }
    >();
    for (
      let cursor = new Date(from);
      cursor.getTime() <= to.getTime();
      cursor = new Date(cursor.getTime() + DAY_MS)
    ) {
      const date = this.toIsoDate(cursor);
      points.set(date, { date, views: 0, applications: 0, hires: 0 });
    }

    for (const view of views) {
      const point = points.get(this.toIsoDate(view.viewedAt));
      if (point) point.views += 1;
    }
    for (const application of applications) {
      const point = points.get(this.toIsoDate(application.submittedAt));
      if (point) point.applications += 1;
    }
    for (const row of hired) {
      const point = points.get(this.toIsoDate(row.changedAt));
      if (point) point.hires += 1;
    }

    return [...points.values()];
  }

  private buildJobRow(
    job: JobScope,
    views: Array<{ jobPostId: string; viewedAt: Date }>,
    applications: Array<{ jobPostId: string; submittedAt: Date }>,
    interviewing: StatusLogRow[],
    offered: StatusLogRow[],
    hired: StatusLogRow[],
  ) {
    const jobViews = views.filter((v) => v.jobPostId === job.id).length;
    const jobApplications = applications.filter((a) => a.jobPostId === job.id).length;
    const jobInterviewing = interviewing.filter((r) => r.application.jobPostId === job.id).length;
    const jobOffered = offered.filter((r) => r.application.jobPostId === job.id).length;
    const jobHiredRows = hired.filter((r) => r.application.jobPostId === job.id);
    const jobHiredSamples = jobHiredRows.map(
      (row) => (row.changedAt.getTime() - row.application.submittedAt.getTime()) / DAY_MS,
    );
    const avgTimeToHireDays =
      jobHiredSamples.length > 0
        ? round1(jobHiredSamples.reduce((sum, d) => sum + d, 0) / jobHiredSamples.length)
        : null;

    return {
      jobPostId: job.id,
      title: job.title,
      status: job.status,
      publishedAt: job.publishedAt?.toISOString() ?? null,
      views: jobViews,
      applications: jobApplications,
      viewToApplyRate: jobViews > 0 ? round1((jobApplications / jobViews) * 100) : null,
      interviewing: jobInterviewing,
      offered: jobOffered,
      hired: jobHiredRows.length,
      applyToHireRate:
        jobApplications > 0 ? round1((jobHiredRows.length / jobApplications) * 100) : null,
      avgTimeToHireDays,
    };
  }
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
