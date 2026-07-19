import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationAssignmentService } from './application-assignment.service';

describe('ApplicationsController', () => {
  let controller: ApplicationsController;
  const applicationsServiceMock = {
    applyJob: jest.fn(),
    withdrawApplication: jest.fn(),
    findOne: jest.fn(),
    getMyApplications: jest.fn(),
    getJobApplicants: jest.fn(),
    checkAppliedJob: jest.fn(),
    getRecruiterPipeline: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        {
          provide: ApplicationsService,
          useValue: applicationsServiceMock,
        },
        {
          provide: ApplicationAssignmentService,
          useValue: {
            assign: jest.fn(),
            unassign: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the recruiter pipeline with query filters', async () => {
    const response = { stages: [], candidates: [], metrics: {} };
    applicationsServiceMock.getRecruiterPipeline.mockResolvedValue(response);

    await expect(
      controller.getRecruiterPipeline(
        { id: 'recruiter-id' } as never,
        'java',
        'job-post-id',
        'interview',
      ),
    ).resolves.toBe(response);
    expect(applicationsServiceMock.getRecruiterPipeline).toHaveBeenCalledWith('recruiter-id', {
      search: 'java',
      jobPostId: 'job-post-id',
      stageId: 'interview',
    });
  });
});
