import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkingModel } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertCandidateJobPreferenceDto {
  @ApiPropertyOptional({ example: 'Backend Developer', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  desiredPosition?: string;

  @ApiPropertyOptional({ example: 25000000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  desiredSalaryMin?: number;

  @ApiPropertyOptional({ example: 35000000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  desiredSalaryMax?: number;

  @ApiPropertyOptional({ example: 'VND', maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  salaryCurrency?: string;

  @ApiPropertyOptional({ enum: WorkingModel })
  @IsOptional()
  @IsEnum(WorkingModel)
  workingModel?: WorkingModel;

  @ApiPropertyOptional({ example: '3f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  @IsOptional()
  @IsUUID()
  desiredLevelId?: string;

  @ApiPropertyOptional({ example: 14, minimum: 0, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  noticePeriodDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRelocate?: boolean;
}
