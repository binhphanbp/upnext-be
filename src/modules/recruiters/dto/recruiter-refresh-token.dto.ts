import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RecruiterRefreshTokenDto {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf.0ucf7w...' })
  @IsString()
  @MinLength(20)
  refreshToken: string;
}
