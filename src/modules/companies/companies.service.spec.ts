import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { EmailService } from '../../common/email/email.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { AuthService } from '../auth/auth.service';
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
    fileAsset: {
      count: jest.Mock;
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
    company: {
      update: jest.Mock;
    };
    companyVerificationReview: {
      create: jest.Mock;
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
      company: {
        update: jest.fn().mockResolvedValue({ id: 'company-id' }),
      },
      companyVerificationReview: {
        create: jest.fn().mockResolvedValue({ id: 'review-id', evidences: [] }),
      },
    };
    prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'company-id', name: 'Acme', slug: 'acme' }),
      },
      fileAsset: {
        count: jest.fn().mockResolvedValue(0),
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
          provide: AuthService,
          useValue: {
            signRecruiterMagicLinkToken: jest.fn().mockResolvedValue('magic-token'),
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
  describe('verifyCompany', () => {
    const admin = {
      id: 'admin-id',
      email: 'admin@upnext.works',
      role: ActorType.ADMIN,
      permissions: ['companies:verify'],
    };

    function arrangePendingCompany() {
      prisma.company.findUnique.mockResolvedValue({
        id: 'company-id',
        name: 'Acme',
        verificationStatus: 'PENDING',
        lockedReason: 'BLACKLISTED_FRAUD',
      });
    }

    it('refuses a rejection with no reason', async () => {
      arrangePendingCompany();

      // Lý do đi thẳng vào email cho nhà tuyển dụng — từ chối mà không nói vì sao thì
      // họ không biết phải sửa gì.
      await expect(
        service.verifyCompany('company-id', { status: 'REJECTED', reason: '   ' }, admin),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a decision that repeats the current status', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'company-id',
        name: 'Acme',
        verificationStatus: 'REJECTED',
      });

      // Nếu không chặn, mỗi lần bấm lại là trừ thêm 5 điểm uy tín.
      await expect(
        service.verifyCompany(
          'company-id',
          { status: 'REJECTED', reason: 'Giấy phép không hợp lệ' },
          admin,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses an evidence id that points at no file', async () => {
      arrangePendingCompany();
      prisma.fileAsset.count.mockResolvedValue(1);

      await expect(
        service.verifyCompany(
          'company-id',
          {
            status: 'REJECTED',
            reason: 'Giấy phép không hợp lệ',
            evidenceFileIds: ['real-file', 'ghost-file'],
          },
          admin,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('records the rejection with its evidence in order and leaves lockedReason alone', async () => {
      arrangePendingCompany();
      prisma.fileAsset.count.mockResolvedValue(2);

      await service.verifyCompany(
        'company-id',
        {
          status: 'REJECTED',
          reason: 'Ảnh tải lên không phải giấy chứng nhận đăng ký doanh nghiệp',
          guidance: 'Vui lòng tải lại bản scan rõ nét.',
          // Cùng một file gửi hai lần sẽ vi phạm unique (review, file).
          evidenceFileIds: ['file-a', 'file-b', 'file-a'],
        },
        admin,
      );

      expect(tx.companyVerificationReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-id',
            reviewedByAdminId: 'admin-id',
            decision: 'REJECTED',
            guidance: 'Vui lòng tải lại bản scan rõ nét.',
            evidences: {
              create: [
                { fileId: 'file-a', position: 0 },
                { fileId: 'file-b', position: 1 },
              ],
            },
          }),
        }),
      );
      // `lockedReason` thuộc việc khoá công ty (BLACKLISTED_FRAUD), không phải việc
      // từ chối xác thực — ghi đè vào đây sẽ xoá mất lý do khoá thật.
      expect(tx.company.update).toHaveBeenCalledWith({
        where: { id: 'company-id' },
        data: { verificationStatus: 'REJECTED' },
      });
    });

    it('does not carry evidence over to an approval', async () => {
      arrangePendingCompany();

      await service.verifyCompany(
        'company-id',
        { status: 'VERIFIED', evidenceFileIds: ['file-a'] },
        admin,
      );

      expect(prisma.fileAsset.count).not.toHaveBeenCalled();
      expect(tx.companyVerificationReview.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ decision: 'VERIFIED', evidences: { create: [] } }),
        }),
      );
    });
  });
});
