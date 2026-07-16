import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RunCvScreeningDto {
  @ApiProperty({ example: '8e10280c-ae2d-4579-a048-c25279447a3e' })
  @IsUUID()
  jobPostId!: string;

  @ApiPropertyOptional({
    example: 100,
    minimum: 1,
    maximum: 200,
    description: 'Only used when the job has more than 100 applications.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    example: 50,
    minimum: 0,
    maximum: 100,
    description: 'Minimum semantic score required before detailed AI scoring.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minScore?: number;
}
