import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FilePurpose, FileVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Readable } from 'stream';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { PaginationQueryDto, toPagination } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadCvVersionDto } from './dto/upload-cv-version.dto';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class CvVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async upload(cvId: string, dto: UploadCvVersionDto, file?: UploadedFile) {
    await this.ensureCvExists(cvId);
    await this.ensureTemplateExists(dto.templateId);
    this.ensurePdfFile(file);

    const savedFile = await this.saveCvFile(cvId, file);

    return this.prisma.$transaction(async (tx) => {
      const nextVersionNo = await this.getNextVersionNo(tx, cvId);
      const sourceFile = await tx.fileAsset.create({
        data: {
          ownerType: 'cv',
          ownerId: cvId,
          purpose: FilePurpose.CV,
          visibility: FileVisibility.PRIVATE,
          storageKey: savedFile.storageKey,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
        },
      });

      return tx.cVVersion.create({
        data: {
          cvId,
          sourceFileId: sourceFile.id,
          templateId: dto.templateId,
          versionNo: nextVersionNo,
          parsedText: dto.parsedText,
        },
        select: this.defaultSelect,
      });
    });
  }

  async findAll(cvId: string, query: PaginationQueryDto) {
    await this.ensureCvExists(cvId);

    const where: Prisma.CVVersionWhereInput = {
      cvId,
      ...(query.q
        ? {
            parsedText: {
              contains: query.q,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cVVersion.findMany({
        where,
        ...toPagination(query),
        orderBy: { versionNo: 'desc' },
        select: this.defaultSelect,
      }),
      this.prisma.cVVersion.count({ where }),
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
    const version = await this.prisma.cVVersion.findUnique({
      where: { id },
      select: this.defaultSelect,
    });

    if (!version) {
      throw new NotFoundException('Không tìm thấy phiên bản CV');
    }

    return version;
  }

  async prepareDownload(id: string) {
    const version = await this.prisma.cVVersion.findUnique({
      where: { id },
      select: {
        id: true,
        sourceFile: {
          select: {
            storageKey: true,
            originalName: true,
            mimeType: true,
          },
        },
      },
    });

    if (!version) {
      throw new NotFoundException('Không tìm thấy phiên bản CV');
    }

    if (!version.sourceFile) {
      throw new NotFoundException('Phiên bản CV chưa có file để tải xuống');
    }

    const isLocal = version.sourceFile.storageKey.startsWith('uploads/');

    if (isLocal) {
      const absolutePath = join(process.cwd(), version.sourceFile.storageKey);

      try {
        await stat(absolutePath);
      } catch {
        throw new NotFoundException('Không tìm thấy file CV trên hệ thống lưu trữ');
      }

      return {
        stream: createReadStream(absolutePath),
        fileName: version.sourceFile.originalName,
        mimeType: version.sourceFile.mimeType,
      };
    } else {
      const signedUrl = this.cloudinaryService.createSignedUrl(version.sourceFile.storageKey, {
        resourceType: 'image',
      });

      try {
        const response = await fetch(signedUrl);
        if (!response.ok) {
          throw new Error('Cloudinary download failed');
        }

        const nodeStream = Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]);

        return {
          stream: nodeStream,
          fileName: version.sourceFile.originalName,
          mimeType: version.sourceFile.mimeType,
        };
      } catch {
        throw new NotFoundException('Không tìm thấy file CV trên hệ thống lưu trữ đám mây');
      }
    }
  }

  async restore(id: string) {
    const version = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const nextVersionNo = await this.getNextVersionNo(tx, version.cvId);

      return tx.cVVersion.create({
        data: {
          cvId: version.cvId,
          sourceFileId: version.sourceFileId,
          templateId: version.templateId,
          versionNo: nextVersionNo,
          contentJson:
            version.contentJson === null
              ? undefined
              : (version.contentJson as Prisma.InputJsonValue),
          parsedText: version.parsedText,
        },
        select: this.defaultSelect,
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const applicationsCount = await this.prisma.application.count({
      where: { cvVersionId: id },
    });

    if (applicationsCount > 0) {
      throw new ConflictException('Phiên bản CV đang được hồ sơ ứng tuyển sử dụng');
    }

    try {
      return await this.prisma.cVVersion.delete({
        where: { id },
        select: this.defaultSelect,
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
  }

  private async ensureCvExists(cvId: string) {
    const cv = await this.prisma.cV.findUnique({
      where: { id: cvId },
      select: { id: true },
    });

    if (!cv) {
      throw new NotFoundException('Không tìm thấy CV');
    }

    return cv;
  }

  private async ensureTemplateExists(templateId?: string) {
    if (!templateId) {
      return;
    }

    const template = await this.prisma.cVTemplate.findUnique({
      where: { id: templateId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException('Không tìm thấy mẫu CV');
    }
  }

  private ensurePdfFile(file?: UploadedFile): asserts file is UploadedFile {
    if (!file) {
      throw new BadRequestException('File PDF là bắt buộc');
    }

    const extension = extname(file.originalname).toLowerCase();
    if (file.mimetype !== 'application/pdf' && extension !== '.pdf') {
      throw new BadRequestException('File CV phải có định dạng PDF');
    }
  }

  private async saveCvFile(cvId: string, file: UploadedFile) {
    const extension = extname(file.originalname) || '.pdf';
    const fileName = `version-${randomUUID()}${extension}`;
    const relativeDirectory = join('uploads', 'cvs', cvId);
    const absoluteDirectory = join(process.cwd(), relativeDirectory);
    const absolutePath = join(absoluteDirectory, fileName);

    await mkdir(absoluteDirectory, { recursive: true });
    await writeFile(absolutePath, file.buffer);

    return {
      storageKey: join(relativeDirectory, fileName).replaceAll('\\', '/'),
    };
  }

  private async getNextVersionNo(tx: Prisma.TransactionClient, cvId: string) {
    const latestVersion = await tx.cVVersion.findFirst({
      where: { cvId },
      orderBy: { versionNo: 'desc' },
      select: { versionNo: true },
    });

    return (latestVersion?.versionNo ?? 0) + 1;
  }

  private readonly defaultSelect = {
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
  } satisfies Prisma.CVVersionSelect;

  private handleKnownError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new ConflictException('Phiên bản CV đang được bản ghi khác sử dụng');
    }
  }
}
