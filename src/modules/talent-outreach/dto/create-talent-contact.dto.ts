import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTalentContactDto {
  @IsString()
  @MaxLength(100)
  clientRequestId!: string;

  @IsUUID()
  candidateProfileId!: string;

  @IsUUID()
  jobPostId!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  introMessage!: string;
}
