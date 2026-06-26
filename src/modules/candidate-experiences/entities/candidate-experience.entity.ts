import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CandidateExperience {
  @ApiProperty({ example: '3f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiProperty({ example: 'ABC Tech' })
  companyName: string;

  @ApiProperty({ example: 'Backend Developer' })
  positionTitle: string;

  @ApiPropertyOptional({ example: 'Full-time', nullable: true })
  employmentType: string | null;

  @ApiPropertyOptional({ example: '2024-03-01T00:00:00.000Z', nullable: true })
  startDate: Date | null;

  @ApiPropertyOptional({ example: '2025-03-01T00:00:00.000Z', nullable: true })
  endDate: Date | null;

  @ApiProperty({ example: false })
  isCurrent: boolean;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ example: 'NestJS, PostgreSQL, Docker', nullable: true })
  technologies: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;
}
