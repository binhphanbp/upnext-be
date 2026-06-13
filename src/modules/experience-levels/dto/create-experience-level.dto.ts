import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateExperienceLevelDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unique code e.g. JUNIOR, SENIOR' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
