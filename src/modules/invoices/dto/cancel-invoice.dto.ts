import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelInvoiceDto {
  @ApiProperty({
    description: 'Lý do hủy hóa đơn',
    example: 'Khách hàng yêu cầu đổi sang gói Enterprise theo năm',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
