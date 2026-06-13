import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, IsUUID } from 'class-validator';

export class CreateCompanyReviewDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  applicationId: string;

  @ApiProperty({ description: '1-5 scale' })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsNotEmpty()
  overallRating: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  overtimeSatisfaction?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  overtimeReason?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  whatILove?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  improvementSuggestion?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  salaryBenefitsRating?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  trainingLearningRating?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  managementCareRating?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  cultureFunRating?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  officeWorkspaceRating?: number;
}
