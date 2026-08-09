import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
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
    })
      // Xem giải thích ở cvs.controller.spec.ts — cùng lý do.
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CvVersionsController>(CvVersionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('streams an authorized CV through the API with private response headers', async () => {
    cvVersionsServiceMock.prepareDownload.mockResolvedValue({
      kind: 'stream',
      stream: Readable.from([Buffer.from('%PDF-1.4')]),
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

    expect(response.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="candidate.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    expect(response.redirect).not.toHaveBeenCalled();
  });
});
