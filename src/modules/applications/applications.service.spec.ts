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
    },
    cVVersion: {
      findUnique: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    applicationStatusLog: {
      create: jest.fn(),
    },
    applicationAssignment: {
      create: jest.fn(),
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
      profile: { id: 'candidate-profile-id' },
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
});
