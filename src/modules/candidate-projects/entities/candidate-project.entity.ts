import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidateProject {
  @ApiProperty()
  id: string;

  @ApiProperty()
  candidateProfileId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  role?: string | null;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional()
  projectUrl?: string | null;

  @ApiPropertyOptional()
  technologies?: string | null;

  @ApiPropertyOptional()
  deployUrl?: string | null;

  @ApiPropertyOptional()
  startDate?: Date | null;

  @ApiPropertyOptional()
  endDate?: Date | null;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
