import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class AdminInvoiceQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo mã HĐ, tên công ty, MST hoặc email' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: PaymentStatus, description: 'Lọc theo trạng thái thanh toán' })
  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentMethod, description: 'Lọc theo cổng/phương thức thanh toán' })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ description: 'Lọc theo gói dịch vụ' })
  @IsUUID()
  @IsOptional()
  subscriptionPlanId?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (ISO date string)' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO date string)' })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'amount'], default: 'createdAt' })
  @IsString()
  @IsOptional()
  sortBy?: 'createdAt' | 'amount' = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
