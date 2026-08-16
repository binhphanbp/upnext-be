import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { EmailService } from '../../common/email/email.service';
import { ReputationLedgerService } from '../reputation/reputation-ledger.service';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { COMPANY_LICENSE_EXTRACTION_PROVIDER } from './ports/company-license-extraction-provider.port';

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
          provide: COMPANY_LICENSE_EXTRACTION_PROVIDER,
          useValue: {
            modelName: 'stub',
            isConfigured: () => true,
            extractStructured: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CompaniesController>(CompaniesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
