import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCvDto } from './dto/create-cv.dto';
import { UpdateCvDto } from './dto/update-cv.dto';

/**
 * Trước đây không route nào trong `CvsController` có throttle hay trần số
 * lượng — một tài khoản có thể tạo CV liên tục không giới hạn. 50 là dư dả cho
 * mọi cách dùng thật (nhiều CV cho nhiều loại vị trí) nhưng vẫn chặn được spam.
 */
const MAX_CVS_PER_CANDIDATE = 50;

@Injectable()
export class CvsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(candidateAccountId: string, dto: CreateCvDto) {
    const profile = await this.getProfileByAccountId(candidateAccountId);
    await this.ensureInitialVersionRelations(dto, candidateAccountId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingCount = await tx.cV.count({
          where: { candidateProfileId: profile.id },
        });

        if (existingCount >= MAX_CVS_PER_CANDIDATE) {
          throw new ConflictException({
            code: 'CV_LIMIT_REACHED',
            message: 'Bạn đã đạt số CV tối đa. Hãy xoá bớt CV cũ trước khi tạo mới.',
          });
        }

        const isDefault = dto.isDefault ?? existingCount === 0;

        if (isDefault) {
          await this.clearDefaultCvs(tx, profile.id);
        }

        return tx.cV.create({
          data: {
            candidateProfileId: profile.id,
            title: dto.title,
            source: dto.source,
            status: dto.status,
            isDefault,
            versions: this.buildInitialVersionCreate(dto),
          },
          select: this.defaultSelect,
        });
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async findMine(candidateAccountId: string, query: PaginationQueryDto) {
    const profile = await this.getProfileByAccountId(candidateAccountId);
    const where: Prisma.CVWhereInput = {
      candidateProfileId: profile.id,
      ...(query.q
        ? {
            title: {
              contains: query.q,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cV.findMany({
        where,
        ...toPagination(query),
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        select: this.defaultSelect,
      }),
      this.prisma.cV.count({ where }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, candidateAccountId: string) {
    const profile = await this.getProfileByAccountId(candidateAccountId);

    const cv = await this.prisma.cV.findFirst({
      where: { id, candidateProfileId: profile.id },
      select: this.defaultSelect,
    });

    if (!cv) {
      throw new NotFoundException('Không tìm thấy CV');
    }

    return cv;
  }

  /**
   * `expectedVersion` là khoá lạc quan (§audit "silent last-write-wins" khi mở
   * cùng một CV ở hai tab/thiết bị). Không có client hiện tại nào gửi trường
   * này — vẫn cho phép bỏ trống để không phá API đang chạy — nhưng bất kỳ
   * client nào gửi kèm sẽ được bảo vệ: cập nhật chỉ thành công nếu `version`
   * trên server còn đúng như lúc client đọc CV lần cuối.
   */
  async update(id: string, dto: UpdateCvDto, candidateAccountId: string) {
    const cv = await this.findOne(id, candidateAccountId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await this.clearDefaultCvs(tx, cv.candidateProfileId);
        }

        if (dto.expectedVersion !== undefined) {
          const changed = await tx.cV.updateMany({
            where: { id, version: dto.expectedVersion },
            data: {
              title: dto.title,
              source: dto.source,
              status: dto.status,
              isDefault: dto.isDefault,
              version: { increment: 1 },
            },
          });

          if (changed.count !== 1) {
            throw new ConflictException({
              code: 'CV_VERSION_CONFLICT',
              message: 'CV đã bị thay đổi ở nơi khác. Tải lại rồi thử lại.',
            });
          }

          return tx.cV.findUniqueOrThrow({ where: { id }, select: this.defaultSelect });
        }

        return tx.cV.update({
          where: { id },
          data: {
            title: dto.title,
            source: dto.source,
            status: dto.status,
            isDefault: dto.isDefault,
            version: { increment: 1 },
          },
          select: this.defaultSelect,
        });
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async remove(id: string, candidateAccountId: string) {
    const cv = await this.findOne(id, candidateAccountId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.cV.delete({
          where: { id },
          select: this.defaultSelect,
        });

        if (cv.isDefault) {
          const nextDefault = await tx.cV.findFirst({
            where: { candidateProfileId: cv.candidateProfileId },
            orderBy: { updatedAt: 'desc' },
            select: { id: true },
          });

          if (nextDefault) {
            await tx.cV.update({
              where: { id: nextDefault.id },
              data: { isDefault: true },
            });
          }
        }

        return deleted;
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async setDefault(id: string, candidateAccountId: string) {
    const cv = await this.findOne(id, candidateAccountId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.clearDefaultCvs(tx, cv.candidateProfileId);

        return tx.cV.update({
          where: { id },
          data: { isDefault: true },
          select: this.defaultSelect,
        });
      });
    } catch (error) {
      // CV có thể đã bị xoá giữa lúc `findOne` đọc xong và transaction này
      // chạy (P2025 "record not found") — trước đây lỗi này lọt ra ngoài
      // thành 500 thô thay vì 404 rõ ràng.
      this.handleKnownError(error);
      throw error;
    }
  }

  private async getProfileByAccountId(candidateAccountId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { candidateAccountId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ ứng viên');
    }

    return profile;
  }

  /**
   * `sourceFileId` chỉ được kiểm tra *tồn tại*, chưa từng kiểm tra *thuộc về ai*.
   * `FileAsset.id` bị lộ ra ngoài response CV/CvVersion cho cả recruiter đang
   * xem đơn ứng tuyển — bất kỳ ai nhìn thấy id đó có thể tự tạo CV mới với
   * cùng `sourceFileId` rồi tải file gốc của người khác qua
   * `GET /cv-versions/:id/download` (`authorizeCvAccess` ở đó chỉ xác thực
   * quyền sở hữu *CV*, không xác thực quyền sở hữu *file*). So khớp
   * `FileAsset.ownerId` với tài khoản đang gọi để chặn đường rò rỉ này.
   */
  private async ensureInitialVersionRelations(dto: CreateCvDto, candidateAccountId: string) {
    const [sourceFile, template] = await Promise.all([
      dto.sourceFileId
        ? this.prisma.fileAsset.findUnique({
            where: { id: dto.sourceFileId },
            select: { id: true, ownerId: true },
          })
        : Promise.resolve(null),
      dto.templateId
        ? this.prisma.cVTemplate.findUnique({
            where: { id: dto.templateId },
            select: { id: true, isActive: true },
          })
        : Promise.resolve(null),
    ]);

    if (dto.sourceFileId && !sourceFile) {
      throw new NotFoundException('Không tìm thấy file nguồn của CV');
    }

    if (dto.sourceFileId && sourceFile && sourceFile.ownerId !== candidateAccountId) {
      throw new NotFoundException('Không tìm thấy file nguồn của CV');
    }

    // Mẫu bị admin vô hiệu hoá không còn chọn được nữa dù biết id — cùng lý do
    // đã sửa ở `CvVersionsService.ensureTemplateExists`.
    if (dto.templateId && (!template || !template.isActive)) {
      throw new NotFoundException('Không tìm thấy mẫu CV');
    }
  }

  private buildInitialVersionCreate(dto: CreateCvDto) {
    const hasInitialVersion =
      Boolean(dto.sourceFileId) ||
      Boolean(dto.templateId) ||
      dto.contentJson !== undefined ||
      dto.parsedText !== undefined;

    if (!hasInitialVersion) {
      return undefined;
    }

    return {
      create: {
        sourceFileId: dto.sourceFileId,
        templateId: dto.templateId,
        versionNo: 1,
        contentJson: dto.contentJson as Prisma.InputJsonValue | undefined,
        parsedText: dto.parsedText,
      },
    };
  }

  private clearDefaultCvs(tx: Prisma.TransactionClient, candidateProfileId: string) {
    return tx.cV.updateMany({
      where: {
        candidateProfileId,
        isDefault: true,
      },
      data: { isDefault: false },
    });
  }

  private readonly defaultSelect = {
    id: true,
    candidateProfileId: true,
    title: true,
    source: true,
    status: true,
    isDefault: true,
    version: true,
    createdAt: true,
    updatedAt: true,
    versions: {
      orderBy: { versionNo: 'desc' },
      select: {
        id: true,
        sourceFileId: true,
        cvId: true,
        templateId: true,
        versionNo: true,
        contentJson: true,
        parsedText: true,
        createdAt: true,
        sourceFile: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            publicUrl: true,
          },
        },
      },
    },
  } satisfies Prisma.CVSelect;

  private handleKnownError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new ConflictException('CV đang được bản ghi khác sử dụng');
      }

      if (error.code === 'P2014') {
        throw new ConflictException('CV đang được bản ghi khác sử dụng');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Không tìm thấy CV');
      }
    }
  }
}
