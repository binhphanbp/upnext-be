import { Test, TestingModule } from '@nestjs/testing';
import { ActorType, JobStatus, ModerationStatus } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CompanyFollowAlertsService } from './company-follow-alerts.service';

describe('CompanyFollowAlertsService', () => {
  let service: CompanyFollowAlertsService;

  const prismaMock: any = {
    jobPost: { findMany: jest.fn(), updateMany: jest.fn() },
    companyFollow: { findMany: jest.fn() },
  };
  const emailMock = { sendFollowedCompanyJobs: jest.fn().mockResolvedValue(undefined) };
  const notificationsMock = { createNotification: jest.fn().mockResolvedValue(undefined) };

  function posting(id: string, title: string, companyId = 'company-1') {
    return {
      id,
      title,
      companyId,
      company: { name: companyId === 'company-1' ? 'Công ty ABC' : 'Công ty XYZ', slug: companyId },
    };
  }

  function follower(id: string, email: string, fullName: string) {
    return { candidateProfile: { account: { id, email, fullName } } };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyFollowAlertsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = module.get(CompanyFollowAlertsService);
    jest.clearAllMocks();
    prismaMock.jobPost.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.companyFollow.findMany.mockResolvedValue([]);
  });

  it('only looks at published, approved, visible postings that were never announced', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue([]);

    await service.announceNewPostingsToFollowers();

    expect(prismaMock.jobPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          followerAlertSentAt: null,
          status: JobStatus.PUBLISHED,
          moderationStatus: ModerationStatus.APPROVED,
          isHidden: false,
        }),
      }),
    );
  });

  it('sends one email per follower covering every posting from that company', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue([
      posting('job-1', 'Backend Developer'),
      posting('job-2', 'Frontend Developer'),
      posting('job-3', 'QA Engineer'),
    ]);
    prismaMock.companyFollow.findMany.mockResolvedValue([
      follower('candidate-1', 'a@test.dev', 'Nguyễn Văn A'),
    ]);

    await service.announceNewPostingsToFollowers();

    // Three postings, one company, one follower — one email, not three.
    expect(emailMock.sendFollowedCompanyJobs).toHaveBeenCalledTimes(1);
    expect(emailMock.sendFollowedCompanyJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@test.dev',
        companyName: 'Công ty ABC',
        jobTitles: ['Backend Developer', 'Frontend Developer', 'QA Engineer'],
      }),
    );
    expect(notificationsMock.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientType: ActorType.CANDIDATE, recipientId: 'candidate-1' }),
    );
  });

  it('keeps one company’s postings out of another company’s digest', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue([
      posting('job-1', 'Backend Developer', 'company-1'),
      posting('job-2', 'Kế toán', 'company-2'),
    ]);
    prismaMock.companyFollow.findMany.mockResolvedValue([
      follower('candidate-1', 'a@test.dev', 'Nguyễn Văn A'),
    ]);

    await service.announceNewPostingsToFollowers();

    const digests = (
      emailMock.sendFollowedCompanyJobs.mock.calls as Array<
        [{ companyName: string; jobTitles: string[] }]
      >
    ).map(([args]) => args);
    expect(digests).toHaveLength(2);
    expect(digests.find((digest) => digest.companyName === 'Công ty ABC')?.jobTitles).toEqual([
      'Backend Developer',
    ]);
    expect(digests.find((digest) => digest.companyName === 'Công ty XYZ')?.jobTitles).toEqual([
      'Kế toán',
    ]);
  });

  it('marks the postings so the next sweep does not send them again', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue([posting('job-1', 'Backend Developer')]);
    prismaMock.companyFollow.findMany.mockResolvedValue([
      follower('candidate-1', 'a@test.dev', 'Nguyễn Văn A'),
    ]);

    await service.announceNewPostingsToFollowers();

    expect(prismaMock.jobPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['job-1'] } } }),
    );
  });

  it('marks postings even when the company has no followers', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue([posting('job-1', 'Backend Developer')]);
    prismaMock.companyFollow.findMany.mockResolvedValue([]);

    await service.announceNewPostingsToFollowers();

    // Holding them back would ambush the next person to follow with week-old news.
    expect(emailMock.sendFollowedCompanyJobs).not.toHaveBeenCalled();
    expect(prismaMock.jobPost.updateMany).toHaveBeenCalled();
  });

  it('leaves postings unmarked when the company fails, so the next sweep retries', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue([posting('job-1', 'Backend Developer')]);
    prismaMock.companyFollow.findMany.mockRejectedValue(new Error('database unavailable'));

    await expect(service.announceNewPostingsToFollowers()).resolves.toBeUndefined();

    expect(prismaMock.jobPost.updateMany).not.toHaveBeenCalled();
  });

  it('summarises the tail instead of listing dozens of titles', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue(
      Array.from({ length: 14 }, (_, index) => posting(`job-${index}`, `Vị trí ${index + 1}`)),
    );
    prismaMock.companyFollow.findMany.mockResolvedValue([
      follower('candidate-1', 'a@test.dev', 'Nguyễn Văn A'),
    ]);

    await service.announceNewPostingsToFollowers();

    const [{ jobTitles }] = emailMock.sendFollowedCompanyJobs.mock.calls[0] as [
      { jobTitles: string[] },
    ];
    expect(jobTitles).toHaveLength(11);
    expect(jobTitles.at(-1)).toBe('và 4 vị trí khác');
  });
});
