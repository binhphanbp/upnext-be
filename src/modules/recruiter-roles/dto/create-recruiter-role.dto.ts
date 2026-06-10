import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRecruiterRoleDto {
  @ApiProperty({ maxLength: 80, example: 'hr_manager' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ maxLength: 120, example: 'HR Manager' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Manages recruitment and HR operations' })
  @IsOptional()
  @IsString()
  description?: string;
}
