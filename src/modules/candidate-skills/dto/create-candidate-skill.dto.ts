import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProficiencyLevel } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateCandidateSkillDto {
  @ApiProperty({ example: '3f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  @IsUUID()
  skillId: string;

  @ApiPropertyOptional({ enum: ProficiencyLevel, default: ProficiencyLevel.INTERMEDIATE })
  @IsOptional()
  @IsEnum(ProficiencyLevel)
  proficiencyLevel?: ProficiencyLevel;

  @ApiPropertyOptional({ example: 2.5, minimum: 0, maximum: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
