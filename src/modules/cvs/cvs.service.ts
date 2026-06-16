import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCvDto } from './dto/create-cv.dto';
import { UpdateCvDto } from './dto/update-cv.dto';

@Injectable()
export class CvsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(candidateAccountId: string, dto: CreateCvDto) {
    const profile = await this.getProfileByAccountId(candidateAccountId);
    await this.ensureInitialVersionRelations(dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingCount = await tx.cV.count({
          where: { candidateProfileId: profile.id },
        });
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

  async findOne(id: string) {
    const cv = await this.prisma.cV.findUnique({
      where: { id },
      select: this.defaultSelect,
    });

    if (!cv) {
      throw new NotFoundException('Không tìm thấy CV');
    }

    return cv;
  }

  async update(id: string, dto: UpdateCvDto) {
    const cv = await this.findOne(id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await this.clearDefaultCvs(tx, cv.candidateProfileId);
        }

        return tx.cV.update({
          where: { id },
          data: {
            title: dto.title,
            source: dto.source,
            status: dto.status,
            isDefault: dto.isDefault,
          },
          select: this.defaultSelect,
        });
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  async remove(id: string) {
    const cv = await this.findOne(id);

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

  async setDefault(id: string) {
    const cv = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      await this.clearDefaultCvs(tx, cv.candidateProfileId);

      return tx.cV.update({
        where: { id },
        data: { isDefault: true },
        select: this.defaultSelect,
      });
    });
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

  private async ensureInitialVersionRelations(dto: CreateCvDto) {
    const [sourceFile, template] = await Promise.all([
      dto.sourceFileId
        ? this.prisma.fileAsset.findUnique({
            where: { id: dto.sourceFileId },
            select: { id: true },
          })
        : Promise.resolve(null),
      dto.templateId
        ? this.prisma.cVTemplate.findUnique({
            where: { id: dto.templateId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (dto.sourceFileId && !sourceFile) {
      throw new NotFoundException('Không tìm thấy file nguồn của CV');
    }

    if (dto.templateId && !template) {
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
    }
  }
}
