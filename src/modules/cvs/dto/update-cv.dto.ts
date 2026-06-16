import { ApiPropertyOptional } from '@nestjs/swagger';
import { CvSource, CvStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCvDto {
  @ApiPropertyOptional({
    example: 'CV Lập trình viên Backend - Cập nhật',
    maxLength: 150,
    description: 'Tiêu đề CV.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ enum: CvSource, description: 'Nguồn tạo CV.' })
  @IsOptional()
  @IsEnum(CvSource)
  source?: CvSource;

  @ApiPropertyOptional({ enum: CvStatus, description: 'Trạng thái CV.' })
  @IsOptional()
  @IsEnum(CvStatus)
  status?: CvStatus;

  @ApiPropertyOptional({ example: true, description: 'Đánh dấu CV này là CV mặc định.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
