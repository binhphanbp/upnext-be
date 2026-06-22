import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCandidateLanguageDto {
  @ApiProperty({ example: 'English', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  language: string;

  @ApiProperty({ example: 'Intermediate', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  proficiency: string;
}
