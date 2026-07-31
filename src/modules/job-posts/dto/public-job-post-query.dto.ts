import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PublicJobPostQueryDto {
  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm trong tiêu đề, mô tả, công ty và kỹ năng.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @ApiPropertyOptional({ description: 'Tỉnh/thành phố làm việc.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;
}
