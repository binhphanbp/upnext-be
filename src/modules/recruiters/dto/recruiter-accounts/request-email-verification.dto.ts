import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestRecruiterEmailVerificationDto {
  @ApiProperty({ example: 'recruiter@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
