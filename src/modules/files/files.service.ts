import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ActorType, FilePurpose, FileVisibility } from '@prisma/client';
import { CloudinaryService, UploadedFile } from '../../common/cloudinary/cloudinary.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CV_DECLARED_MIME_TYPES, validateCvUpload } from '../../common/upload/cv-file-validation';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadFileDto } from './dto/upload-file.dto';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async upload(file: UploadedFile | undefined, dto: UploadFileDto, user: AuthenticatedUser) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const purpose = dto.purpose ?? FilePurpose.OTHER;
    const visibility = dto.visibility ?? FileVisibility.PRIVATE;
    const owner = this.resolveOwner(dto, user);
    this.ensurePurposeAllowsFileType(file, purpose);
    const validatedCv = purpose === FilePurpose.CV ? validateCvUpload(file) : undefined;

    // Use 'image' resource_type for images, 'raw' for all other files (PDFs, docs).
    // 'raw' stores the file as-is without image processing — avoids Cloudinary
    // rejecting PDFs with "Invalid image file".
    const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw';
    const upload = await this.cloudinaryService.uploadBuffer(file, {
      folder: purpose.toLowerCase(),
      fileNamePrefix: purpose.toLowerCase(),
      resourceType,
      // Use 'upload' for all files — Cloudinary Free Plan does not support
      // 'authenticated' delivery type. Access control for PRIVATE files is
      // enforced at the application level (publicUrl is not exposed).
      deliveryType: 'upload',
    });

    let asset;
    try {
      asset = await this.prisma.fileAsset.create({
        data: {
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
          purpose,
          visibility,
          storageKey: upload.storageKey,
          originalName: validatedCv?.originalName ?? file.originalname,
          mimeType: validatedCv?.mimeType ?? file.mimetype,
          sizeBytes: BigInt(file.size),
          publicUrl: visibility === FileVisibility.PUBLIC ? upload.publicUrl : null,
        },
      });
    } catch (error) {
      await this.removeOrphanedUpload(upload.storageKey, resourceType);
      throw error;
    }

    return {
      message: 'Tải lên thành công',
      file: {
        ...asset,
        sizeBytes: asset.sizeBytes.toString(),
      },
    };
  }

  async uploadMany(files: UploadedFile[] | undefined, dto: UploadFileDto, user: AuthenticatedUser) {
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }

    const uploaded = await Promise.all(files.map((file) => this.upload(file, dto, user)));

    return {
      message: 'Tải nhiều file lên thành công',
      files: uploaded.map((item) => item.file),
    };
  }

  private resolveOwner(dto: UploadFileDto, user: AuthenticatedUser) {
    if (user.role === ActorType.ADMIN) {
      return {
        ownerType: dto.ownerType ?? this.resolveOwnerType(dto.actorType ?? user.role),
        ownerId: dto.ownerId ?? user.id,
      };
    }

    return {
      ownerType: this.resolveOwnerType(user.role),
      ownerId: user.id,
    };
  }

  private async removeOrphanedUpload(storageKey: string, resourceType: 'image' | 'raw') {
    try {
      await this.cloudinaryService.deleteAsset(storageKey, resourceType, 'upload');
    } catch (cleanupError) {
      this.logger.error(
        `Could not remove orphaned Cloudinary asset ${storageKey} after a database failure`,
        cleanupError instanceof Error ? cleanupError.stack : undefined,
      );
    }
  }

  private ensurePurposeAllowsFileType(file: UploadedFile, purpose: FilePurpose) {
    const isCvDocument = CV_DECLARED_MIME_TYPES.includes(file.mimetype.toLowerCase());
    const isPdf = file.mimetype.toLowerCase() === 'application/pdf';

    if (purpose !== FilePurpose.CV && isCvDocument && !isPdf) {
      throw new BadRequestException(
        'Định dạng DOC, DOCX, TXT, MD hoặc TEX chỉ được hỗ trợ khi tải CV',
      );
    }
  }

  private resolveOwnerType(actorType: ActorType) {
    switch (actorType) {
      case ActorType.CANDIDATE:
        return 'candidate_account';
      case ActorType.RECRUITER:
        return 'recruiter_account';
      case ActorType.ADMIN:
        return 'admin';
      default:
        return 'system';
    }
  }
}
