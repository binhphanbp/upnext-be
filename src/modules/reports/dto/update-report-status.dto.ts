import { ApiProperty } from '@nestjs/swagger';
import { ReportStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateReportStatusDto {
  @ApiProperty({ enum: ReportStatus, description: 'Trạng thái mới của báo cáo' })
  @IsNotEmpty()
  @IsEnum(ReportStatus)
  status: ReportStatus;
}
