import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CvTemplatesService } from './cv-templates.service';

const templateRecord = {
  id: 'template-id',
  name: 'Mẫu CV Backend tối giản',
  description: 'Mẫu CV cho lập trình viên Backend.',
  previewImageUrl: 'https://cdn.upnext.dev/cv-templates/backend-minimal.png',
  layoutKey: 'backend-minimal',
  isActive: true,
  createdAt: new Date('2026-06-09T08:00:00.000Z'),
  updatedAt: new Date('2026-06-09T08:00:00.000Z'),
  _count: {
    cvVersions: 0,
  },
};

describe('CvTemplatesService', () => {
  let service: CvTemplatesService;
  const prismaMock: any = {
    cVTemplate: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
        CvTemplatesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<CvTemplatesService>(CvTemplatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('tạo mẫu CV và trả về cvVersionsCount', async () => {
    prismaMock.cVTemplate.create.mockResolvedValue(templateRecord);

    const result = await service.create({
      name: 'Mẫu CV Backend tối giản',
      layoutKey: 'backend-minimal',
    });

    expect(result).toMatchObject({
      id: 'template-id',
      layoutKey: 'backend-minimal',
      cvVersionsCount: 0,
    });
  });

  it('lọc danh sách mẫu CV theo trạng thái hoạt động', async () => {
    prismaMock.cVTemplate.findMany.mockResolvedValue([templateRecord]);
    prismaMock.cVTemplate.count.mockResolvedValue(1);

    await service.findAll({ page: 1, limit: 20, isActive: true });

    expect(prismaMock.cVTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      }),
    );
  });

  it('trả về conflict khi layoutKey đã tồn tại', async () => {
    prismaMock.cVTemplate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create({
        name: 'Mẫu CV Backend tối giản',
        layoutKey: 'backend-minimal',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('không cho xóa mẫu CV đang được phiên bản CV sử dụng', async () => {
    prismaMock.cVTemplate.findUnique.mockResolvedValue({
      ...templateRecord,
      _count: { cvVersions: 2 },
    });

    await expect(service.remove('template-id')).rejects.toThrow(ConflictException);
  });
});
