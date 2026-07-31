import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const HOME_JOB_TABS = ['all', 'remote', 'parttime', 'latest', 'expiring'] as const;

export type HomeJobTab = (typeof HOME_JOB_TABS)[number];

export class HomeQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  jobPage = 1;

  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  jobLimit = 8;

  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topCompaniesLimit = 6;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  latestJobsLimit = 5;
}
