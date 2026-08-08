import { ConflictException, NotFoundException } from '@nestjs/common';
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
      findUniqueOrThrow: jest.fn(),
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

  it('từ chối gắn sourceFileId của người khác vào CV mới — chặn rò rỉ file chéo tài khoản', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.fileAsset.findUnique.mockResolvedValue({
      id: 'file-id',
      ownerId: 'nguoi-khac-account-id',
    });

    await expect(
      service.create('candidate-account-id', {
        title: 'CV mượn file người khác',
        sourceFileId: 'file-id',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prismaMock.cV.create).not.toHaveBeenCalled();
  });

  it('cho phép gắn sourceFileId khi file đúng là của chính người gọi', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.fileAsset.findUnique.mockResolvedValue({
      id: 'file-id',
      ownerId: 'candidate-account-id',
    });
    prismaMock.cV.count.mockResolvedValue(0);
    prismaMock.cV.create.mockResolvedValue({ id: 'cv-id' });

    await service.create('candidate-account-id', {
      title: 'CV của chính mình',
      sourceFileId: 'file-id',
    });

    expect(prismaMock.cV.create).toHaveBeenCalled();
  });

  it('từ chối tạo CV mới khi tài khoản đã đạt trần số CV', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cV.count.mockResolvedValue(50);

    await expect(
      service.create('candidate-account-id', { title: 'CV thứ 51' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CV_LIMIT_REACHED' }),
    });
    expect(prismaMock.cV.create).not.toHaveBeenCalled();
  });

  it('từ chối cập nhật khi expectedVersion không khớp — chặn ghi đè âm thầm giữa hai tab', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cV.findFirst.mockResolvedValue({
      id: 'cv-id',
      candidateProfileId: 'profile-id',
      isDefault: false,
    });
    prismaMock.cV.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('cv-id', { title: 'Tên mới', expectedVersion: 0 }, 'candidate-account-id'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CV_VERSION_CONFLICT' }),
    });
  });

  it('cập nhật thành công khi expectedVersion khớp, và tăng version lên 1', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cV.findFirst.mockResolvedValue({
      id: 'cv-id',
      candidateProfileId: 'profile-id',
      isDefault: false,
    });
    prismaMock.cV.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.cV.findUniqueOrThrow.mockResolvedValue({ id: 'cv-id', version: 1 });

    await service.update('cv-id', { title: 'Tên mới', expectedVersion: 0 }, 'candidate-account-id');

    expect(prismaMock.cV.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cv-id', version: 0 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
  });

  it('không có expectedVersion thì cập nhật như cũ, không kiểm tra khoá', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cV.findFirst.mockResolvedValue({
      id: 'cv-id',
      candidateProfileId: 'profile-id',
      isDefault: false,
    });
    prismaMock.cV.update.mockResolvedValue({ id: 'cv-id', version: 1 });

    await service.update('cv-id', { title: 'Tên mới' }, 'candidate-account-id');

    expect(prismaMock.cV.update).toHaveBeenCalled();
    expect(prismaMock.cV.updateMany).not.toHaveBeenCalled();
  });

  it('trả về not-found (không phải 500 thô) khi CV bị xoá ngay trước khi đặt mặc định', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cV.findFirst.mockResolvedValue({
      id: 'cv-id',
      candidateProfileId: 'profile-id',
      isDefault: false,
    });
    prismaMock.cV.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(service.setDefault('cv-id', 'candidate-account-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('từ chối mẫu CV đã bị admin vô hiệu hoá dù id vẫn tồn tại', async () => {
    prismaMock.candidateProfile.findUnique.mockResolvedValue({ id: 'profile-id' });
    prismaMock.cVTemplate.findUnique.mockResolvedValue({ id: 'template-id', isActive: false });

    await expect(
      service.create('candidate-account-id', {
        title: 'CV dùng mẫu đã tắt',
        templateId: 'template-id',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prismaMock.cV.create).not.toHaveBeenCalled();
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
