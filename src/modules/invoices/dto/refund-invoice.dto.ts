import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundInvoiceDto {
  @ApiProperty({
    description: 'Lý do hoàn tiền',
    example: 'Giao dịch chuyển khoản nhầm 2 lần, hoàn tiền đợt 2',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({
    description: 'Mã giao dịch ngân hàng đã chuyển tiền hoàn lại',
    example: 'REF-VCB-99881122',
  })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  refundReference?: string;

  @ApiPropertyOptional({
    description: 'Ghi chú nội bộ của kế toán',
    example: 'Đã chuyển trả tài khoản nguồn lúc 14:00',
  })
  @IsString()
  @IsOptional()
  adminNote?: string;
}
