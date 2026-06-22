import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActorType, FilePurpose, FileVisibility } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({ enum: FilePurpose, default: FilePurpose.OTHER })
  @IsOptional()
  @IsEnum(FilePurpose)
  purpose?: FilePurpose;

  @ApiPropertyOptional({ enum: FileVisibility, default: FileVisibility.PRIVATE })
  @IsOptional()
  @IsEnum(FileVisibility)
  visibility?: FileVisibility;

  @ApiPropertyOptional({ example: 'candidate_profile', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  ownerType?: string;

  @ApiPropertyOptional({ description: 'UUID của chủ sở hữu. Mặc định là id của người dùng hiện tại.' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ enum: ActorType })
  @IsOptional()
  @IsEnum(ActorType)
  actorType?: ActorType;
}
