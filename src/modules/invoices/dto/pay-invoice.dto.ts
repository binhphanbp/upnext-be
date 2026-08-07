import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class PayInvoiceDto {
  @ApiProperty({
    enum: PaymentMethod,
    description: 'Phương thức thanh toán',
    example: PaymentMethod.SEPAY,
  })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod;
}
