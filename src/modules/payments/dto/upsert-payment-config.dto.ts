import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPaymentConfigDto {
  @ApiPropertyOptional({ description: 'Bật/tắt cổng thanh toán này', default: false })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Tên ngân hàng hiển thị', example: 'Vietcombank (VCB)' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  bankName?: string;

  @ApiPropertyOptional({
    description: 'Mã BIN ngân hàng theo chuẩn VietQR/Napas, dùng để dựng ảnh QR',
    example: '970436',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  bankBin?: string;

  @ApiPropertyOptional({ description: 'Số tài khoản nhận tiền', example: '999988888' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Tên chủ tài khoản (không dấu, in hoa theo chuẩn ngân hàng)',
    example: 'CONG TY CO PHAN UPNEXT',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  accountName?: string;

  @ApiPropertyOptional({
    description:
      'Bắt buộc phải xuất hiện trong nội dung chuyển khoản, đứng trước mã hoá đơn -- dùng khi ngân hàng có cấu hình Virtual Account (VA) trên SePay (vd "TKPUPN": TKP là tiền tố cố định của SePay, UPN là mã VA tự đặt). Để trống nếu tài khoản không dùng VA.',
    example: 'TKPUPN',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  contentPrefix?: string;

  @ApiPropertyOptional({
    description:
      'Secret Key dùng để xác thực chữ ký HMAC-SHA256 của webhook SePay (khớp đúng Secret Key ở bước "Bảo mật" khi tạo webhook trên dashboard SePay). Để trống nếu không muốn đổi secret hiện tại.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  webhookSecret?: string;
}
