import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  Min,
  IsString,
} from 'class-validator';
export class CreateSubscriptionPlanDto {
  @ApiProperty({ description: 'Tên gói dịch vụ', example: 'Premium Package' })
  @IsString()
  @IsNotEmpty()
  subscriptionName: string;
  @ApiProperty({ description: 'Giá tiền (VND)', example: 500000 })
  @IsNumber()
  @IsPositive()
  price: number;
  @ApiPropertyOptional({
    description: 'Mô tả gói dịch vụ',
    example: 'Đăng tin không giới hạn và đẩy tin VIP',
  })
  @IsString()
  @IsOptional()
  description?: string;
  @ApiProperty({ description: 'Thời hạn gói (số ngày)', example: 30 })
  @IsInt()
  @IsPositive()
  durationDays: number;
  @ApiPropertyOptional({ description: 'Số lượt đẩy tin (boost credit)', default: 0, example: 5 })
  @IsInt()
  @Min(0)
  @IsOptional()
  boostCreditLimit?: number;
  @ApiPropertyOptional({
    description: 'Số lượng tin tuyển dụng tối đa được đăng',
    default: 0,
    example: 10,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  jobPostLimit?: number;
  @ApiPropertyOptional({ enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;
}
