import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, IsDateString } from 'class-validator';

export enum SearchRange {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export class GetTopSearchKeywordsDto {
  @ApiPropertyOptional({ enum: SearchRange, default: SearchRange.WEEK })
  @IsOptional()
  @IsEnum(SearchRange)
  range?: SearchRange;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-06-27' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @ApiPropertyOptional({ example: 'home_search' })
  @IsOptional()
  @IsString()
  source?: string;
}
