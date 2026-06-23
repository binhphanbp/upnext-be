import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RescheduleInterviewDto {
  @ApiProperty({ description: 'Mốc thời gian bắt đầu mới', example: '2026-07-02T14:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  scheduledStartAt!: string;

  @ApiProperty({ description: 'Mốc thời gian kết thúc mới', example: '2026-07-02T15:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  scheduledEndAt!: string;

  @ApiPropertyOptional({ description: 'Lý do dời lịch phỏng vấn', example: 'Trùng lịch họp đột xuất với ban giám đốc.' })
  @IsString()
  @IsOptional()
  note?: string;
}
