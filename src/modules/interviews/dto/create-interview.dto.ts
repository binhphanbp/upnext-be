import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID, Min } from 'class-validator';

export class CreateInterviewDto {
  @ApiProperty({ description: 'ID của Application liên kết phỏng vấn', example: 'd3b07384-d113-4921-a083-200c1e8fe493' })
  @IsUUID()
  @IsNotEmpty()
  applicationId!: string;

  @ApiPropertyOptional({ description: 'ID của Recruiter phụ trách phỏng vấn. Nếu bỏ trống sẽ lấy recruiter hiện tại', example: 'd3b07384-d113-4921-a083-200c1e8fe494' })
  @IsUUID()
  @IsOptional()
  recruiterProfileId?: string;

  @ApiPropertyOptional({ default: 1, description: 'Vòng phỏng vấn', example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  interviewRound?: number;

  @ApiPropertyOptional({ enum: InterviewType, default: 'ONLINE', example: 'ONLINE' })
  @IsEnum(InterviewType)
  @IsOptional()
  type?: InterviewType;

  @ApiProperty({ description: 'Thời gian bắt đầu phỏng vấn', example: '2026-07-01T09:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  scheduledStartAt!: string;

  @ApiProperty({ description: 'Thời gian kết thúc phỏng vấn', example: '2026-07-01T10:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  scheduledEndAt!: string;

  @ApiPropertyOptional({ description: 'Link phòng họp online (Google Meet, Zoom...)', example: 'https://meet.google.com/abc-xyz-mno' })
  @IsUrl()
  @IsOptional()
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'Địa điểm phỏng vấn (nếu ONSITE)', example: 'Tòa nhà Landmark 81, Bình Thạnh, TP.HCM' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ description: 'Ghi chú dành cho Recruiter', example: 'Nhớ check CV và Github dự án của ứng viên trước.' })
  @IsString()
  @IsOptional()
  recruiterNote?: string;

  @ApiPropertyOptional({ description: 'Ghi chú hoặc lời dặn gửi ứng viên', example: 'Mang theo laptop để làm bài test nhỏ.' })
  @IsString()
  @IsOptional()
  candidateNote?: string;
}
