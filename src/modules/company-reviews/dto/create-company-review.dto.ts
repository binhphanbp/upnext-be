import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Một đánh giá = 1 số sao tổng thể + 1 ô nhận xét.
 * Các trường chấm điểm theo hạng mục (lương, đào tạo, tăng ca…) đã bị bỏ khỏi hợp đồng
 * API; cột trong DB vẫn còn để giữ dữ liệu cũ nhưng không còn được ghi hay đọc nữa.
 */
export class CreateCompanyReviewDto {
  @ApiProperty({ description: '1-5 scale' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsNotEmpty()
  overallRating: number;

  @ApiPropertyOptional({ description: 'Nhận xét của ứng viên về công ty' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  summary?: string;
}
