import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InterviewType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum BatchSchedulingMode {
  /** Back-to-back slots: 9:00, 9:30, 10:00… One interviewer, one candidate at a time. */
  SEQUENTIAL = 'SEQUENTIAL',
  /** Everyone at the same time, for panels running in parallel rooms. */
  SAME_SLOT = 'SAME_SLOT',
}

export class CreateBatchInterviewsDto {
  @ApiProperty({ description: 'Tin tuyển dụng mà loạt phỏng vấn này thuộc về' })
  @IsUUID()
  @IsNotEmpty()
  jobPostId!: string;

  @ApiProperty({
    description: 'Danh sách hồ sơ ứng viên cần đặt lịch, theo đúng thứ tự muốn xếp slot',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  // Each candidate costs several queries plus an email, so one request stays bounded.
  @ArrayMaxSize(30)
  @IsUUID(undefined, { each: true })
  candidateProfileIds!: string[];

  @ApiProperty({ description: 'Thời điểm bắt đầu của slot đầu tiên' })
  @IsDateString()
  @IsNotEmpty()
  startAt!: string;

  @ApiProperty({ description: 'Độ dài mỗi buổi phỏng vấn, tính bằng phút', example: 30 })
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @ApiPropertyOptional({
    description: 'Khoảng nghỉ giữa hai slot liên tiếp, tính bằng phút',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  gapMinutes?: number;

  @ApiPropertyOptional({ enum: BatchSchedulingMode, default: BatchSchedulingMode.SEQUENTIAL })
  @IsOptional()
  @IsEnum(BatchSchedulingMode)
  mode?: BatchSchedulingMode;

  @ApiPropertyOptional({ default: 1, description: 'Vòng phỏng vấn' })
  @IsOptional()
  @IsInt()
  @Min(1)
  interviewRound?: number;

  @ApiPropertyOptional({ enum: InterviewType, default: InterviewType.ONLINE })
  @IsOptional()
  @IsEnum(InterviewType)
  type?: InterviewType;

  @ApiPropertyOptional({ description: 'ID recruiter phụ trách, mặc định là người gọi API' })
  @IsOptional()
  @IsUUID()
  recruiterProfileId?: string;

  @ApiPropertyOptional({ description: 'Link phòng họp dùng chung cho cả loạt' })
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiPropertyOptional({ description: 'Địa điểm phỏng vấn nếu ONSITE' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ cho recruiter' })
  @IsOptional()
  @IsString()
  recruiterNote?: string;

  @ApiPropertyOptional({ description: 'Lời dặn gửi ứng viên' })
  @IsOptional()
  @IsString()
  candidateNote?: string;
}
