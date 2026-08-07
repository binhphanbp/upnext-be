import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListCompanyReviewReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái báo cáo',
    enum: ReportStatus,
    example: ReportStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
