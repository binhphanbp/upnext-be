import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApproveJobPostDto {
  @ApiPropertyOptional({
    description: 'Ghi chú phê duyệt tin tuyển dụng.',
    example: 'Tin tuyển dụng hợp lệ, đầy đủ thông tin.',
  })
  @IsString()
  @IsOptional()
  moderationNote?: string;
}
