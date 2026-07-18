import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class TalentContactActionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reasonCode?: string;
}
