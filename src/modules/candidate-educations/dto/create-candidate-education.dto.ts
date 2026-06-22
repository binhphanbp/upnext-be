import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCandidateEducationDto {
  @ApiProperty({ example: 'Cao đẳng FPT Polytechnic', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  schoolName: string;

  @ApiPropertyOptional({ example: 'Cử nhân', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  degree?: string;

  @ApiPropertyOptional({ example: 'Lập trình web', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  major?: string;

  @ApiPropertyOptional({ example: '2024-07-29' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-29' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ example: 3.5, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  gpa?: number;

  @ApiPropertyOptional({ example: 'Fullstack tại FPT Polytechnic trong vòng 2 năm' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
