import { ApiProperty } from '@nestjs/swagger';

export class PasswordResetRequestResponse {
  @ApiProperty({
    example: 'Nếu email tồn tại, hệ thống đã gửi link đặt lại mật khẩu đến email của bạn.',
  })
  message: string;
}

export class PasswordResetResponse {
  @ApiProperty({ example: 'Đặt lại mật khẩu thành công.' })
  message: string;
}
