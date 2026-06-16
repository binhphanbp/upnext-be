import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';

export class ApplicationEntity {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id!: string;

  @ApiProperty({ example: '8e10280c-ae2d-4579-a048-c25279447a3e' })
  jobPostId!: string;

  @ApiProperty({ example: '3c10280c-ae2d-4579-a048-c25279447a3f' })
  candidateProfileId!: string;

  @ApiProperty({ example: '2a3b4c5d-50d7-4f24-a65f-4f2a4d42f9cf' })
  cvVersionId!: string;

  @ApiPropertyOptional({ example: 'I am highly interested in this role.', nullable: true })
  coverLetter!: string | null;

  @ApiProperty({ enum: ApplicationStatus, example: ApplicationStatus.SUBMITTED })
  status!: ApplicationStatus;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  submittedAt!: Date;

  @ApiPropertyOptional({ example: '2026-06-09T09:00:00.000Z', nullable: true })
  viewedAt!: Date | null;

  @ApiPropertyOptional({ example: '2026-06-09T10:00:00.000Z', nullable: true })
  rejectedAt!: Date | null;

  @ApiPropertyOptional({ example: '2026-06-09T11:00:00.000Z', nullable: true })
  hiredAt!: Date | null;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  updatedAt!: Date;
}

export class ApplicationListMeta {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class ApplicationList {
  @ApiProperty({ type: ApplicationEntity, isArray: true })
  items!: ApplicationEntity[];

  @ApiProperty({ type: ApplicationListMeta })
  meta!: ApplicationListMeta;
}

export class CheckAppliedJobResponse {
  @ApiProperty({ example: true })
  applied!: boolean;

  @ApiPropertyOptional({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  applicationId?: string;

  @ApiPropertyOptional({ enum: ApplicationStatus, example: ApplicationStatus.SUBMITTED })
  status?: ApplicationStatus;
}
