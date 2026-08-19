import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestCandidateEmailVerificationDto {
  @ApiProperty({ example: 'candidate@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
