import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyCompanyDto {
  @ApiProperty({
    enum: ['VERIFIED', 'REJECTED'],
    example: 'VERIFIED',
    description: 'Trạng thái xác thực cần cập nhật (VERIFIED hoặc REJECTED)',
  })
  @IsEnum(['VERIFIED', 'REJECTED'], {
    message: 'Status must be either VERIFIED or REJECTED',
  })
  @IsNotEmpty()
  status!: 'VERIFIED' | 'REJECTED';

  @ApiPropertyOptional({
    example: 'Giấy phép kinh doanh được phê duyệt hợp lệ.',
    description: 'Lý do phê duyệt hoặc từ chối xác thực',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
