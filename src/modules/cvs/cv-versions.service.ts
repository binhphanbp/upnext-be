import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType, CvSource, CvStatus, FilePurpose, FileVisibility, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'stream';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { recruiterAccessibleJobPostFilter } from '../../common/authorization/job-post-access';
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
import { CreateBuilderCvVersionDto } from './dto/create-builder-cv-version.dto';

/** Đủ dư cho một CV thật sự có nhiều bản chỉnh sửa, không đủ để spam vô hạn. */
const MAX_VERSIONS_PER_CV = 100;

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
  private readonly logger = new Logger(CvVersionsService.name);

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
    await this.ensureVersionLimitNotReached(cvId);
    await this.ensureTemplateExists(dto.templateId);
    this.ensurePdfFile(file);

    const savedFile = await this.saveCvFile(cvId, file);

    try {
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      // Template có thể bị xoá giữa lúc `ensureTemplateExists` kiểm tra xong
      // và transaction này chạy (FK violation P2003) — trước đây lọt ra thành
      // 500 thô thay vì lỗi rõ ràng.
      this.handleKnownError(error);
      throw error;
    }
  }

  /**
   * Saves a Builder edit as a new immutable version. Applications reference a
   * CVVersion, so this endpoint must never overwrite an existing snapshot.
   */
  async createBuilderVersion(
    cvId: string,
    dto: CreateBuilderCvVersionDto,
    user: AuthenticatedUser,
  ) {
    const cv = await this.prisma.cV.findUnique({
      where: { id: cvId },
      select: {
        id: true,
        candidateProfileId: true,
        source: true,
        status: true,
        isDefault: true,
        version: true,
        candidateProfile: { select: { candidateAccountId: true } },
      },
    });

    if (!cv) throw new NotFoundException('Không tìm thấy CV');
    if (user.role !== ActorType.CANDIDATE || cv.candidateProfile.candidateAccountId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa CV này');
    }
    if (cv.source !== CvSource.BUILDER) {
      throw new BadRequestException('Chỉ CV tạo bằng CV Builder mới lưu theo cách này');
    }

    const status = dto.status ?? cv.status;
    if (status === CvStatus.ARCHIVED) {
      throw new BadRequestException('Hãy dùng thao tác lưu trữ riêng thay vì lưu phiên bản mới');
    }
    if (!this.isNonEmptyObject(dto.contentJson)) {
      throw new BadRequestException('Nội dung CV không hợp lệ');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentVersionCount = await tx.cVVersion.count({ where: { cvId } });
        if (currentVersionCount >= MAX_VERSIONS_PER_CV) {
          throw new ConflictException({
            code: 'CV_VERSION_LIMIT_REACHED',
            message: 'CV này đã đạt số phiên bản tối đa. Hãy xoá bớt phiên bản cũ trước khi lưu.',
          });
        }

        const updated = await tx.cV.updateMany({
          where: { id: cvId, version: dto.expectedVersion },
          data: {
            ...(dto.title ? { title: dto.title } : {}),
            status,
            // A non-active CV cannot be offered as a default application CV.
            isDefault: status === CvStatus.ACTIVE ? cv.isDefault : false,
            version: { increment: 1 },
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException({
            code: 'CV_VERSION_CONFLICT',
            message: 'CV đã được chỉnh sửa ở nơi khác. Hãy tải lại rồi thử lại.',
          });
        }

        const nextVersionNo = await this.getNextVersionNo(tx, cvId);
        const version = await tx.cVVersion.create({
          data: {
            cvId,
            versionNo: nextVersionNo,
            contentJson: dto.contentJson as Prisma.InputJsonValue,
            parsedText: dto.parsedText,
          },
          select: this.defaultSelect,
        });

        return {
          cv: await tx.cV.findUniqueOrThrow({
            where: { id: cvId },
            select: {
              id: true,
              title: true,
              status: true,
              isDefault: true,
              version: true,
              updatedAt: true,
            },
          }),
          version,
        };
      });
    } catch (error) {
      this.handleKnownError(error);
      throw error;
    }
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
        parsedText: true,
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
      if (version.parsedText?.trim()) {
        return {
          kind: 'stream',
          stream: Readable.from([Buffer.from(version.parsedText, 'utf-8')]),
          fileName: `CV-${id.slice(0, 8)}.txt`,
          mimeType: 'text/plain; charset=utf-8',
        };
      }
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
        if (version.parsedText?.trim()) {
          return {
            kind: 'stream',
            stream: Readable.from([Buffer.from(version.parsedText, 'utf-8')]),
            fileName: `CV-${id.slice(0, 8)}.txt`,
            mimeType: 'text/plain; charset=utf-8',
          };
        }
        throw new NotFoundException('Không tìm thấy file CV trên hệ thống lưu trữ');
      }
    } else {
      try {
        const cloudinaryResourceType = version.sourceFile.mimeType?.startsWith('image/')
          ? 'image'
          : 'raw';
        const signedUrl = this.cloudinaryService.createSignedUrl(version.sourceFile.storageKey, {
          resourceType: cloudinaryResourceType,
          deliveryType: 'upload',
        });

        let cloudinaryRes = await fetch(signedUrl);
        if (!cloudinaryRes.ok && cloudinaryResourceType === 'raw') {
          const altSignedUrl = this.cloudinaryService.createSignedUrl(version.sourceFile.storageKey, {
            resourceType: 'image',
            deliveryType: 'upload',
          });
          const altRes = await fetch(altSignedUrl);
          if (altRes.ok) {
            cloudinaryRes = altRes;
          }
        }

        if (cloudinaryRes.ok) {
          const buffer = Buffer.from(await cloudinaryRes.arrayBuffer());
          return {
            kind: 'stream',
            stream: Readable.from([buffer]),
            fileName: version.sourceFile.originalName,
            mimeType: version.sourceFile.mimeType,
          };
        }
      } catch (error) {
        this.logger.warn(`Could not fetch Cloudinary CV asset: ${String(error)}`);
      }

      if (version.parsedText?.trim()) {
        return {
          kind: 'stream',
          stream: Readable.from([Buffer.from(version.parsedText, 'utf-8')]),
          fileName: `CV-${id.slice(0, 8)}.txt`,
          mimeType: 'text/plain; charset=utf-8',
        };
      }

      throw new NotFoundException('Không tìm thấy file CV trên hệ thống lưu trữ');
    }
  }

  async restore(id: string, user: AuthenticatedUser) {
    const version = await this.getVersionOrThrow(id);
    await this.authorizeCvAccess(version.cvId, user);

    try {
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      // CV gốc có thể đã bị xoá giữa lúc kiểm tra quyền và transaction này
      // chạy — trước đây lọt ra thành 500 thô thay vì lỗi rõ ràng.
      this.handleKnownError(error);
      throw error;
    }
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
      // `recruiterAccessibleJobPostFilter` là định nghĩa quyền dùng chung
      // (job-post-access.ts): người tạo tin luôn có quyền, thành viên còn lại
      // của công ty có quyền trừ khi bị thu hồi riêng cho đúng tin đó. Bản cũ
      // ở đây tự viết lại điều kiện bằng `jobPost.recruiterAccountId` và
      // `jobPost.hiringTeam` — hai field không tồn tại trên `JobPost` (job
      // chỉ có `createdByRecruiterId`; quan hệ đúng tên là
      // `hiringTeamMembers`, và bảng đó chỉ dùng cho hội thoại ứng tuyển, không
      // phải quyền xem CV) — nên mọi lượt tải CV của recruiter đều rơi vào
      // `PrismaClientValidationError` → 500 thô, bất kể có quyền hay không.
      const application = await this.prisma.application.findFirst({
        where: {
          cvVersion: { cvId },
<<<<<<< HEAD
          OR: [
            ...(user.companyId ? [{ jobPost: { companyId: user.companyId } }] : []),
            { jobPost: { createdByRecruiterId: user.id } },
            { jobPost: { hiringTeam: { some: { recruiterAccountId: user.id } } } },
          ],
=======
          jobPost: {
            companyId: user.companyId,
            ...recruiterAccessibleJobPostFilter(user.id),
          },
>>>>>>> origin/dev
        },
        select: { id: true },
      });

      if (application) {
        return cv;
      }
    }

    throw new ForbiddenException('Bạn không có quyền truy cập CV này');
  }

  /**
   * `getNextVersionNo` chỉ đếm để đánh số thứ tự, chưa từng dùng để chặn.
   * Không có trần nào ở đây trước đây — một tài khoản có thể tải lên PDF 10MB
   * liên tục, mỗi file một bản ghi mới, không giới hạn.
   */
  private async ensureVersionLimitNotReached(cvId: string) {
    const versionCount = await this.prisma.cVVersion.count({ where: { cvId } });
    if (versionCount >= MAX_VERSIONS_PER_CV) {
      throw new ConflictException({
        code: 'CV_VERSION_LIMIT_REACHED',
        message: 'CV này đã đạt số phiên bản tối đa. Hãy xoá bớt phiên bản cũ trước khi tải lên.',
      });
    }
  }

  private async ensureTemplateExists(templateId?: string) {
    if (!templateId) {
      return;
    }

    const template = await this.prisma.cVTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, isActive: true },
    });

    // Trước đây chỉ kiểm tra tồn tại — một mẫu admin đã chủ động vô hiệu hoá
    // (`isActive: false`, ví dụ layout lỗi/không còn dùng) vẫn chọn được nếu
    // biết id, làm vô nghĩa việc admin bấm "Vô hiệu hoá".
    if (!template || !template.isActive) {
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

  private isNonEmptyObject(value: Record<string, unknown>) {
    return Object.keys(value).length > 0;
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
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new ConflictException('Phiên bản CV đang được bản ghi khác sử dụng');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Không tìm thấy CV hoặc phiên bản CV');
      }
    }
  }
}
