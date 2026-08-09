import { Transform, type TransformFnParams } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, JobSearchStatus, ProfileVisibility } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import {
  INTERNATIONAL_PHONE_PATTERN,
  normalizeInternationalPhoneNumber,
} from '../../../common/validation/phone';

export class UpdateCandidateProfileDto {
  @ApiPropertyOptional({
    example: '+1 202 555 0123',
    description:
      'Số điện thoại liên hệ gồm 7–15 chữ số; hỗ trợ số nội địa và định dạng quốc tế có mã quốc gia.',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? normalizeInternationalPhoneNumber(value) : value,
  )
  @Matches(INTERNATIONAL_PHONE_PATTERN, {
    message: 'Vui lòng nhập số điện thoại hợp lệ gồm 7–15 chữ số, có thể kèm mã quốc gia.',
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
