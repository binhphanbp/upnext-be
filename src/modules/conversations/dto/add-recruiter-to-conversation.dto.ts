import { IsUUID } from 'class-validator';

export class AddRecruiterToConversationDto {
  @IsUUID()
  recruiterAccountId!: string;
}
