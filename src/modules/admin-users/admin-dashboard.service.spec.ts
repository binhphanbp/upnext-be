import { Test, TestingModule } from '@nestjs/testing';
import { CompanyVerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;

  const mockPrismaService = {
    invoice: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    candidateAccount: {
      count: jest.fn(),
    },
    recruiterAccount: {
      count: jest.fn(),
    },
    jobPost: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    company: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrismaService.invoice.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrismaService.invoice.findMany.mockResolvedValue([]);
    mockPrismaService.candidateAccount.count.mockResolvedValue(0);
    mockPrismaService.recruiterAccount.count.mockResolvedValue(0);
    mockPrismaService.jobPost.count.mockResolvedValue(0);
    mockPrismaService.jobPost.findMany.mockResolvedValue([]);
    mockPrismaService.company.count.mockResolvedValue(0);
    mockPrismaService.company.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('counts unverified and pending companies as pending review', async () => {
    mockPrismaService.company.count.mockResolvedValue(4);

    const result = await service.getDashboard({});

    expect(mockPrismaService.company.count).toHaveBeenCalledWith({
      where: {
        verificationStatus: {
          in: [CompanyVerificationStatus.UNVERIFIED, CompanyVerificationStatus.PENDING],
        },
      },
    });
    expect(result.summary.pendingReview.companyRegistrations).toBe(4);
  });
});
