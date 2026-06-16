import { Test, TestingModule } from '@nestjs/testing';
import { CvTemplatesController } from './cv-templates.controller';
import { CvTemplatesService } from './cv-templates.service';

describe('CvTemplatesController', () => {
  let controller: CvTemplatesController;
  const cvTemplatesServiceMock = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CvTemplatesController],
      providers: [
        {
          provide: CvTemplatesService,
          useValue: cvTemplatesServiceMock,
        },
      ],
    }).compile();

    controller = module.get<CvTemplatesController>(CvTemplatesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
