import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus, CompanyType, CompanyVerificationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListCompaniesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CompanyStatus, example: CompanyStatus.ACTIVE })
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @ApiPropertyOptional({
    enum: CompanyVerificationStatus,
    example: CompanyVerificationStatus.VERIFIED,
  })
  @IsOptional()
  @IsEnum(CompanyVerificationStatus)
  verificationStatus?: CompanyVerificationStatus;

  @ApiPropertyOptional({ enum: CompanyType, example: CompanyType.PRODUCT })
  @IsOptional()
  @IsEnum(CompanyType)
  type?: CompanyType;

  @ApiPropertyOptional({
    description: 'Filter theo UUID goi dich vu dang hoat dong cua cong ty.',
    example: '4d1b0f1e-2c33-4a55-9f0a-7d5b1c9e2a10',
  })
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({
    description: 'Filter cac cong ty chua co goi dich vu dang hoat dong.',
    example: 'none',
  })
  @IsOptional()
  @IsIn(['none'])
  plan?: 'none';
}
