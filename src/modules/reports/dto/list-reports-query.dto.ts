import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái báo cáo',
    enum: ReportStatus,
    example: ReportStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({
    description: 'Lọc theo loại đối tượng bị báo cáo (ví dụ: JOB_POST, COMPANY, CANDIDATE)',
    example: 'JOB_POST',
  })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({
    description: 'Trường sắp xếp (mặc định: createdAt)',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Hướng sắp xếp (asc hoặc desc, mặc định: desc)',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
