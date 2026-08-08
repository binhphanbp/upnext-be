import { ApiPropertyOptional } from '@nestjs/swagger';
import { ShortlistStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListShortlistQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Chỉ lấy ứng viên do chính tôi lưu (mặc định: cả công ty)',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  mine?: boolean;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái (mặc định: ACTIVE)',
    enum: ShortlistStatus,
  })
  @IsOptional()
  @IsEnum(ShortlistStatus)
  status?: ShortlistStatus;

  @ApiPropertyOptional({ description: 'Chỉ lấy ứng viên được lưu kèm tin tuyển dụng này' })
  @IsOptional()
  @IsUUID()
  jobPostId?: string;
}
