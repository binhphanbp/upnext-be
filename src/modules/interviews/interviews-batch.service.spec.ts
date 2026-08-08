import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType, InterviewStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import { ConversationLifecycleService } from '../conversations/services/conversation-lifecycle.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BatchSchedulingMode } from './dto/create-batch-interviews.dto';
import { InterviewsService } from './interviews.service';

/** Covers `createBatch` only; the single-interview path is exercised through it. */
describe('InterviewsService.createBatch', () => {
  let service: InterviewsService;

  const ensureRecruiterInvitedApplication = jest.fn();
  const prismaMock: any = {
    application: { findUnique: jest.fn() },
    recruiterProfile: { findUnique: jest.fn() },
    interview: { findFirst: jest.fn(), create: jest.fn() },
    interviewLog: { create: jest.fn() },
    jobPost: { findFirst: jest.fn() },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prismaMock)),
  };

  const recruiter: AuthenticatedUser = {
    id: 'recruiter-account-id',
    email: 'recruiter@test.dev',
    role: ActorType.RECRUITER,
    companyId: 'company-id',
    permissions: ['interviews:manage'],
  };

  const baseDto = {
    jobPostId: 'job-post-id',
    candidateProfileIds: ['candidate-1', 'candidate-2', 'candidate-3'],
    startAt: '2026-09-01T02:00:00.000Z',
    durationMinutes: 30,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificationsService, useValue: { createNotification: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: ConversationLifecycleService,
          useValue: { ensureApplicationConversation: jest.fn() },
        },
        { provide: ApplicationsService, useValue: { ensureRecruiterInvitedApplication } },
      ],
    }).compile();

    service = module.get(InterviewsService);
    jest.clearAllMocks();

    ensureRecruiterInvitedApplication.mockImplementation(({ candidateProfileId }: any) =>
      Promise.resolve({ application: { id: `application-${candidateProfileId}` }, created: true }),
    );
    prismaMock.application.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({
        id: where.id,
        jobPostId: 'job-post-id',
        jobPost: { companyId: 'company-id', title: 'Backend Developer' },
        assignments: [],
        candidateProfile: { candidateAccountId: 'candidate-account-id' },
      }),
    );
    prismaMock.jobPost.findFirst.mockResolvedValue({ id: 'job-post-id' });
    prismaMock.recruiterProfile.findUnique.mockResolvedValue({ id: 'recruiter-profile-id' });
    prismaMock.interview.findFirst.mockResolvedValue(null);
    prismaMock.interview.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `interview-${data.applicationId}`, ...data }),
    );
  });

  it('lays the slots back to back, honouring the gap', async () => {
    const result = await service.createBatch(
      { ...baseDto, gapMinutes: 10, mode: BatchSchedulingMode.SEQUENTIAL },
      recruiter,
    );

    // 30 minutes plus a 10 minute gap means each candidate starts 40 minutes after the last.
    expect(result.results.map((entry) => entry.scheduledStartAt?.toISOString())).toEqual([
      '2026-09-01T02:00:00.000Z',
      '2026-09-01T02:40:00.000Z',
      '2026-09-01T03:20:00.000Z',
    ]);
    expect(result.summary).toEqual({ requested: 3, scheduled: 3, failed: 0 });
  });

  it('puts everyone in the same slot for a parallel panel', async () => {
    const result = await service.createBatch(
      { ...baseDto, mode: BatchSchedulingMode.SAME_SLOT },
      recruiter,
    );

    const starts = result.results.map((entry) => entry.scheduledStartAt?.toISOString());
    expect(new Set(starts).size).toBe(1);
    expect(starts[0]).toBe('2026-09-01T02:00:00.000Z');
  });

  it('keeps the slots it could book when one candidate fails', async () => {
    ensureRecruiterInvitedApplication.mockImplementation(({ candidateProfileId }: any) => {
      if (candidateProfileId === 'candidate-2') {
        return Promise.reject(new BadRequestException('Ứng viên chưa có CV nào'));
      }
      return Promise.resolve({
        application: { id: `application-${candidateProfileId}` },
        created: false,
      });
    });

    const result = await service.createBatch(baseDto, recruiter);

    // Losing everybody's slot because one CV is missing would be the wrong trade.
    expect(result.summary).toEqual({ requested: 3, scheduled: 2, failed: 1 });
    expect(result.results[1]).toEqual(
      expect.objectContaining({ candidateProfileId: 'candidate-2', scheduled: false }),
    );
    expect(result.results[1]?.error).toContain('CV');
    expect(result.results[2]?.scheduled).toBe(true);
  });

  it('collapses a candidate listed twice into one slot', async () => {
    const result = await service.createBatch(
      { ...baseDto, candidateProfileIds: ['candidate-1', 'candidate-1', 'candidate-2'] },
      recruiter,
    );

    // The second copy would otherwise trip the duplicate-round check and read as an error.
    expect(result.summary).toEqual({ requested: 2, scheduled: 2, failed: 0 });
  });

  it('schedules each interview against its own application', async () => {
    await service.createBatch(baseDto, recruiter);

    expect(prismaMock.interview.create).toHaveBeenCalledTimes(3);
    const applicationIds = (
      prismaMock.interview.create.mock.calls as Array<[{ data: { applicationId: string } }]>
    ).map(([args]) => args.data.applicationId);
    expect(new Set(applicationIds).size).toBe(3);
    expect(prismaMock.interview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: InterviewStatus.SCHEDULED }),
      }),
    );
  });

  it('reports which candidates needed an invited application', async () => {
    ensureRecruiterInvitedApplication.mockImplementation(({ candidateProfileId }: any) =>
      Promise.resolve({
        application: { id: `application-${candidateProfileId}` },
        created: candidateProfileId === 'candidate-3',
      }),
    );

    const result = await service.createBatch(baseDto, recruiter);

    expect(result.results.map((entry) => entry.invitedApplicationCreated)).toEqual([
      false,
      false,
      true,
    ]);
  });
});
