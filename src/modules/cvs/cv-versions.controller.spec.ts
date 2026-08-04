import { Test, TestingModule } from '@nestjs/testing';
import { CvVersionsController } from './cv-versions.controller';
import { CvVersionsService } from './cv-versions.service';

describe('CvVersionsController', () => {
  let controller: CvVersionsController;
  const cvVersionsServiceMock = {
    prepareDownload: jest.fn(),
  };

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

  it('redirects an authorized Cloudinary CV without proxying it through the API', async () => {
    cvVersionsServiceMock.prepareDownload.mockResolvedValue({
      kind: 'redirect',
      url: 'https://res.cloudinary.com/upnext/raw/upload/v1/cv.pdf',
      fileName: 'candidate.pdf',
      mimeType: 'application/pdf',
    });
    const response = {
      set: jest.fn(),
      redirect: jest.fn(),
    };

    await controller.download(
      '1c897508-3794-4e28-a8e3-13df85450630',
      response as never,
      {
        id: 'candidate-id',
        actorType: 'CANDIDATE',
      } as never,
    );

    expect(response.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.redirect).toHaveBeenCalledWith(
      302,
      'https://res.cloudinary.com/upnext/raw/upload/v1/cv.pdf',
    );
  });
});
