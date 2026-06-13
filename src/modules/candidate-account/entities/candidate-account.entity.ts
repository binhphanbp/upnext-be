import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus, AuthProvider } from '@prisma/client';

export class CandidateAccount {
  @ApiProperty({ example: 'clx4q8z1j0000u8p4e1o9v6m2' })
  id: string;

  @ApiProperty({ example: 'Phan Van A' })
  fullName: string;

  @ApiProperty({ example: 'aphan@gmail.com' })
  email: string;

  @ApiProperty({ enum: AuthProvider, example: AuthProvider.LOCAL })
  authProvider: AuthProvider;

  @ApiPropertyOptional({ example: 'google-oauth2|1234567890', nullable: true })
  providerUserId: string | null;

  @ApiProperty({ enum: AccountStatus, example: AccountStatus.ACTIVE })
  candidateAccountStatus: AccountStatus;

  @ApiPropertyOptional({ example: '2026-06-09T04:30:00.000Z', nullable: true })
  emailVerifiedAt: Date | null;

  @ApiProperty({ example: '2026-06-09T04:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-06-09T04:30:00.000Z' })
  updatedAt: Date;
}

export class CandidateAccountListMeta {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class CandidateAccountList {
  @ApiProperty({ type: CandidateAccount, isArray: true })
  items: CandidateAccount[];

  @ApiProperty({ type: CandidateAccountListMeta })
  meta: CandidateAccountListMeta;
}
