import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyMemberStatus } from '@prisma/client';

export class CompanyMemberProfile {
  @ApiProperty({ example: 'Nguyen Van A' })
  fullName!: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  avatarUrl?: string | null;
}

export class CompanyMemberRecruiterAccount {
  @ApiProperty({ example: 'b11eaeff-087f-4677-b8bd-c29ac7e59693' })
  id!: string;

  @ApiProperty({ example: 'recruiter@company.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  status?: string;

  @ApiPropertyOptional({ type: CompanyMemberProfile })
  profile?: CompanyMemberProfile | null;
}

export class CompanyMemberRole {
  @ApiProperty({ example: 'f2d32130-4f55-4517-b8f4-f0ac59a8b2cb' })
  id!: string;

  @ApiProperty({ example: 'hr_manager' })
  code!: string;

  @ApiProperty({ example: 'HR Manager' })
  name!: string;
}

export class CompanyMember {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id!: string;

  @ApiProperty({ enum: CompanyMemberStatus, example: CompanyMemberStatus.ACTIVE })
  status!: CompanyMemberStatus;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  joinedAt!: Date;

  @ApiPropertyOptional({ example: 'recruiter@company.com', nullable: true })
  invitedEmail?: string | null;

  @ApiPropertyOptional({ type: CompanyMemberRecruiterAccount, nullable: true })
  recruiterAccount?: CompanyMemberRecruiterAccount | null;

  @ApiPropertyOptional({ type: CompanyMemberRole, nullable: true })
  role?: CompanyMemberRole | null;
}

export class CompanyMemberInvitation {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id!: string;

  @ApiProperty({ enum: CompanyMemberStatus, example: CompanyMemberStatus.INVITED })
  status!: CompanyMemberStatus;

  @ApiProperty({ example: '2026-06-09T08:00:00.000Z' })
  joinedAt!: Date;

  @ApiProperty({ example: 'recruiter@company.com' })
  invitedEmail!: string;

  @ApiPropertyOptional({ type: CompanyMemberRecruiterAccount, nullable: true })
  recruiterAccount?: CompanyMemberRecruiterAccount | null;

  @ApiPropertyOptional({ type: CompanyMemberRole, nullable: true })
  role?: CompanyMemberRole | null;
}

export class CompanyMemberInvitationStatus {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id!: string;

  @ApiProperty({ enum: CompanyMemberStatus, example: CompanyMemberStatus.ACTIVE })
  status!: CompanyMemberStatus;

  @ApiProperty({ example: '2026-06-09T09:00:00.000Z' })
  updatedAt!: Date;
}

export class CompanyMemberRoleUpdate {
  @ApiProperty({ example: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf' })
  id!: string;

  @ApiProperty({ example: 'f2d32130-4f55-4517-b8f4-f0ac59a8b2cb' })
  roleId!: string;

  @ApiProperty({ type: CompanyMemberRole })
  role!: CompanyMemberRole;
}
