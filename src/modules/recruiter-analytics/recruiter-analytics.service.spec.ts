import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationStatus, JobStatus, ModerationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecruiterAnalyticsService } from './recruiter-analytics.service';

describe('RecruiterAnalyticsService', () => {
  let service: RecruiterAnalyticsService;
  const recruiterId = 'recruiter-1';
  const otherRecruiterId = 'recruiter-2';
  const jobPostId = 'job-1';

  const baseJob = {
    id: jobPostId,
    title: 'Backend Engineer',
    status: JobStatus.PUBLISHED,
    moderationStatus: ModerationStatus.APPROVED,
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    vacanciesCount: 2,
    createdByRecruiterId: recruiterId,
  };

  const prismaMock: any = {
    jobPost: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    jobView: {
      findMany: jest.fn(),
    },
    application: {
      findMany: jest.fn(),
    },
    applicationStatusLog: {
      findMany: jest.fn(),
    },
    interview: {
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.jobPost.findMany.mockResolvedValue([baseJob]);
    prismaMock.jobPost.findFirst.mockResolvedValue(baseJob);
    prismaMock.jobView.findMany.mockResolvedValue([]);
    prismaMock.application.findMany.mockResolvedValue([]);
    prismaMock.applicationStatusLog.findMany.mockResolvedValue([]);
    prismaMock.interview.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RecruiterAnalyticsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(RecruiterAnalyticsService);
  });

  it('returns an all-zero response with no throw when the recruiter has no job posts', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue([]);

    const result = await service.getAnalytics(recruiterId, { windowDays: 30 });

    expect(result.kpis.totalViews).toBe(0);
    expect(result.kpis.totalApplications).toBe(0);
    expect(result.kpis.timeToHireDays).toEqual({ average: null, median: null, sampleSize: 0 });
    expect(result.funnel.stages.every((stage) => stage.count === 0)).toBe(true);
    expect(result.jobs).toEqual([]);
  });

  it('counts a stage even when the application has since moved past it (OFFERED -> HIRED)', async () => {
    const now = new Date();
    const submittedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const application = { jobPostId, submittedAt };

    prismaMock.applicationStatusLog.findMany.mockResolvedValue([
      {
        applicationId: 'app-1',
        newStatus: ApplicationStatus.OFFERED,
        changedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        application,
      },
      {
        applicationId: 'app-1',
        newStatus: ApplicationStatus.HIRED,
        changedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        application,
      },
    ]);

    const result = await service.getAnalytics(recruiterId, { windowDays: 30 });

    const offeredStage = result.funnel.stages.find((stage) => stage.stage === 'OFFERED');
    const hiredStage = result.funnel.stages.find((stage) => stage.stage === 'HIRED');
    expect(offeredStage?.count).toBe(1);
    expect(hiredStage?.count).toBe(1);
  });

  it('dedupes multiple log rows for the same application within one stage', async () => {
    const now = new Date();
    const submittedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const application = { jobPostId, submittedAt };

    // Same application interviewed twice within the window (e.g. re-interviewed after a
    // reschedule/reject-then-reopen) — must still count once toward the funnel stage.
    prismaMock.applicationStatusLog.findMany.mockResolvedValue([
      {
        applicationId: 'app-1',
        newStatus: ApplicationStatus.INTERVIEWING,
        changedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
        application,
      },
      {
        applicationId: 'app-1',
        newStatus: ApplicationStatus.INTERVIEWING,
        changedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        application,
      },
    ]);

    const result = await service.getAnalytics(recruiterId, { windowDays: 30 });

    const interviewingStage = result.funnel.stages.find((stage) => stage.stage === 'INTERVIEWING');
    expect(interviewingStage?.count).toBe(1);
    expect(result.jobs?.[0]?.interviewing).toBe(1);
  });

  it('computes average and median time-to-hire in days, rounding to 1 decimal', async () => {
    const now = new Date();
    const submittedAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

    prismaMock.applicationStatusLog.findMany.mockResolvedValue([
      {
        applicationId: 'app-1',
        newStatus: ApplicationStatus.HIRED,
        changedAt: new Date(submittedAt.getTime() + 5 * 24 * 60 * 60 * 1000),
        application: { jobPostId, submittedAt },
      },
      {
        applicationId: 'app-2',
        newStatus: ApplicationStatus.HIRED,
        changedAt: new Date(submittedAt.getTime() + 15 * 24 * 60 * 60 * 1000),
        application: { jobPostId, submittedAt },
      },
    ]);

    const result = await service.getAnalytics(recruiterId, { windowDays: 30 });

    expect(result.kpis.timeToHireDays).toEqual({ average: 10, median: 10, sampleSize: 2 });
  });

  it('picks the middle value for an odd-sized time-to-hire sample (not the mean)', async () => {
    const now = new Date();
    const submittedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const daysToHire = [5, 15, 25];

    prismaMock.applicationStatusLog.findMany.mockResolvedValue(
      daysToHire.map((days, index) => ({
        applicationId: `app-${index}`,
        newStatus: ApplicationStatus.HIRED,
        changedAt: new Date(submittedAt.getTime() + days * 24 * 60 * 60 * 1000),
        application: { jobPostId, submittedAt },
      })),
    );

    const result = await service.getAnalytics(recruiterId, { windowDays: 90 });

    expect(result.kpis.timeToHireDays.median).toBe(15);
    expect(result.kpis.timeToHireDays.average).toBe(15);
  });

  it('reports null time-to-hire and sampleSize 0 when nobody was hired in the window', async () => {
    const result = await service.getAnalytics(recruiterId, { windowDays: 7 });

    expect(result.kpis.timeToHireDays).toEqual({ average: null, median: null, sampleSize: 0 });
  });

  it('throws ForbiddenException when jobPostId belongs to a different recruiter', async () => {
    prismaMock.jobPost.findFirst.mockResolvedValue({
      ...baseJob,
      createdByRecruiterId: otherRecruiterId,
    });

    await expect(
      service.getAnalytics(recruiterId, { windowDays: 30, jobPostId }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when jobPostId does not exist or was soft-deleted', async () => {
    prismaMock.jobPost.findFirst.mockResolvedValue(null);

    await expect(
      service.getAnalytics(recruiterId, { windowDays: 30, jobPostId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('omits the per-job table and populates scope.job when scoped to a single job', async () => {
    const result = await service.getAnalytics(recruiterId, { windowDays: 30, jobPostId });

    expect(result.jobs).toBeNull();
    expect(result.scope.job?.id).toBe(jobPostId);
  });

  it('returns null conversion rates instead of dividing by zero when a previous stage is empty', async () => {
    const result = await service.getAnalytics(recruiterId, { windowDays: 30 });

    // No views, no applications seeded by default -> every conversion rate must be null.
    for (const stage of result.funnel.stages) {
      if (stage.stage !== 'VIEWED') {
        expect(stage.conversionFromPrevious).toBeNull();
        expect(stage.conversionFromFirst).toBeNull();
      }
    }
  });
});
