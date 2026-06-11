import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, IsInt } from 'class-validator';

export class CreateShortlistDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  candidateProfileId: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  jobPostId?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
