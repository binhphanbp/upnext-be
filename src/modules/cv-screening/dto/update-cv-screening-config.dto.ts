import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const ALLOWED_DEFAULT_TOP_N = [10, 20, 50] as const;

export class UpdateCvScreeningConfigDto {
  @ApiPropertyOptional({
    example: 'Ưu tiên ứng viên có chứng chỉ AWS, không yêu cầu bằng đại học.',
    maxLength: 2000,
    description:
      'Free-text guidance appended to the AI scoring prompt. Send null/omit to clear it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customInstructions?: string | null;

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
