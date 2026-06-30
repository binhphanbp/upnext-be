import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { WorkingModel } from '@prisma/client';

export class CreateJobLocationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ default: 'Vietnam' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ enum: WorkingModel })
  @IsEnum(WorkingModel)
  @IsNotEmpty()
  workingModel: WorkingModel;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  longitude?: number;
}
