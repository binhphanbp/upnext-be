import { Test, TestingModule } from '@nestjs/testing';
import { CvsController } from './cvs.controller';
import { CvsService } from './cvs.service';

describe('CvsController', () => {
  let controller: CvsController;
  const cvsServiceMock = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CvsController],
      providers: [
        {
          provide: CvsService,
          useValue: cvsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<CvsController>(CvsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
