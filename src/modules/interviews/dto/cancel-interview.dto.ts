import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CancelInterviewDto {
  @ApiProperty({
    description: 'Lý do hủy lịch phỏng vấn',
    example: 'Ứng viên đã chấp nhận offer khác hoặc recruiter bận công tác dài ngày.',
  })
  @IsString()
  @IsNotEmpty()
  note!: string;
}
