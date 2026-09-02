import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Khoảng thời gian dùng chung cho các báo cáo phân tích từ khóa. */
export class KeywordAnalyticsQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365, description: 'Số ngày gần nhất' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days = 30;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Ghi đè `days` khi có cả from và to' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-03' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ maxLength: 50, example: 'main_search' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}

export class KeywordTrendQueryDto extends KeywordAnalyticsQueryDto {
  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Chỉ lấy chuỗi thời gian của một từ khóa (canonical). Bỏ trống = toàn hệ thống.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  keyword?: string;
}
