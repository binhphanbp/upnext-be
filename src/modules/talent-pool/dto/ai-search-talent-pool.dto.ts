import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * AI lọc Kho CV theo một Job Post có sẵn -- không nhận JD dán tay tự do.
 *
 * Lý do chỉ nhận `jobPostId`: `getOrCreateJobEmbedding()` (tái dùng từ
 * cv-screening) đã cache theo `jobPostId` và validate quyền sở hữu tin qua đó.
 * Một endpoint nhận JD tự do sẽ cần một bề mặt validate/cache riêng cho cùng
 * một khả năng mà tin tuyển dụng đã có sẵn.
 */
export class AiSearchTalentPoolDto {
  @ApiProperty({ description: 'Tin tuyển dụng dùng làm JD để lọc Kho CV.' })
  @IsUUID('4')
  jobPostId!: string;
}
