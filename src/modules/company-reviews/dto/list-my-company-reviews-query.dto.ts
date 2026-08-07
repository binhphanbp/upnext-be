import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListMyCompanyReviewsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter theo so sao tong the (1-5).',
    minimum: 1,
    maximum: 5,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating?: number;
}
