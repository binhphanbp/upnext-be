import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus, ModerationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListAdminJobPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter theo trang thai hien tai cua tin tuyen dung.',
    enum: JobStatus,
    example: JobStatus.PUBLISHED,
  })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @ApiPropertyOptional({
    description: 'Filter theo trang thai kiem duyet cua tin tuyen dung.',
    enum: ModerationStatus,
    example: ModerationStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ModerationStatus)
  moderationStatus?: ModerationStatus;

  @ApiPropertyOptional({
    description: 'Filter theo UUID cong ty.',
    example: '8e10280c-ae2d-4579-a048-c25279447a3e',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Filter theo UUID loai hinh lam viec.',
    example: '2f0b9a52-9a5f-4d1a-9f8b-5f2b0f7f0a11',
  })
  @IsOptional()
  @IsUUID()
  employmentTypeId?: string;

  @ApiPropertyOptional({
    description: 'Filter theo tinh/thanh pho cua dia diem lam viec.',
    example: 'Ho Chi Minh',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}
