import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';
import { ApplicationsService } from './applications.service';
import { ConversationLifecycleService } from '../conversations/services/conversation-lifecycle.service';
import { ApplicationTransitionPolicy } from './application-transition.policy';
import { ActorType, ApplicationStatus, JobStatus } from '@prisma/client';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  const enqueue = jest.fn();
  const applyApplicationStatus = jest.fn();
  const prismaMock: any = {
    candidateAccount: {
      findUnique: jest.fn(),
    },
    candidateProfile: {
      findUnique: jest.fn(),
    },
    jobPost: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    cVVersion: {
      findUnique: jest.fn(),
    },
    cV: {
      findFirst: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    interview: {
      count: jest.fn(),
    },
    applicationStatusLog: {
      create: jest.fn(),
    },
    applicationAssignment: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    recruiterAccount: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prismaMock)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: OutboxService,
          useValue: {
            enqueue,
          },
        },
        {
          provide: ConversationLifecycleService,
          useValue: {
            applyApplicationStatus,
          },
        },
        {
          provide: ApplicationTransitionPolicy,
          useValue: {
            assertTransition: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates the candidate-recruiter conversation as soon as an application is submitted', async () => {
    prismaMock.candidateAccount.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
      fullName: 'Candidate',
      profile: { id: 'candidate-profile-id', phoneNumber: '0901234567' },
    });
    prismaMock.jobPost.findUnique.mockResolvedValue({
      id: 'job-post-id',
      title: 'Backend Developer',
      status: JobStatus.PUBLISHED,
      createdByRecruiterId: 'recruiter-id',
    });
    prismaMock.cVVersion.findUnique.mockResolvedValue({
      id: 'cv-version-id',
      cv: { candidateProfileId: 'candidate-profile-id' },
    });
    prismaMock.application.findUnique.mockResolvedValue(null);
    prismaMock.application.create.mockResolvedValue({
      id: 'application-id',
      status: ApplicationStatus.SUBMITTED,
    });

    await service.applyJob('candidate-id', {
      jobPostId: 'job-post-id',
      cvVersionId: 'cv-version-id',
    });

    expect(applyApplicationStatus).toHaveBeenCalledWith(
      prismaMock,
      'application-id',
      ApplicationStatus.SUBMITTED,
      {
        type: ActorType.CANDIDATE,
        id: 'candidate-id',
      },
    );
  });

  it('rejects applying to a job post whose deadline has already passed', async () => {
    prismaMock.candidateAccount.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
      fullName: 'Candidate',
      profile: { id: 'candidate-profile-id', phoneNumber: '0901234567' },
    });
    prismaMock.jobPost.findUnique.mockResolvedValue({
      id: 'job-post-id',
      title: 'Backend Developer',
      status: JobStatus.PUBLISHED,
      createdByRecruiterId: 'recruiter-id',
      expiredAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    await expect(
      service.applyJob('candidate-id', {
        jobPostId: 'job-post-id',
        cvVersionId: 'cv-version-id',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an application when the candidate has no valid contact number', async () => {
    prismaMock.candidateAccount.findUnique.mockResolvedValue({
      emailVerifiedAt: new Date(),
      fullName: 'Candidate',
      profile: { id: 'candidate-profile-id', phoneNumber: '0' },
    });

    await expect(
      service.applyJob('candidate-id', {
        jobPostId: 'job-post-id',
        cvVersionId: 'cv-version-id',
      }),
    ).rejects.toThrow('Vui lòng cập nhật số điện thoại liên hệ hợp lệ trước khi nộp hồ sơ');
  });

  describe('ensureRecruiterInvitedApplication', () => {
    const actor = { type: ActorType.RECRUITER, id: 'recruiter-account-id' };

    it('reuses the application when the candidate already applied', async () => {
      prismaMock.application.findUnique.mockResolvedValue({
        id: 'application-id',
        status: ApplicationStatus.SUBMITTED,
        source: 'CANDIDATE_APPLIED',
      });

      const result = await service.ensureRecruiterInvitedApplication({
        jobPostId: 'job-post-id',
        candidateProfileId: 'candidate-profile-id',
        actor,
      });

      expect(result.created).toBe(false);
      expect(prismaMock.application.create).not.toHaveBeenCalled();
    });

    it('marks a created row as recruiter-invited so funnels do not count it as inbound', async () => {
      prismaMock.application.findUnique.mockResolvedValue(null);
      prismaMock.cV.findFirst.mockResolvedValue({ versions: [{ id: 'cv-version-id' }] });
      prismaMock.application.create.mockResolvedValue({ id: 'application-id' });

      const result = await service.ensureRecruiterInvitedApplication({
        jobPostId: 'job-post-id',
        candidateProfileId: 'candidate-profile-id',
        actor,
      });

      expect(result.created).toBe(true);
      expect(prismaMock.application.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'RECRUITER_INVITED',
            cvVersionId: 'cv-version-id',
          }),
        }),
      );
    });

    it('refuses to invite a candidate who has no CV at all', async () => {
      prismaMock.application.findUnique.mockResolvedValue(null);
      prismaMock.cV.findFirst.mockResolvedValue(null);

      // An application must reference a CV version, so there is nothing to attach.
      await expect(
        service.ensureRecruiterInvitedApplication({
          jobPostId: 'job-post-id',
          candidateProfileId: 'candidate-profile-id',
          actor,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.application.create).not.toHaveBeenCalled();
    });
  });

  describe('re-applying after a withdrawal', () => {
    function arrangeApplicant() {
      prismaMock.candidateAccount.findUnique.mockResolvedValue({
        emailVerifiedAt: new Date(),
        fullName: 'Candidate',
        profile: { id: 'candidate-profile-id', phoneNumber: '0901234567' },
      });
      prismaMock.jobPost.findUnique.mockResolvedValue({
        id: 'job-post-id',
        title: 'Backend Developer',
        status: JobStatus.PUBLISHED,
        createdByRecruiterId: 'recruiter-id',
      });
      prismaMock.cVVersion.findUnique.mockResolvedValue({
        id: 'cv-version-id',
        cv: { candidateProfileId: 'candidate-profile-id' },
      });
    }

    it('revives the withdrawn application instead of inserting a second row', async () => {
      arrangeApplicant();
      prismaMock.application.findUnique.mockResolvedValue({
        id: 'application-id',
        status: ApplicationStatus.WITHDRAWN,
      });
      prismaMock.applicationAssignment.findFirst.mockResolvedValue({ id: 'assignment-id' });
      prismaMock.application.update.mockResolvedValue({
        id: 'application-id',
        status: ApplicationStatus.SUBMITTED,
        version: 2,
      });

      await service.applyJob('candidate-id', {
        jobPostId: 'job-post-id',
        cvVersionId: 'cv-version-id',
      });

      // (candidateProfileId, jobPostId) is unique, so a create here would always fail.
      expect(prismaMock.application.create).not.toHaveBeenCalled();
      expect(prismaMock.application.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'application-id' },
          data: expect.objectContaining({ status: ApplicationStatus.SUBMITTED }),
        }),
      );
      // The withdrawn row still holds its assignment; a duplicate must not be added.
      expect(prismaMock.applicationAssignment.create).not.toHaveBeenCalled();
    });

    it('still notifies the recruiter about the re-application', async () => {
      arrangeApplicant();
      prismaMock.application.findUnique.mockResolvedValue({
        id: 'application-id',
        status: ApplicationStatus.WITHDRAWN,
      });
      prismaMock.applicationAssignment.findFirst.mockResolvedValue(null);
      prismaMock.application.update.mockResolvedValue({
        id: 'application-id',
        status: ApplicationStatus.SUBMITTED,
        version: 2,
      });

      await service.applyJob('candidate-id', {
        jobPostId: 'job-post-id',
        cvVersionId: 'cv-version-id',
      });

      // Reusing the first submission's dedupe key would swallow this notification.
      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          dedupeKey: 'application:application-id:resubmitted:v2:recruiter:recruiter-id',
        }),
        prismaMock,
      );
    });

    it('still rejects a duplicate when the existing application is active', async () => {
      arrangeApplicant();
      prismaMock.application.findUnique.mockResolvedValue({
        id: 'application-id',
        status: ApplicationStatus.SUBMITTED,
      });

      await expect(
        service.applyJob('candidate-id', {
          jobPostId: 'job-post-id',
          cvVersionId: 'cv-version-id',
        }),
      ).rejects.toThrow('You have already applied to this job');
    });
  });

  describe('checkAppliedJob', () => {
    beforeEach(() => {
      prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'candidate-profile-id' });
    });

    it('does not report a withdrawn application as applied', async () => {
      prismaMock.application.findUnique.mockResolvedValue({
        id: 'application-id',
        status: ApplicationStatus.WITHDRAWN,
      });

      await expect(service.checkAppliedJob('job-post-id', 'candidate-id')).resolves.toEqual({
        applied: false,
      });
    });

    it('reports an active application as applied', async () => {
      prismaMock.application.findUnique.mockResolvedValue({
        id: 'application-id',
        status: ApplicationStatus.SUBMITTED,
      });

      await expect(service.checkAppliedJob('job-post-id', 'candidate-id')).resolves.toEqual({
        applied: true,
        applicationId: 'application-id',
        status: ApplicationStatus.SUBMITTED,
      });
    });
  });

  describe('quyền truy cập theo từng tin tuyển dụng', () => {
    const revocationFilter = {
      OR: [
        { createdByRecruiterId: 'recruiter-id' },
        { accessRevocations: { none: { recruiterAccountId: 'recruiter-id' } } },
      ],
    };

    beforeEach(() => {
      prismaMock.recruiterAccount.findUnique.mockResolvedValue({
        id: 'recruiter-id',
        companyId: 'company-id',
      });
    });

    it('lọc hồ sơ theo tin mà recruiter còn quyền xem', async () => {
      prismaMock.application.findMany.mockResolvedValue([]);

      await service.getCompanyApplications('recruiter-id');

      const where = prismaMock.application.findMany.mock.calls.at(-1)[0].where;
      expect(where.jobPost).toMatchObject({
        companyId: 'company-id',
        deletedAt: null,
        ...revocationFilter,
      });
    });

    it('chặn xem danh sách ứng viên của tin đã bị thu hồi quyền', async () => {
      prismaMock.jobPost.findUnique.mockResolvedValue({
        id: 'job-post-id',
        companyId: 'company-id',
      });
      // Không tìm thấy tin nào khớp bộ lọc quyền => đã bị thu hồi.
      prismaMock.jobPost.findFirst.mockResolvedValue(null);

      await expect(service.getJobApplicants('job-post-id', 'recruiter-id')).rejects.toThrow(
        'Bạn không có quyền truy cập tin tuyển dụng này.',
      );
    });

    it('vẫn cho xem khi recruiter chưa bị thu hồi quyền', async () => {
      prismaMock.jobPost.findUnique.mockResolvedValue({
        id: 'job-post-id',
        companyId: 'company-id',
      });
      prismaMock.jobPost.findFirst.mockResolvedValue({ id: 'job-post-id' });
      prismaMock.application.findMany.mockResolvedValue([]);

      await expect(service.getJobApplicants('job-post-id', 'recruiter-id')).resolves.toBeDefined();
      expect(prismaMock.jobPost.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-post-id', ...revocationFilter },
        select: { id: true },
      });
    });
  });
});
