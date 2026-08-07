import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiConversationContext, AiFeedbackRating } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** §13.4 — giới hạn độ dài để một câu hỏi không kéo ngữ cảnh vượt trần token. */
const PROMPT_MAX = 2_000;

/**
 * `contextId` nhận **UUID hoặc slug**, không chỉ UUID.
 *
 * Đây từng là lỗi làm chết toàn bộ tính năng nhận biết ngữ cảnh trang (§8.3):
 * route công khai của tin tuyển dụng là `/jobs/[slug]`, nên frontend gửi slug —
 * và `@IsUUID()` từ chối, request trả 400. Hệ quả là ba quick action quan trọng
 * nhất ("So sánh CV với công việc này", "Tôi còn thiếu kỹ năng gì", "Chuẩn bị
 * phỏng vấn") đều mất ngữ cảnh và Copilot quay ra hỏi lại người dùng đang xem
 * tin nào — trong khi nó đã biết.
 *
 * Vẫn phải ràng buộc chặt vì giá trị này đi thẳng vào tham số của tool: chỉ chữ
 * thường, số và gạch ngang. Không khoảng trắng, không ký tự đặc biệt.
 */
const CONTEXT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;
const CONTEXT_ID_MAX = 220;

export class CreateConversationDto {
  @ApiPropertyOptional({ enum: AiConversationContext, default: AiConversationContext.GENERAL })
  @IsOptional()
  @IsEnum(AiConversationContext)
  contextType?: AiConversationContext;

  @ApiPropertyOptional({
    description:
      'Định danh thực thể của ngữ cảnh: UUID (cvVersionId, applicationId) hoặc slug của tin tuyển dụng.',
    example: 'senior-backend-developer-java-spring-boot-bolt-tech-3325',
  })
  @IsOptional()
  @IsString()
  @Matches(CONTEXT_ID_PATTERN, {
    message: 'contextId phải là UUID hoặc slug hợp lệ',
  })
  @MaxLength(CONTEXT_ID_MAX)
  contextId?: string;

  @ApiPropertyOptional({ enum: ['vi', 'en'], default: 'vi' })
  @IsOptional()
  @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';
}

export class SendMessageDto {
  @ApiProperty({ example: 'Phân tích CV của tôi', maxLength: PROMPT_MAX })
  @IsString()
  @MinLength(1)
  @MaxLength(PROMPT_MAX)
  prompt!: string;

  /**
   * Ngữ cảnh trang tại thời điểm gửi (§8.3). Gửi kèm mỗi tin nhắn thay vì chỉ
   * lấy từ hội thoại vì người dùng có thể mở drawer ở trang A rồi điều hướng
   * sang trang B mà không đóng hội thoại.
   */
  @ApiPropertyOptional({ enum: AiConversationContext })
  @IsOptional()
  @IsEnum(AiConversationContext)
  contextType?: AiConversationContext;

  @ApiPropertyOptional({ description: 'UUID hoặc slug — xem CreateConversationDto.contextId' })
  @IsOptional()
  @IsString()
  @Matches(CONTEXT_ID_PATTERN, { message: 'contextId phải là UUID hoặc slug hợp lệ' })
  @MaxLength(CONTEXT_ID_MAX)
  contextId?: string;
}

export class MessageFeedbackDto {
  @ApiProperty({ enum: AiFeedbackRating })
  @IsEnum(AiFeedbackRating)
  rating!: AiFeedbackRating;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reasonCode?: string;
}

export class ResolveActionDto {
  @ApiProperty({ enum: ['CONFIRMED', 'REJECTED'] })
  @IsIn(['CONFIRMED', 'REJECTED'])
  decision!: 'CONFIRMED' | 'REJECTED';
}
