import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { EmailService } from '../../common/email/email.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { CompaniesService } from './companies.service';
import { COMPANY_LICENSE_EXTRACTION_PROVIDER } from './ports/company-license-extraction-provider.port';
import { LLM_PROVIDER } from '../ai/ports/llm-provider.port';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: {
    company: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let tx: {
    recruiterPermission: {
      upsert: jest.Mock;
    };
    recruiterRole: {
      upsert: jest.Mock;
    };
    recruiterRolePermission: {
      createMany: jest.Mock;
    };
    companyMember: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    recruiterAccount: {
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    tx = {
      recruiterPermission: {
        upsert: jest.fn(({ where }) => ({ id: `permission-${where.code}` })),
      },
      recruiterRole: {
        upsert: jest.fn().mockResolvedValue({ id: 'owner-role-id' }),
      },
      recruiterRolePermission: {
        createMany: jest.fn().mockResolvedValue({ count: 8 }),
      },
      companyMember: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'member-id' }),
      },
      recruiterAccount: {
        update: jest.fn().mockResolvedValue({ id: 'recruiter-id' }),
      },
    };
    prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'company-id', name: 'Acme', slug: 'acme' }),
      },
      $transaction: jest.fn((callback: (transactionClient: typeof tx) => unknown) => callback(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: CloudinaryService,
          useValue: {
            uploadBuffer: jest.fn(),
            createSignedUrl: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('dummy-key'),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendCompanyPendingReviewToAdmin: jest.fn(),
            sendCompanySubmittedToRecruiter: jest.fn(),
            sendCompanyVerificationResult: jest.fn(),
          },
        },
        {
          provide: ReputationLedgerService,
          useValue: {
            applyDelta: jest.fn(),
          },
        },
        {
          provide: COMPANY_LICENSE_EXTRACTION_PROVIDER,
          useValue: {
            modelName: 'stub',
            isConfigured: () => true,
            extractStructured: jest.fn(),
          },
        },
        {
          provide: LLM_PROVIDER,
          useValue: {
            modelName: 'stub',
            isConfigured: () => true,
            generateStructured: jest.fn(),
            streamText: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('assigns the company creator to an ensured OWNER role', async () => {
    await service.create(
      { name: 'Acme' },
      {
        id: 'recruiter-id',
        email: 'owner@example.com',
        role: ActorType.RECRUITER,
        permissions: [],
      },
    );

    expect(tx.recruiterPermission.upsert).toHaveBeenCalledTimes(8);
    expect(tx.recruiterRole.upsert).toHaveBeenCalledWith({
      where: { code: 'OWNER' },
      update: {
        name: 'Owner',
        description: 'Chu tai khoan - Toan quyen quan ly',
      },
      create: {
        code: 'OWNER',
        name: 'Owner',
        description: 'Chu tai khoan - Toan quyen quan ly',
      },
      select: { id: true },
    });
    expect(tx.recruiterRolePermission.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        {
          recruiterRoleId: 'owner-role-id',
          recruiterPermissionId: 'permission-jobs:manage',
        },
        {
          recruiterRoleId: 'owner-role-id',
          recruiterPermissionId: 'permission-company:manage',
        },
      ]),
      skipDuplicates: true,
    });
    expect(tx.recruiterAccount.update).toHaveBeenCalledWith({
      where: { id: 'recruiter-id' },
      data: {
        companyId: 'company-id',
        recruiterRoleId: 'owner-role-id',
      },
    });
    expect(tx.companyMember.create).toHaveBeenCalledWith({
      data: {
        recruiterAccountId: 'recruiter-id',
        companyId: 'company-id',
        roleId: 'owner-role-id',
        status: 'ACTIVE',
        joinedAt: expect.any(Date),
      },
    });
  });
});
