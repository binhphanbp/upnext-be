import { IsEnum, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { CandidateContactPreferenceStatus } from '@prisma/client';

export class UpdateContactPreferenceDto {
  @IsEnum(CandidateContactPreferenceStatus)
  status!: CandidateContactPreferenceStatus;

  @ValidateIf(
    (dto: UpdateContactPreferenceDto) => dto.status === CandidateContactPreferenceStatus.OPTED_IN,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  consentVersion?: string;
}
