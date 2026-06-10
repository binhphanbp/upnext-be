import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class UpdateRecruiterAccountDto {
  @ApiPropertyOptional({ example: 'recruiter@company.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'f2d32130-4f55-4517-b8f4-f0ac59a8b2cb' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ example: 'b11eaeff-087f-4677-b8bd-c29ac7e59693' })
  @IsOptional()
  @IsUUID()
  recruiterRoleId?: string;

  @ApiPropertyOptional({ enum: AccountStatus, example: AccountStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;
}
