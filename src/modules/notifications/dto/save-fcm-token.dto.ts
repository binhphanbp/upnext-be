import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveFcmTokenDto {
  @ApiProperty({
    description: 'The FCM registration token from Firebase client SDK',
    example: 'dG9rZW4tMTIzNDU2Nzg5MA==',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description: 'The device type registering the token',
    example: 'web',
  })
  @IsString()
  @IsOptional()
  deviceType?: string;
}
