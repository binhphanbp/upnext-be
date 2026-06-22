import { ApiProperty } from '@nestjs/swagger';

export class CandidateLanguage {
  @ApiProperty()
  id: string;

  @ApiProperty()
  candidateProfileId: string;

  @ApiProperty()
  language: string;

  @ApiProperty()
  proficiency: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
