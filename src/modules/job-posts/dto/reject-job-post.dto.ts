import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectJobPostDto {
  @ApiProperty({
    description: 'Lý do từ chối duyệt tin tuyển dụng.',
    example: 'Nội dung tuyển dụng không đúng quy định hoặc thiếu thông tin cần thiết.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống.' })
  reason!: string;
}
