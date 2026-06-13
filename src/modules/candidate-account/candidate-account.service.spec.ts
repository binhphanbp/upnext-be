import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateAccountService } from './candidate-account.service';

describe('CandidateAccountService', () => {
  let service: CandidateAccountService;
  const prismaMock = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateAccountService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<CandidateAccountService>(CandidateAccountService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
