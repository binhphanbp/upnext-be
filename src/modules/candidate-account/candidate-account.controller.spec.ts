import { Test, TestingModule } from '@nestjs/testing';
import { CandidateAccountController } from './candidate-account.controller';
import { CandidateAccountService } from './candidate-account.service';

describe('CandidateAccountController', () => {
  let controller: CandidateAccountController;
  const candidateAccountServiceMock = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CandidateAccountController],
      providers: [
        {
          provide: CandidateAccountService,
          useValue: candidateAccountServiceMock,
        },
      ],
    }).compile();

    controller = module.get<CandidateAccountController>(CandidateAccountController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
