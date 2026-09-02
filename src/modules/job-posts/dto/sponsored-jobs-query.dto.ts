import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobBoostPlacement } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class SponsoredJobsQueryDto {
  @ApiProperty({ enum: JobBoostPlacement, description: 'Vị trí hiển thị đang gọi.' })
  @IsEnum(JobBoostPlacement)
  placement: JobBoostPlacement;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm hiện tại của người dùng, nếu có.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @ApiPropertyOptional({ description: 'Địa điểm đang lọc, nếu có.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
}
