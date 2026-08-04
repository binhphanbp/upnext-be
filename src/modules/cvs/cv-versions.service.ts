import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, FilePurpose, FileVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'stream';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto, toPagination } from '../../common/dto/pagination-query.dto';
import {
  buildUploadStorageKey,
  resolveUploadStoragePath,
  UPLOAD_STORAGE_PREFIX,
} from '../../common/upload/upload-paths';
import { hasPdfHeader } from '../../common/upload/cv-file-validation';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadCvVersionDto } from './dto/upload-cv-version.dto';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export type PreparedCvDownload =
  | {
      kind: 'stream';
      stream: Readable;
      fileName: string;
      mimeType: string;
    }
  | {
      kind: 'redirect';
      url: string;
      fileName: string;
      mimeType: string;
    };

@Injectable()
export class CvVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly configService: ConfigService,
  ) {}

  async upload(
    cvId: string,
    dto: UploadCvVersionDto,
    file: UploadedFile | undefined,
    user: AuthenticatedUser,
  ) {
    await this.authorizeCvAccess(cvId, user);
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

  async findAll(cvId: string, query: PaginationQueryDto, user: AuthenticatedUser) {
    await this.authorizeCvAccess(cvId, user);

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

  async findOne(id: string, user: AuthenticatedUser) {
    const version = await this.getVersionOrThrow(id);
    await this.authorizeCvAccess(version.cvId, user);
    return version;
  }

  private async getVersionOrThrow(id: string) {
    const version = await this.prisma.cVVersion.findUnique({
      where: { id },
      select: this.defaultSelect,
    });

    if (!version) {
      throw new NotFoundException('Không tìm thấy phiên bản CV');
    }

    return version;
  }

  async prepareDownload(id: string, user: AuthenticatedUser): Promise<PreparedCvDownload> {
    const versionRef = await this.prisma.cVVersion.findUnique({
      where: { id },
      select: { cvId: true },
    });

    if (!versionRef) {
      throw new NotFoundException('Không tìm thấy phiên bản CV');
    }

    await this.authorizeCvAccess(versionRef.cvId, user);

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

    const isLocal = version.sourceFile.storageKey.startsWith(UPLOAD_STORAGE_PREFIX);

    if (isLocal) {
      try {
        const absolutePath = resolveUploadStoragePath(
          this.configService.getOrThrow<string>('uploadRoot'),
          version.sourceFile.storageKey,
        );
        await stat(absolutePath);

        return {
          kind: 'stream',
          stream: createReadStream(absolutePath),
          fileName: version.sourceFile.originalName,
          mimeType: version.sourceFile.mimeType,
        };
      } catch {
        throw new NotFoundException('Không tìm thấy file CV trên hệ thống lưu trữ');
      }
    } else {
      // Determine the Cloudinary resource_type based on the stored MIME type:
      // - PDFs and other documents were uploaded as 'raw' (stored as-is)
      // - Images were uploaded as 'image'
      // Also use deliveryType 'upload' to match how files were stored (not 'authenticated').
      const cloudinaryResourceType = version.sourceFile.mimeType.startsWith('image/')
        ? 'image'
        : 'raw';
      const signedUrl = this.cloudinaryService.createSignedUrl(version.sourceFile.storageKey, {
        resourceType: cloudinaryResourceType,
        deliveryType: 'upload',
      });

      // Cloudinary documents are delivered directly to the browser after authorization.
      // This avoids proxying binary files through the API server, which creates a fragile
      // dependency on the VPS being able to fetch Cloudinary's delivery domain.
      return {
        kind: 'redirect',
        url: signedUrl,
        fileName: version.sourceFile.originalName,
        mimeType: version.sourceFile.mimeType,
      };
    }
  }

  async restore(id: string, user: AuthenticatedUser) {
    const version = await this.getVersionOrThrow(id);
    await this.authorizeCvAccess(version.cvId, user);

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

  async remove(id: string, user: AuthenticatedUser) {
    const version = await this.getVersionOrThrow(id);
    await this.authorizeCvAccess(version.cvId, user);

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

  /**
   * Ensures the CV exists AND that the caller is allowed to touch it:
   * - ADMIN: full access.
   * - CANDIDATE: only their own CV.
   * - RECRUITER: only if a candidate applied to one of the recruiter's company job
   *   posts using a version of this CV.
   */
  private async authorizeCvAccess(cvId: string, user: AuthenticatedUser) {
    const cv = await this.prisma.cV.findUnique({
      where: { id: cvId },
      select: {
        id: true,
        candidateProfile: { select: { candidateAccountId: true } },
      },
    });

    if (!cv) {
      throw new NotFoundException('Không tìm thấy CV');
    }

    if (user.role === ActorType.ADMIN) {
      return cv;
    }

    if (user.role === ActorType.CANDIDATE) {
      if (cv.candidateProfile?.candidateAccountId !== user.id) {
        throw new ForbiddenException('Bạn không có quyền truy cập CV này');
      }
      return cv;
    }

    if (user.role === ActorType.RECRUITER && user.companyId) {
      const application = await this.prisma.application.findFirst({
        where: {
          cvVersion: { cvId },
          jobPost: { companyId: user.companyId },
        },
        select: { id: true },
      });

      if (application) {
        return cv;
      }
    }

    throw new ForbiddenException('Bạn không có quyền truy cập CV này');
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

    // Require the declared MIME type to be PDF and verify the actual content
    // starts with the PDF magic bytes (%PDF-). Do not trust the filename.
    if (file.mimetype !== 'application/pdf' || !hasPdfHeader(file.buffer)) {
      throw new BadRequestException('File CV phải có định dạng PDF hợp lệ');
    }
  }

  private async saveCvFile(cvId: string, file: UploadedFile) {
    // Never derive the on-disk extension from the client-supplied filename.
    const fileName = `version-${randomUUID()}.pdf`;
    const storageKey = buildUploadStorageKey('cvs', cvId, fileName);
    const absolutePath = resolveUploadStoragePath(
      this.configService.getOrThrow<string>('uploadRoot'),
      storageKey,
    );

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    return { storageKey };
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
