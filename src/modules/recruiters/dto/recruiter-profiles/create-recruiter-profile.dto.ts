import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

export class CreateRecruiterProfileDto {
  @ApiProperty({ maxLength: 150, example: 'Nguyen Van A' })
  @IsString()
  @MaxLength(150)
  fullName!: string;

  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  @IsUUID()
  recruiterAccountId!: string;

  @ApiPropertyOptional({ maxLength: 30, example: '+84-912-345-678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: 'https://cdn.upnext.dev/avatars/abc.jpg' })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  avatarUrl?: string;
}
