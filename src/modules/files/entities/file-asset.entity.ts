import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FilePurpose, FileVisibility } from '@prisma/client';

export class FileAsset {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  ownerType?: string | null;

  @ApiPropertyOptional()
  ownerId?: string | null;

  @ApiProperty({ enum: FilePurpose })
  purpose: FilePurpose;

  @ApiProperty({ enum: FileVisibility })
  visibility: FileVisibility;

  @ApiProperty()
  storageKey: string;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  sizeBytes: bigint | string;

  @ApiPropertyOptional()
  publicUrl?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class FileUploadResponse {
  @ApiProperty({ example: 'Tải lên thành công' })
  message: string;

  @ApiProperty({ type: FileAsset })
  file: FileAsset;
}

export class MultipleFileUploadResponse {
  @ApiProperty({ example: 'Tải nhiều file lên thành công' })
  message: string;

  @ApiProperty({ type: FileAsset, isArray: true })
  files: FileAsset[];
}
