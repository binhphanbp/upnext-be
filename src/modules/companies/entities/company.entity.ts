import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CompanyStatus,
  CompanyType,
  CompanyVerificationStatus,
  JobStatus,
} from '@prisma/client';

export class CompanyUploadedFile {
  @ApiProperty({ example: '08a32cbe-6078-4313-b916-358a922d4cfe' })
  id!: string;

  @ApiProperty({ example: 'logo.png' })
  originalName!: string;

  @ApiProperty({ example: 'image/png' })
  mimeType!: string;

  @ApiProperty({ example: '24567' })
  sizeBytes!: string;

  @ApiProperty({
    example:
      'uploads/companies/1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf/logo-uuid.png',
  })
  storageKey!: string;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/dfvaxlkol/image/upload/v1719273600/companies/1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf/logo.png',
  })
  publicUrl?: string | null;
}

export class Company {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id!: string;

  @ApiPropertyOptional({ example: '08a32cbe-6078-4313-b916-358a922d4cfe' })
  logoFileId?: string | null;

  @ApiPropertyOptional({ type: CompanyUploadedFile })
  logoFile?: CompanyUploadedFile | null;

  @ApiProperty({ example: 'Công ty cổ phần UPNEXT Việt Nam' })
  name!: string;

  @ApiProperty({ enum: CompanyType, example: CompanyType.STARTUP })
  type!: CompanyType;

  @ApiPropertyOptional({ example: '068208005345' })
  taxCode?: string | null;

  @ApiPropertyOptional({
    example:
      '688 Quang Trung, Thông Tây Hội, Thành Phố Hồ Chí Minh',
  })
  address?: string | null;

  @ApiPropertyOptional({ example: 'info@upnext.works' })
  email?: string | null;

  @ApiPropertyOptional({ example: '+84-916-110-241' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'https://upnext.works' })
  website?: string | null;

  @ApiPropertyOptional({
    example:
      'Công ty công nghệ tập trung vào các sản phẩm nền tảng tuyển dụng',
  })
  description?: string | null;

  @ApiPropertyOptional({ example: '51-200 nhân sự' })
  companySize?: string | null;

  @ApiProperty({
    enum: CompanyVerificationStatus,
    example: CompanyVerificationStatus.UNVERIFIED,
  })
  verificationStatus!: CompanyVerificationStatus;

  @ApiProperty({ example: '0' })
  reputationScore!: string;

  @ApiProperty({ enum: CompanyStatus, example: CompanyStatus.ACTIVE })
  status!: CompanyStatus;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  updatedAt!: Date;
}

export class CompanyListItem {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id!: string;

  @ApiPropertyOptional({ example: '08a32cbe-6078-4313-b916-358a922d4cfe' })
  logoFileId?: string | null;

  @ApiPropertyOptional({ type: CompanyUploadedFile })
  logoFile?: CompanyUploadedFile | null;

  @ApiProperty({ example: 'Công ty cổ phần UPNEXT Việt Nam' })
  name!: string;

  @ApiProperty({ enum: CompanyType, example: CompanyType.STARTUP })
  type!: CompanyType;

  @ApiPropertyOptional({ example: 'info@upnext.works' })
  email?: string | null;

  @ApiPropertyOptional({ example: 'https://upnext.works' })
  website?: string | null;

  @ApiProperty({ enum: CompanyStatus, example: CompanyStatus.ACTIVE })
  status!: CompanyStatus;

  @ApiProperty({
    enum: CompanyVerificationStatus,
    example: CompanyVerificationStatus.VERIFIED,
  })
  verificationStatus!: CompanyVerificationStatus;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  updatedAt!: Date;
}

export class CompanyListMeta {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}

export class CompanyList {
  @ApiProperty({ type: [CompanyListItem] })
  items!: CompanyListItem[];

  @ApiProperty({ type: CompanyListMeta })
  meta!: CompanyListMeta;
}

export class CompanyDetail extends Company {
  @ApiProperty({ type: [Object] })
  members!: object[];

  @ApiProperty({ type: [Object] })
  recruiterAccounts!: object[];

  @ApiProperty({ type: [Object] })
  jobPosts!: object[];
}

export class CompanyJobRelation {
  @ApiProperty({ example: 'f2d32130-4f55-4517-b8f4-f0ac59a8b2cb' })
  id!: string;

  @ApiProperty({ example: 'Full-time' })
  name!: string;

  @ApiPropertyOptional({ example: 'junior' })
  code?: string;
}

export class CompanyJob {
  @ApiProperty({ example: '5c4c2613-912b-4d98-99e9-0f8fe7d0f7be' })
  id!: string;

  @ApiProperty({ example: 'Backend NestJS Engineer' })
  title!: string;

  @ApiProperty({ example: 'backend-nestjs-engineer' })
  slug!: string;

  @ApiProperty({ enum: JobStatus, example: JobStatus.PUBLISHED })
  status!: JobStatus;

  @ApiPropertyOptional({ example: '15000000' })
  salaryMin?: string | null;

  @ApiPropertyOptional({ example: '30000000' })
  salaryMax?: string | null;

  @ApiPropertyOptional({ type: CompanyJobRelation })
  employmentType?: CompanyJobRelation | null;

  @ApiPropertyOptional({ type: CompanyJobRelation })
  experienceLevel?: CompanyJobRelation | null;
}

export class CompanyUpdateResponse {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id!: string;

  @ApiProperty({ example: 'Công ty cổ phần UPNEXT Việt Nam' })
  name!: string;

  @ApiPropertyOptional({ example: 'https://upnext.works' })
  website?: string | null;

  @ApiProperty({ example: '2026-06-09T09:00:00.000Z' })
  updatedAt!: Date;
}

export class CompanyFileUploadResponse {
  @ApiProperty({ example: 'Tải lên logo công ty thành công' })
  message!: string;

  @ApiProperty({ type: CompanyUploadedFile })
  file!: CompanyUploadedFile;
}
