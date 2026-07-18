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
});
