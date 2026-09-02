import { ApiPropertyOptional } from '@nestjs/swagger';
import { PopularSearchKeywordPlacement } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetPopularKeywordsDto {
  @ApiPropertyOptional({
    enum: PopularSearchKeywordPlacement,
    default: PopularSearchKeywordPlacement.HOME_HERO,
    description: 'Chỗ hiển thị chip: trang chủ hay trang việc làm',
  })
  @IsOptional()
  @IsEnum(PopularSearchKeywordPlacement)
  placement?: PopularSearchKeywordPlacement;

  @ApiPropertyOptional({ enum: ['vi', 'en'], default: 'vi' })
  @IsOptional()
  @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';

  @ApiPropertyOptional({ default: 24, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 24;
}
