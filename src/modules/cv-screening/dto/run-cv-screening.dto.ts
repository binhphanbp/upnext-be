import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RunCvScreeningDto {
  @ApiProperty({ example: '8e10280c-ae2d-4579-a048-c25279447a3e' })
  @IsUUID()
  jobPostId!: string;

  @ApiPropertyOptional({
    example: 200,
    minimum: 1,
    maximum: 200,
    description:
      'Optional cost cap on how many applications this run scores. Omit to score every application (capped at 200).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
