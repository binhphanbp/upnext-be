import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateCandidateProjectDto {
  @ApiProperty({ example: 'UpNext Job Portal', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Backend Developer', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  role?: string;

  @ApiPropertyOptional({ example: 'Built REST APIs and authentication flows.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'https://github.com/example/upnext' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  projectUrl?: string;

  @ApiPropertyOptional({ example: 'NestJS, Prisma, PostgreSQL' })
  @IsOptional()
  @IsString()
  technologies?: string;

  @ApiPropertyOptional({ example: 'https://upnext.works' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  deployUrl?: string;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-06-01' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
