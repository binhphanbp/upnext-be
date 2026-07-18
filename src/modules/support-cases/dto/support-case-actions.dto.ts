import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { SupportCaseStatus } from '@prisma/client';

export class ClaimSupportCaseDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

export class TransferSupportCaseDto extends ClaimSupportCaseDto {
  @IsUUID()
  toAdminUserId!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ChangeSupportCaseStatusDto extends ClaimSupportCaseDto {
  @IsEnum(SupportCaseStatus)
  status!: SupportCaseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resolutionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
