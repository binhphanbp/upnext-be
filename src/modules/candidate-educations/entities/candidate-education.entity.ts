import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidateEducation {
  @ApiProperty()
  id: string;

  @ApiProperty()
  candidateProfileId: string;

  @ApiProperty()
  schoolName: string;

  @ApiPropertyOptional()
  degree?: string | null;

  @ApiPropertyOptional()
  major?: string | null;

  @ApiPropertyOptional()
  startDate?: Date | null;

  @ApiPropertyOptional()
  endDate?: Date | null;

  @ApiProperty()
  isCurrent: boolean;

  @ApiPropertyOptional()
  gpa?: unknown;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
