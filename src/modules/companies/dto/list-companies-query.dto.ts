import { ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyStatus, CompanyType, CompanyVerificationStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
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
}
