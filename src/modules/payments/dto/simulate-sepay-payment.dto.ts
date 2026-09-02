import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class SimulateSepayPaymentDto {
  @ApiProperty({
    description: 'Mã hóa đơn cần mô phỏng thanh toán (vd: INV-20260903-1234 hoặc INV202609031234)',
    example: 'INV-20260903-1234',
  })
  @IsString()
  @IsNotEmpty()
  invoiceCode: string;

  @ApiPropertyOptional({
    description: 'Số tiền thanh toán (VND). Nếu để trống, sẽ lấy đúng số tiền của hóa đơn.',
    example: 5000,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Nội dung chuyển khoản tùy chỉnh. Nếu để trống, hệ thống sẽ tự sinh đúng cấu trúc.',
    example: 'UPNEXT INV-20260903-1234 thanh toan sandbox',
  })
  @IsOptional()
  @IsString()
  customContent?: string;
}
