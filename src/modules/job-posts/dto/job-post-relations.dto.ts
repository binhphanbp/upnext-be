import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ProficiencyLevel, SkillPriority } from '@prisma/client';

export class AddSkillToJobDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  skillId: string;

  @ApiPropertyOptional()
  @IsOptional()
  minYearsExperience?: number;

  @ApiPropertyOptional({ enum: ProficiencyLevel })
  @IsEnum(ProficiencyLevel)
  @IsOptional()
  proficiencyLevel?: ProficiencyLevel;

  @ApiPropertyOptional({ enum: SkillPriority, default: SkillPriority.REQUIRED })
  @IsEnum(SkillPriority)
  @IsOptional()
  priority?: SkillPriority;
}

export class AddLocationToJobDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  jobLocationId: string;
}

export class AddSpecializationToJobDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  specializationId: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;
}
