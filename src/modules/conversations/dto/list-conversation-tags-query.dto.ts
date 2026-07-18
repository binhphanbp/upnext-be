import { ConversationType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListConversationTagsQueryDto {
  @IsOptional()
  @IsEnum(ConversationType)
  type?: ConversationType;
}
