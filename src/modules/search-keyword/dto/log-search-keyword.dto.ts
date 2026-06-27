import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength, MaxLength } from 'class-validator';

export class LogSearchKeywordDto {
  @ApiProperty({ minLength: 2, maxLength: 255, example: 'React JS' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  @MaxLength(255)
  keyword!: string;

  @ApiPropertyOptional({ maxLength: 50, example: 'home_search' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsInt()
  @Min(0)
  resultCount?: number;

  @ApiPropertyOptional({ maxLength: 255, example: 'session-id-123' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sessionId?: string;
}
