import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'pductoandev@gmail.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;
}
