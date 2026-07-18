import { IsUUID } from 'class-validator';

export class ReadMessageDto {
  @IsUUID()
  messageId!: string;
}
