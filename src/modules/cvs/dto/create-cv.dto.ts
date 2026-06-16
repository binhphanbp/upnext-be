import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CvSource, CvStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCvDto {
  @ApiProperty({ example: 'CV Lập trình viên Backend', maxLength: 150, description: 'Tiêu đề CV.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional({ enum: CvSource, default: CvSource.BUILDER, description: 'Nguồn tạo CV.' })
  @IsOptional()
  @IsEnum(CvSource)
  source?: CvSource;

  @ApiPropertyOptional({ enum: CvStatus, default: CvStatus.ACTIVE, description: 'Trạng thái CV.' })
  @IsOptional()
  @IsEnum(CvStatus)
  status?: CvStatus;

  @ApiPropertyOptional({ example: true, default: false, description: 'Đánh dấu CV này là CV mặc định.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
    description: 'UUID của file đã tải lên dùng cho phiên bản CV đầu tiên.',
  })
  @IsOptional()
  @IsUUID()
  sourceFileId?: string;

  @ApiPropertyOptional({
    example: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf',
    description: 'UUID của mẫu CV dùng cho phiên bản CV đầu tiên.',
  })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({
    example: {
      summary: 'Lập trình viên Backend NestJS có 3 năm kinh nghiệm.',
      skills: ['NestJS', 'Prisma', 'PostgreSQL'],
    },
    description: 'Nội dung JSON từ trình tạo CV cho phiên bản CV đầu tiên.',
  })
  @IsOptional()
  @IsObject()
  contentJson?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 'Lập trình viên Backend NestJS có kinh nghiệm với Prisma và PostgreSQL.',
    description: 'Nội dung văn bản đã bóc tách hoặc nhập từ CV.',
  })
  @IsOptional()
  @IsString()
  parsedText?: string;
}
