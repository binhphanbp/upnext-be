import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSpecializationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: 'Unique slug e.g. backend-development. Derived from the name when omitted.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  slug?: string;
}
