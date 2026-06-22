import { ApiProperty } from '@nestjs/swagger';

export class CandidateLink {
  @ApiProperty()
  id: string;

  @ApiProperty()
  candidateProfileId: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
