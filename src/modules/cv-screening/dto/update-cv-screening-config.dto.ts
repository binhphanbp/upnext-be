import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const ALLOWED_DEFAULT_TOP_N = [10, 20, 50] as const;
const INSTRUCTIONS_MAX_LENGTH = 500;

export class UpdateCvScreeningConfigDto {
  @ApiPropertyOptional({
    example: 'Ưu tiên ứng viên có kinh nghiệm Docker, Kubernetes.',
    maxLength: INSTRUCTIONS_MAX_LENGTH,
    description:
      'Guidance for the "skills" rubric group, appended to the AI scoring prompt. Send null/omit to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(INSTRUCTIONS_MAX_LENGTH)
  skillsInstructions?: string | null;

  @ApiPropertyOptional({
    example: 'Ít nhất 3 năm kinh nghiệm ngành fintech.',
    maxLength: INSTRUCTIONS_MAX_LENGTH,
    description: 'Guidance for the "experience" rubric group, appended to the AI scoring prompt.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(INSTRUCTIONS_MAX_LENGTH)
  experienceInstructions?: string | null;

  @ApiPropertyOptional({
    example: 'Ưu tiên ứng viên có đóng góp dự án mã nguồn mở.',
    maxLength: INSTRUCTIONS_MAX_LENGTH,
    description: 'Guidance for the "projects" rubric group, appended to the AI scoring prompt.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(INSTRUCTIONS_MAX_LENGTH)
  projectsInstructions?: string | null;

  @ApiPropertyOptional({
    example: false,
    description:
      'When true, every run for this company scores education as if the job required none (always full marks) -- education is scored deterministically from the job\'s required level, not by the LLM, so this is the one functional education lever.',
  })
  @IsOptional()
  @IsBoolean()
  ignoreEducationRequirement?: boolean;

  @ApiPropertyOptional({
    example: 20,
    enum: ALLOWED_DEFAULT_TOP_N,
    description:
      'Default "Top N" shortlist size when a run omits `limit`. null = score every application.',
  })
  @IsOptional()
  @IsIn(ALLOWED_DEFAULT_TOP_N)
  defaultTopN?: number | null;

  @ApiPropertyOptional({
    example: 60,
    minimum: 0,
    maximum: 100,
    description:
      'Minimum embedding similarity score (0-100) a CV must clear to enter the shortlist. null = no threshold.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minSimilarityScore?: number | null;
}
