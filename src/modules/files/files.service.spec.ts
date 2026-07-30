import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType, FilePurpose, FileVisibility } from '@prisma/client';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from './files.service';

describe('FilesService', () => {
  let service: FilesService;
  const prismaMock = {
    fileAsset: {
      create: jest.fn(),
    },
  };
  const cloudinaryMock = {
    uploadBuffer: jest.fn(),
  };
  const candidate: AuthenticatedUser = {
    id: 'candidate-id',
    email: 'candidate@upnext.dev',
    role: ActorType.CANDIDATE,
    permissions: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CloudinaryService, useValue: cloudinaryMock },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  it('lưu PDF dưới dạng raw/upload để có thể tải lại nguyên vẹn', async () => {
    const file = {
      buffer: Buffer.from('%PDF-1.7 test'),
      mimetype: 'application/pdf',
      originalname: 'candidate.pdf',
      size: 13,
    };
    cloudinaryMock.uploadBuffer.mockResolvedValue({
      storageKey: 'upnext/cv/cv-file-id',
      publicUrl: 'https://cdn.example.com/candidate.pdf',
    });
    prismaMock.fileAsset.create.mockResolvedValue({
      id: 'file-id',
      sizeBytes: BigInt(file.size),
    });

    await service.upload(
      file,
      { purpose: FilePurpose.CV, visibility: FileVisibility.PRIVATE },
      candidate,
    );

    expect(cloudinaryMock.uploadBuffer).toHaveBeenCalledWith(file, {
      folder: 'cv',
      fileNamePrefix: 'cv',
      resourceType: 'raw',
      deliveryType: 'upload',
    });
  });

  it('từ chối file mang MIME PDF nhưng chứa nội dung HTML', async () => {
    const file = {
      buffer: Buffer.from('<!DOCTYPE html><html></html>'),
      mimetype: 'application/pdf',
      originalname: 'candidate.pdf',
      size: 28,
    };

    await expect(
      service.upload(
        file,
        { purpose: FilePurpose.CV, visibility: FileVisibility.PRIVATE },
        candidate,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(cloudinaryMock.uploadBuffer).not.toHaveBeenCalled();
  });
});
