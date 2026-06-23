import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewResult } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateInterviewResultDto {
  @ApiProperty({ enum: InterviewResult, description: 'Kết quả phỏng vấn (PASSED / FAILED)', example: 'PASSED' })
  @IsEnum(InterviewResult)
  @IsNotEmpty()
  result!: InterviewResult;

  @ApiPropertyOptional({ description: 'Nhận xét/ghi chú chi tiết sau phỏng vấn', example: 'Ứng viên giao tiếp tốt, kiến thức technical vững, phù hợp văn hóa.' })
  @IsString()
  @IsOptional()
  feedbackNote?: string;
}
