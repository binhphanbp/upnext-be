import { BadRequestException, Injectable } from '@nestjs/common';
import { ActorType, FilePurpose, FileVisibility } from '@prisma/client';
import { CloudinaryService, UploadedFile } from '../../common/cloudinary/cloudinary.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadFileDto } from './dto/upload-file.dto';

@Injectable()
export class FilesService {
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
    this.ensureValidCvContent(file, purpose);

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

    const asset = await this.prisma.fileAsset.create({
      data: {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        purpose,
        visibility,
        storageKey: upload.storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        publicUrl: visibility === FileVisibility.PUBLIC ? upload.publicUrl : null,
      },
    });

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

  private ensureValidCvContent(file: UploadedFile, purpose: FilePurpose) {
    if (purpose !== FilePurpose.CV) {
      return;
    }

    const isPdf = file.mimetype === 'application/pdf';
    const hasPdfMagic =
      file.buffer.length >= 5 && file.buffer.subarray(0, 5).toString('latin1') === '%PDF-';

    if (isPdf && !hasPdfMagic) {
      throw new BadRequestException('File CV không phải là tài liệu PDF hợp lệ');
    }

    const isDocx =
      file.mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const hasZipMagic =
      file.buffer.length >= 4 &&
      file.buffer[0] === 0x50 &&
      file.buffer[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(file.buffer[2]) &&
      [0x04, 0x06, 0x08].includes(file.buffer[3]);

    if (isDocx && !hasZipMagic) {
      throw new BadRequestException('File CV không phải là tài liệu DOCX hợp lệ');
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
