import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CvVersionsService } from './cv-versions.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';

describe('CvVersionsService', () => {
  let service: CvVersionsService;
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
          useValue: {
            createSignedUrl: jest.fn(),
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

    await expect(service.upload('cv-id', {})).rejects.toThrow(BadRequestException);
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
    prismaMock.cVVersion.findFirst.mockResolvedValue({ versionNo: 3 });
    prismaMock.cVVersion.create.mockResolvedValue({
      id: 'new-version-id',
      cvId: 'cv-id',
      versionNo: 4,
    });

    await service.restore('version-id');

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
    prismaMock.application.count.mockResolvedValue(1);

    await expect(service.remove('version-id')).rejects.toThrow(ConflictException);
  });
});
