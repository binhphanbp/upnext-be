import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Số ảnh minh chứng tối đa gửi kèm khi từ chối. */
export const MAX_VERIFICATION_EVIDENCE_FILES = 5;

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

  /**
   * Bắt buộc khi từ chối — lý do này đi thẳng vào email gửi cho nhà tuyển dụng, nên một
   * hồ sơ bị từ chối mà không kèm lý do là vô nghĩa với họ. Điều kiện "bắt buộc khi
   * REJECTED" nằm ở service chứ không ở đây: `@ValidateIf` áp cho cả property nên không
   * diễn tả được "luôn giới hạn 500 ký tự, nhưng chỉ bắt buộc khi từ chối".
   */
  @ApiPropertyOptional({
    example: 'Giấy phép kinh doanh được phê duyệt hợp lệ.',
    description: 'Lý do phê duyệt hoặc từ chối. Bắt buộc khi status = REJECTED.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    example:
      'Hình ảnh đăng tải không phải giấy chứng nhận đăng ký doanh nghiệp hoặc giấy tờ tương đương.',
    description: 'Mô tả/hướng dẫn chi tiết gửi kèm khi từ chối hồ sơ',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  guidance?: string;

  @ApiPropertyOptional({
    description: `UUID ảnh minh chứng gửi kèm lý do từ chối, tối đa ${MAX_VERIFICATION_EVIDENCE_FILES} ảnh. Thứ tự gửi lên được giữ nguyên.`,
    type: [String],
    maxItems: MAX_VERIFICATION_EVIDENCE_FILES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VERIFICATION_EVIDENCE_FILES, {
    message: `Chỉ được gửi tối đa ${MAX_VERIFICATION_EVIDENCE_FILES} ảnh minh chứng.`,
  })
  @IsUUID('all', { each: true })
  evidenceFileIds?: string[];
}
