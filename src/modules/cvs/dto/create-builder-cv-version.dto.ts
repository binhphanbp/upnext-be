import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CvStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A Builder save is an immutable snapshot, not an in-place mutation of the
 * version used by an application. `expectedVersion` protects the CV aggregate
 * when the same Builder CV is open in more than one tab.
 */
export class CreateBuilderCvVersionDto {
  @ApiProperty({ description: 'Nội dung CV từ CV Builder.' })
  @IsObject()
  contentJson!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Bản văn bản dùng cho tìm kiếm và AI.' })
  @IsOptional()
  @IsString()
  parsedText?: string;

  @ApiPropertyOptional({ maxLength: 150, description: 'Tên CV sau khi lưu.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ enum: CvStatus, description: 'DRAFT hoặc ACTIVE.' })
  @IsOptional()
  @IsEnum(CvStatus)
  status?: CvStatus;

  @ApiProperty({ example: 3, description: 'Version của CV mà client vừa đọc.' })
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
