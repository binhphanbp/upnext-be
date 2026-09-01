import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanAudience, SubscriptionStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  Matches,
  MaxLength,
  Min,
  IsString,
} from 'class-validator';

/**
 * `code` là định danh bất biến mà logic nghiệp vụ dựa vào, nên nó phải trông như
 * một hằng số chứ không như một cái tên: chữ in, số và gạch dưới. Có tiền tố
 * audience vì "Pro" là tên bậc ở cả hai phía bảng giá.
 */
const PLAN_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,59}$/;

export class CreateSubscriptionPlanDto {
  @ApiProperty({ description: 'Tên gói dịch vụ', example: 'Growth' })
  @IsString()
  @IsNotEmpty()
  subscriptionName: string;

  /**
   * Không cho sửa sau khi tạo (xem `UpdateSubscriptionPlanDto`): mọi logic theo
   * bậc gói và mọi migration dữ liệu đều tham chiếu giá trị này.
   */
  @ApiPropertyOptional({
    description:
      'Mã gói bất biến, dùng cho logic nghiệp vụ và seed. Chữ in, số và gạch dưới. ' +
      'Không sửa được sau khi tạo.',
    example: 'RECRUITER_GROWTH',
  })
  @IsString()
  @Matches(PLAN_CODE_PATTERN, {
    message: 'code phải là chữ in, số và gạch dưới, dài 3-60 ký tự (ví dụ RECRUITER_GROWTH)',
  })
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    enum: PlanAudience,
    default: PlanAudience.RECRUITER,
    description:
      'Gói dành cho nhà tuyển dụng hay ứng viên. Quyết định ai mua được gói và gói ' +
      'nào được tự cấp làm gói miễn phí. Không sửa được sau khi tạo.',
  })
  @IsEnum(PlanAudience)
  @IsOptional()
  audience?: PlanAudience;

  @ApiProperty({
    description: 'Giá tiền (VND). Đặt 0 cho gói miễn phí.',
    example: 299000,
    minimum: 0,
  })
  @IsNumber()
  // `@Min(0)` chứ không phải `@IsPositive()`: gói miễn phí là một bản ghi thật, và
  // trước đây không tạo được qua API nên nó chỉ tồn tại được bằng seed/migration.
  @Min(0)
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

  @ApiPropertyOptional({
    description: 'Hiện gói này trên trang giá công khai. Gói không public thì không mua được.',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Thứ tự hiển thị trên trang giá, nhỏ hơn xếp trước.',
    default: 0,
    example: 20,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Nhãn nổi bật trên thẻ gói, ví dụ "Phổ biến nhất".',
    maxLength: 60,
  })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  highlightLabel?: string;

  @ApiPropertyOptional({ description: 'Số lượt đẩy tin (boost credit)', default: 0, example: 5 })
  @IsInt()
  @Min(0)
  @IsOptional()
  boostCreditLimit?: number;

  @ApiPropertyOptional({
    description:
      'Trường tương thích dữ liệu cũ, không còn áp dụng: mọi doanh nghiệp được đăng tin không giới hạn.',
    default: 0,
    example: 0,
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
