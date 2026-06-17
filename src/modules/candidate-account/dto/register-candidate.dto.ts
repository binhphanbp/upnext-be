import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterCandidateDto {
  @ApiProperty({ example: 'Phan Đức Toàn', maxLength: 150 })
  @IsString()
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'pductoandev@gmail.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'upnext@2026!', minLength: 8, maxLength: 72, writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
