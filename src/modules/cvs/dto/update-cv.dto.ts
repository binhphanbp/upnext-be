import { ApiPropertyOptional } from '@nestjs/swagger';
import { CvSource, CvStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional({
    example: 2,
    description:
      'Giá trị `version` mà client đã đọc trước đó. Khi có mặt, backend chỉ ghi đè nếu CV chưa bị người khác sửa từ lúc đó — chặn kiểu ghi đè âm thầm khi mở CV ở hai tab cùng lúc. Bỏ trống thì ghi đè không kiểm tra (hành vi cũ).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}
