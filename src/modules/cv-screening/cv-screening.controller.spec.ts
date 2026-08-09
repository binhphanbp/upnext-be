import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';
import { CvVersionsService } from '../cvs/cv-versions.service';
import { CvScreeningController } from './cv-screening.controller';
import { CvScreeningService } from './cv-screening.service';

describe('CvScreeningController', () => {
  let controller: CvScreeningController;
  const cvScreeningServiceMock = {
    getAuthorizedApplicationCvVersionId: jest.fn(),
  };
  const cvVersionsServiceMock = {
    prepareDownload: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CvScreeningController],
      providers: [
        { provide: CvScreeningService, useValue: cvScreeningServiceMock },
        { provide: CvVersionsService, useValue: cvVersionsServiceMock },
      ],
    }).compile();

    controller = module.get<CvScreeningController>(CvScreeningController);
  });

  it('streams an authorized application CV with private response headers', async () => {
    cvScreeningServiceMock.getAuthorizedApplicationCvVersionId.mockResolvedValue('cv-version-id');
    cvVersionsServiceMock.prepareDownload.mockResolvedValue({
      kind: 'stream',
      stream: Readable.from([Buffer.from('%PDF-1.4')]),
      fileName: 'candidate.pdf',
      mimeType: 'application/pdf',
    });
    const response = { set: jest.fn() };
    const user = { id: 'recruiter-id' } as never;

    const result = await controller.getApplicationCv(user, 'application-id', response as never);

    expect(cvScreeningServiceMock.getAuthorizedApplicationCvVersionId).toHaveBeenCalledWith(
      'recruiter-id',
      'application-id',
    );
    expect(cvVersionsServiceMock.prepareDownload).toHaveBeenCalledWith('cv-version-id', user);
    expect(response.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="candidate.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    expect(result).toBeDefined();
  });
});
