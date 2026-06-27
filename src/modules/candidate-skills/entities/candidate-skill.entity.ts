import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProficiencyLevel } from '@prisma/client';

export class CandidateSkillSkill {
  @ApiProperty({ example: '3f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiProperty({ example: 'NestJS' })
  name: string;
}

export class CandidateSkill {
  @ApiProperty({ example: '3f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiProperty({ example: '3f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  skillId: string;

  @ApiProperty({ enum: ProficiencyLevel })
  proficiencyLevel: ProficiencyLevel;

  @ApiPropertyOptional({ example: 2.5, nullable: true })
  yearsOfExperience: number | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiPropertyOptional({ type: CandidateSkillSkill })
  skill?: CandidateSkillSkill;
}
