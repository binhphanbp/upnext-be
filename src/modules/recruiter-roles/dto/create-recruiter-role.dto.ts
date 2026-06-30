import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRecruiterRoleDto {
  @ApiPropertyOptional({ maxLength: 80, example: 'accounting' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiProperty({ maxLength: 120, example: 'HR Manager' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Manages recruitment and HR operations' })
  @IsOptional()
  @IsString()
  description?: string;
}
