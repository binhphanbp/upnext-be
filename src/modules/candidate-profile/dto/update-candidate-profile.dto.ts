import { Transform, type TransformFnParams } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, JobSearchStatus, ProfileVisibility } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  normalizeVietnamesePhoneNumber,
  VIETNAMESE_PHONE_PATTERN,
} from '../../../common/validation/vietnamese-phone';

export class UpdateCandidateProfileDto {
  @ApiPropertyOptional({ example: '0916110241', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? normalizeVietnamesePhoneNumber(value) : value,
  )
  @Matches(VIETNAMESE_PHONE_PATTERN, {
    message: 'Số điện thoại Việt Nam chưa hợp lệ',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    example: '688 Quang trung, Phường thông tây hội, Thành phố Hồ Chí Minh',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Thành phố Hồ Chí Minh', maxLength: 100, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredSearchCity?: string | null;

  @ApiPropertyOptional({ example: '2000-01-01' })
  @IsOptional()
  @IsDateString()
  birthdate?: string;

  @ApiPropertyOptional({ example: 'Tôi là một developer.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: JobSearchStatus })
  @IsOptional()
  @IsEnum(JobSearchStatus)
  jobSearchStatus?: JobSearchStatus;

  @ApiPropertyOptional({ enum: ProfileVisibility })
  @IsOptional()
  @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;
}
