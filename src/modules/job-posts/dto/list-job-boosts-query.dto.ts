import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobBoostStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListJobBoostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: JobBoostStatus, description: 'Lọc theo trạng thái boost.' })
  @IsOptional()
  @IsEnum(JobBoostStatus)
  status?: JobBoostStatus;
}
