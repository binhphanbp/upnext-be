import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActorType, FilePurpose, FileVisibility } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({ enum: FilePurpose, default: FilePurpose.OTHER })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(FilePurpose)
  purpose?: FilePurpose;

  @ApiPropertyOptional({ enum: FileVisibility, default: FileVisibility.PRIVATE })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(FileVisibility)
  visibility?: FileVisibility;

  @ApiPropertyOptional({ example: 'candidate_profile', maxLength: 50 })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @MaxLength(50)
  ownerType?: string;

  @ApiPropertyOptional({
    description: 'UUID của chủ sở hữu. Mặc định là id của người dùng hiện tại.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ enum: ActorType })
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(ActorType)
  actorType?: ActorType;
}
