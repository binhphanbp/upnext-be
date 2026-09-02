import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendApplicationInvitationDto {
  /** An optional one-off edit; when omitted the saved company template is used. */
  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  message?: string;
}
