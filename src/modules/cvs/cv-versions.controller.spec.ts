import { Test, TestingModule } from '@nestjs/testing';
import { CvVersionsController } from './cv-versions.controller';
import { CvVersionsService } from './cv-versions.service';

describe('CvVersionsController', () => {
  let controller: CvVersionsController;
  const cvVersionsServiceMock = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CvVersionsController],
      providers: [
        {
          provide: CvVersionsService,
          useValue: cvVersionsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<CvVersionsController>(CvVersionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
