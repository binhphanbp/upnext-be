import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class JobBoostMetricsQueryDto {
  @ApiPropertyOptional({ description: 'Từ ngày (bao gồm), ISO 8601.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'Đến ngày (bao gồm), ISO 8601.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
