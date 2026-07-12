import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CvSource, CvStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CvsService } from './cvs.service';

describe('CvsService', () => {
  let service: CvsService;
  const prismaMock: any = {
    candidateProfile: {
      findUnique: jest.fn(),
    },
    fileAsset: {
      findUnique: jest.fn(),
    },
    cVTemplate: {
      findUnique: jest.fn(),
    },
    cV: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
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
        CvsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<CvsService>(CvsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('tạo CV đầu tiên làm mặc định và tạo phiên bản đầu tiên khi có dữ liệu phiên bản', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cV.count.mockResolvedValue(0);
    prismaMock.cV.create.mockResolvedValue({
      id: 'cv-id',
      candidateProfileId: 'profile-id',
      title: 'CV Lập trình viên Backend',
      source: CvSource.BUILDER,
      status: CvStatus.ACTIVE,
      isDefault: true,
      versions: [{ id: 'version-id', versionNo: 1 }],
    });

    await service.create('candidate-account-id', {
      title: 'CV Lập trình viên Backend',
      parsedText: 'Lập trình viên Backend NestJS.',
    });

    expect(prismaMock.cV.updateMany).toHaveBeenCalledWith({
      where: { candidateProfileId: 'profile-id', isDefault: true },
      data: { isDefault: false },
    });
    expect(prismaMock.cV.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          candidateProfileId: 'profile-id',
          isDefault: true,
          versions: {
            create: expect.objectContaining({
              versionNo: 1,
              parsedText: 'Lập trình viên Backend NestJS.',
            }),
          },
        }),
      }),
    );
  });

  it('bỏ mặc định các CV khác trước khi đặt một CV làm mặc định', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cV.findFirst.mockResolvedValue({
      id: 'cv-id',
      candidateProfileId: 'profile-id',
      isDefault: false,
    });
    prismaMock.cV.update.mockResolvedValue({
      id: 'cv-id',
      candidateProfileId: 'profile-id',
      isDefault: true,
    });

    await service.setDefault('cv-id', 'candidate-account-id');

    expect(prismaMock.cV.updateMany).toHaveBeenCalledWith({
      where: { candidateProfileId: 'profile-id', isDefault: true },
      data: { isDefault: false },
    });
    expect(prismaMock.cV.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cv-id' },
        data: { isDefault: true },
      }),
    );
  });

  it('trả về conflict khi xóa CV đang được bản ghi khác tham chiếu', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cV.findFirst.mockResolvedValue({
      id: 'cv-id',
      candidateProfileId: 'profile-id',
      isDefault: false,
    });
    prismaMock.cV.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );

    await expect(service.remove('cv-id', 'candidate-account-id')).rejects.toThrow(
      ConflictException,
    );
  });
});
