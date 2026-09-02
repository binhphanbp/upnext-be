import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MagicLinkLoginDto {
  @ApiProperty({ description: 'Token lấy từ link trong email gửi nhà tuyển dụng' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
