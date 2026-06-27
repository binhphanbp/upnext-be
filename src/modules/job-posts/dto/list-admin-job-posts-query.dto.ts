import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus, ModerationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
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
}
