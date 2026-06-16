import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationsService } from './applications.service';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  const prismaMock: any = {
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
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
