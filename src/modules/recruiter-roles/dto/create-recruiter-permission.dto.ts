import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRecruiterPermissionDto {
  @ApiProperty({ maxLength: 100, example: 'job_posts:create' })
  @IsString()
  @MaxLength(100)
  code!: string;

  @ApiProperty({ maxLength: 80, example: 'job_posts' })
  @IsString()
  @MaxLength(80)
  module!: string;

  @ApiProperty({ maxLength: 80, example: 'create' })
  @IsString()
  @MaxLength(80)
  action!: string;

  @ApiPropertyOptional({ example: 'Allows creating new job posts' })
  @IsOptional()
  @IsString()
  description?: string;
}
