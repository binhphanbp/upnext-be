import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SupportPriority } from '@prisma/client';
import { supportCategoryDepartment } from '../support-routing.policy';

export class CreateSupportCaseDto {
  @IsString()
  @MaxLength(100)
  clientRequestId!: string;

  @IsIn(Object.keys(supportCategoryDepartment))
  categoryCode!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsIn(Object.values(SupportPriority))
  priority?: SupportPriority;

  @IsOptional()
  @IsUUID()
  jobPostId?: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsUUID()
  companySubscriptionId?: string;
}
