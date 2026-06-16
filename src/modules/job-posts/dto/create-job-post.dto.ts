import { IsBoolean, IsDecimal, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalaryPeriod } from '@prisma/client';

export class CreateJobPostDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  requirements?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  benefits?: string;

  @ApiPropertyOptional()
  @IsOptional()
  salaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  salaryMax?: number;

  @ApiPropertyOptional({ default: 'VND' })
  @IsString()
  @IsOptional()
  salaryCurrency?: string;

  @ApiPropertyOptional({ enum: SalaryPeriod, default: SalaryPeriod.MONTH })
  @IsOptional()
  salaryPeriod?: SalaryPeriod;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  salaryIsNegotiable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  salaryIsVisible?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  vacanciesCount?: number;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  jobCategoryId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  experienceLevelId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  employmentTypeId?: string;
}
