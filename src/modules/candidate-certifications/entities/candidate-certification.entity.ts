import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidateCertification {
  @ApiProperty()
  id: string;

  @ApiProperty()
  candidateProfileId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  organization?: string | null;

  @ApiPropertyOptional()
  issuedDate?: Date | null;

  @ApiPropertyOptional()
  expiredDate?: Date | null;

  @ApiPropertyOptional()
  credentialUrl?: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
