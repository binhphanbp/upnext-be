import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCandidateExperienceDto {
  @ApiProperty({ example: 'ABC Tech', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName: string;

  @ApiProperty({ example: 'Backend Developer', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  positionTitle: string;

  @ApiPropertyOptional({ example: 'Full-time', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  employmentType?: string;

  @ApiPropertyOptional({ example: '2024-03-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-03-01' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ example: 'Built APIs and optimized database queries.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'NestJS, PostgreSQL, Docker' })
  @IsOptional()
  @IsString()
  technologies?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
