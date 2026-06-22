import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, JobSearchStatus, ProfileVisibility } from '@prisma/client';
import { CandidateCertification } from '../../candidate-certifications/entities/candidate-certification.entity';
import { CandidateEducation } from '../../candidate-educations/entities/candidate-education.entity';
import { CandidateLanguage } from '../../candidate-languages/entities/candidate-language.entity';
import { CandidateLink } from '../../candidate-links/entities/candidate-link.entity';
import { CandidateProject } from '../../candidate-projects/entities/candidate-project.entity';

export class CandidateProfileAccount {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiProperty({ example: 'Phan Van A' })
  fullName: string;

  @ApiProperty({ example: 'pductoandev@gmail.com' })
  email: string;
}

export class CandidateProfile {
  @ApiProperty({ example: '2f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id: string;

  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  candidateAccountId: string;

  @ApiPropertyOptional({ example: '+84-912-345-678', nullable: true })
  phoneNumber: string | null;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  gender: Gender | null;

  @ApiPropertyOptional({ example: 'Ho Chi Minh City, Vietnam', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ example: '2000-01-01T00:00:00.000Z', nullable: true })
  birthdate: Date | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: JobSearchStatus })
  jobSearchStatus: JobSearchStatus;

  @ApiProperty({ enum: ProfileVisibility })
  profileVisibility: ProfileVisibility;

  @ApiProperty({ example: '2026-06-09T04:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-06-09T04:30:00.000Z' })
  updatedAt: Date;

  @ApiPropertyOptional({ type: CandidateProfileAccount })
  account?: CandidateProfileAccount;

  @ApiPropertyOptional({ type: CandidateEducation, isArray: true })
  educations?: CandidateEducation[];

  @ApiPropertyOptional({ type: CandidateProject, isArray: true })
  projects?: CandidateProject[];

  @ApiPropertyOptional({ type: CandidateCertification, isArray: true })
  certifications?: CandidateCertification[];

  @ApiPropertyOptional({ type: CandidateLanguage, isArray: true })
  languages?: CandidateLanguage[];

  @ApiPropertyOptional({ type: CandidateLink, isArray: true })
  links?: CandidateLink[];
}
