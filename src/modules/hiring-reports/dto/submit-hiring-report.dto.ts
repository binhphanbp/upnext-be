import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class SubmitHiringReportDto {
  @ApiProperty({ example: 2, description: 'Số lượng ứng viên đã tuyển được cho tin này' })
  @IsInt()
  @Min(0)
  totalHired!: number;

  @ApiProperty({ example: 34, description: 'Tổng số hồ sơ ứng tuyển đã nhận cho tin này' })
  @IsInt()
  @Min(0)
  totalApplications!: number;

  @ApiPropertyOptional({ description: 'Ghi chú thêm về kết quả tuyển dụng' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
