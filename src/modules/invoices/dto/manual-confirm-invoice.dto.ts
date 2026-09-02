import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ManualConfirmInvoiceDto {
  @ApiProperty({
    description: 'Mã giao dịch ngân hàng / cổng thanh toán (đối soát)',
    example: 'FT2624589100234',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  paymentReference: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.SEPAY,
    description: 'Phương thức thanh toán đã nhận tiền',
  })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod = PaymentMethod.SEPAY;

  @ApiPropertyOptional({
    description: 'Ghi chú đối soát của kế toán/admin',
    example: 'Đã khớp sao kê tài khoản ngân hàng Vietcombank 02/09/2026',
  })
  @IsString()
  @IsOptional()
  adminNote?: string;
}
