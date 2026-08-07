import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActorType, ReportStatus } from '@prisma/client';
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
    description:
      'Lọc theo loại đối tượng bị báo cáo (ví dụ: JOB_POST, COMPANY, CANDIDATE, POST, COMPANY_REVIEW)',
    example: 'JOB_POST',
  })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo loại người gửi báo cáo (ứng viên hoặc nhà tuyển dụng)',
    enum: [ActorType.CANDIDATE, ActorType.RECRUITER],
    example: ActorType.RECRUITER,
  })
  @IsOptional()
  @IsIn([ActorType.CANDIDATE, ActorType.RECRUITER])
  reporterRole?: ActorType;

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
