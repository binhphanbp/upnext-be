import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { EmailService } from '../../common/email/email.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { AuthService } from '../auth/auth.service';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { COMPANY_LICENSE_EXTRACTION_PROVIDER } from './ports/company-license-extraction-provider.port';
import { LLM_PROVIDER } from '../ai/ports/llm-provider.port';

describe('CompaniesController', () => {
  let controller: CompaniesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [
        CompaniesService,
        {
          provide: PrismaService,
          useValue: {},
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
    })
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CompaniesController>(CompaniesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('scan-license throttling', () => {
    // Quét giấy phép gọi Gemini thật, và cả hai route chỉ cần JWT hợp lệ --
    // không quota/feature key nào chặn. Không có @Throttle() + UserThrottlerGuard
    // thì một tài khoản recruiter có thể gọi model vô hạn lần, tốn tiền thật
    // không kiểm soát.
    it('giới hạn scanBusinessLicense theo người dùng, không phải chỉ theo IP', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- chỉ đọc metadata, không gọi
      const handler = CompaniesController.prototype.scanBusinessLicense;
      const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', handler);
      const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', handler);
      expect(limit).toBe(10);
      expect(ttl).toBe(600_000);
    });

    it('giới hạn scanBusinessLicensePreview -- route trước khi có công ty, vẫn cần JWT', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- chỉ đọc metadata, không gọi
      const handler = CompaniesController.prototype.scanBusinessLicensePreview;
      const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', handler);
      const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', handler);
      expect(limit).toBe(10);
      expect(ttl).toBe(600_000);
    });
  });
});
