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
    const upload = await this.cloudinaryService.uploadBuffer(file, {
      folder: purpose.toLowerCase(),
      fileNamePrefix: purpose.toLowerCase(),
      resourceType: 'auto',
      deliveryType: visibility === FileVisibility.PRIVATE ? 'authenticated' : 'upload',
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
