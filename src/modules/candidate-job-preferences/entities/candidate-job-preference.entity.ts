import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkingModel } from '@prisma/client';

export class CandidateJobPreference {
  @ApiProperty({ example: '3f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiPropertyOptional({ example: 'Backend Developer', nullable: true })
  desiredPosition: string | null;

  @ApiPropertyOptional({ example: 25000000, nullable: true })
  desiredSalaryMin: number | null;

  @ApiPropertyOptional({ example: 35000000, nullable: true })
  desiredSalaryMax: number | null;

  @ApiProperty({ example: 'VND' })
  salaryCurrency: string;

  @ApiPropertyOptional({ enum: WorkingModel, nullable: true })
  workingModel: WorkingModel | null;

  @ApiPropertyOptional({ example: '3f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf', nullable: true })
  desiredLevelId: string | null;

  @ApiPropertyOptional({ example: 14, nullable: true })
  noticePeriodDays: number | null;

  @ApiProperty({ example: false })
  isRelocate: boolean;
}
