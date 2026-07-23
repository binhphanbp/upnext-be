import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BanCompanyFraudDto {
  @ApiProperty({
    example: 'Phát hiện đăng tin tuyển dụng lừa đảo, thu phí ứng viên trái phép.',
    description: 'Lý do ban vĩnh viễn công ty và đưa MST vào blacklist',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
