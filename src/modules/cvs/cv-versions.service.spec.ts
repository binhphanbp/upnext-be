import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CvVersionsService } from './cv-versions.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

describe('CvVersionsService', () => {
  let service: CvVersionsService;
  const cloudinaryMock = {
    createSignedUrl: jest.fn(),
  };
  const adminUser: AuthenticatedUser = {
    id: 'admin-id',
    email: 'admin@upnext.dev',
    role: ActorType.ADMIN,
    permissions: [],
  };
  const prismaMock: any = {
    cV: {
      findUnique: jest.fn(),
    },
    cVTemplate: {
      findUnique: jest.fn(),
    },
    cVVersion: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    fileAsset: {
      create: jest.fn(),
    },
    application: {
      count: jest.fn(),
    },
    $transaction: jest.fn((arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }

      return (arg as (tx: unknown) => unknown)(prismaMock);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CvVersionsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: CloudinaryService,
          useValue: cloudinaryMock,
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('tmp/test-uploads'),
          },
        },
      ],
    }).compile();

    service = module.get<CvVersionsService>(CvVersionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('không cho upload phiên bản CV khi thiếu file PDF', async () => {
    prismaMock.cV.findUnique.mockResolvedValue({ id: 'cv-id' });

    await expect(service.upload('cv-id', {}, undefined, adminUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('khôi phục phiên bản cũ bằng cách tạo phiên bản mới có versionNo kế tiếp', async () => {
    prismaMock.cVVersion.findUnique.mockResolvedValue({
      id: 'version-id',
      sourceFileId: 'file-id',
      cvId: 'cv-id',
      templateId: null,
      versionNo: 1,
      contentJson: { summary: 'Phiên bản cũ' },
      parsedText: 'Phiên bản cũ',
      createdAt: new Date('2026-06-09T08:00:00.000Z'),
      sourceFile: null,
    });
    prismaMock.cV.findUnique.mockResolvedValue({ id: 'cv-id', candidateProfile: null });
    prismaMock.cVVersion.findFirst.mockResolvedValue({ versionNo: 3 });
    prismaMock.cVVersion.create.mockResolvedValue({
      id: 'new-version-id',
      cvId: 'cv-id',
      versionNo: 4,
    });

    await service.restore('version-id', adminUser);

    expect(prismaMock.cVVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cvId: 'cv-id',
          sourceFileId: 'file-id',
          versionNo: 4,
          parsedText: 'Phiên bản cũ',
        }),
      }),
    );
  });

  it('không cho xóa phiên bản CV đang được hồ sơ ứng tuyển sử dụng', async () => {
    prismaMock.cVVersion.findUnique.mockResolvedValue({
      id: 'version-id',
      cvId: 'cv-id',
      versionNo: 1,
      contentJson: null,
      parsedText: null,
      createdAt: new Date('2026-06-09T08:00:00.000Z'),
      sourceFile: null,
    });
    prismaMock.cV.findUnique.mockResolvedValue({ id: 'cv-id', candidateProfile: null });
    prismaMock.application.count.mockResolvedValue(1);

    await expect(service.remove('version-id', adminUser)).rejects.toThrow(ConflictException);
  });

  it('tải PDF Cloudinary bằng đúng resource type raw và delivery type upload', async () => {
    prismaMock.cVVersion.findUnique
      .mockResolvedValueOnce({ cvId: 'cv-id' })
      .mockResolvedValueOnce({
        id: 'version-id',
        sourceFile: {
          storageKey: 'upnext/cv/cv-file-id',
          originalName: 'candidate.pdf',
          mimeType: 'application/pdf',
        },
      });
    prismaMock.cV.findUnique.mockResolvedValue({ id: 'cv-id', candidateProfile: null });
    cloudinaryMock.createSignedUrl.mockReturnValue('https://cdn.example.com/candidate.pdf');
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(new Uint8Array(Buffer.from('%PDF-1.7 test')), {
          headers: { 'content-type': 'application/octet-stream' },
          status: 200,
        }),
      );

    const download = await service.prepareDownload('version-id', adminUser);

    expect(cloudinaryMock.createSignedUrl).toHaveBeenCalledWith('upnext/cv/cv-file-id', {
      resourceType: 'raw',
      deliveryType: 'upload',
    });
    expect(download.fileName).toBe('candidate.pdf');
    expect(download.mimeType).toBe('application/pdf');

    fetchMock.mockRestore();
  });

  it('không truyền nội dung HTML giả PDF về trình xem CV', async () => {
    prismaMock.cVVersion.findUnique
      .mockResolvedValueOnce({ cvId: 'cv-id' })
      .mockResolvedValueOnce({
        id: 'version-id',
        sourceFile: {
          storageKey: 'upnext/cv/invalid-file-id',
          originalName: 'candidate.pdf',
          mimeType: 'application/pdf',
        },
      });
    prismaMock.cV.findUnique.mockResolvedValue({ id: 'cv-id', candidateProfile: null });
    cloudinaryMock.createSignedUrl.mockReturnValue('https://cdn.example.com/candidate.pdf');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<!DOCTYPE html><html></html>', {
        headers: { 'content-type': 'application/octet-stream' },
        status: 200,
      }),
    );

    await expect(service.prepareDownload('version-id', adminUser)).rejects.toThrow(
      NotFoundException,
    );

    fetchMock.mockRestore();
  });
});
