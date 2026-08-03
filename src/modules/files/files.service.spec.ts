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
    deleteAsset: jest.fn(),
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

  it('chấp nhận PDF hợp lệ có phần mở đầu trước PDF header', async () => {
    const file = {
      buffer: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('%PDF-1.7 test')]),
      mimetype: 'application/pdf',
      originalname: 'candidate.pdf',
      size: 16,
    };
    cloudinaryMock.uploadBuffer.mockResolvedValue({
      storageKey: 'upnext/cv/cv-file-id',
      publicUrl: 'https://cdn.example.com/candidate.pdf',
    });
    prismaMock.fileAsset.create.mockResolvedValue({
      id: 'file-id',
      sizeBytes: BigInt(file.size),
    });

    await expect(
      service.upload(
        file,
        { purpose: FilePurpose.CV, visibility: FileVisibility.PRIVATE },
        candidate,
      ),
    ).resolves.toMatchObject({ message: 'Tải lên thành công' });

    expect(prismaMock.fileAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mimeType: 'application/pdf' }),
      }),
    );
  });

  it('từ chối ZIP giả mạo thành file DOCX', async () => {
    const file = {
      buffer: Buffer.from('PK\x03\x04not-a-docx-archive', 'latin1'),
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      originalname: 'candidate.docx',
      size: 22,
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

  it('không cho phép tài liệu dành riêng cho CV được tải với mục đích khác', async () => {
    const file = {
      buffer: Buffer.from('plain candidate document'),
      mimetype: 'text/plain',
      originalname: 'candidate.txt',
      size: 24,
    };

    await expect(
      service.upload(
        file,
        { purpose: FilePurpose.OTHER, visibility: FileVisibility.PRIVATE },
        candidate,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(cloudinaryMock.uploadBuffer).not.toHaveBeenCalled();
  });

  it('xóa file Cloudinary khi không thể lưu metadata vào cơ sở dữ liệu', async () => {
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
    prismaMock.fileAsset.create.mockRejectedValue(new Error('database unavailable'));
    cloudinaryMock.deleteAsset.mockResolvedValue(undefined);

    await expect(
      service.upload(
        file,
        { purpose: FilePurpose.CV, visibility: FileVisibility.PRIVATE },
        candidate,
      ),
    ).rejects.toThrow('database unavailable');

    expect(cloudinaryMock.deleteAsset).toHaveBeenCalledWith(
      'upnext/cv/cv-file-id',
      'raw',
      'upload',
    );
  });
});
