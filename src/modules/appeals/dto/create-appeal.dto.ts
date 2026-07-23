import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAppealDto {
  @ApiProperty({ description: 'Nội dung kháng cáo giải thích lý do công ty không vi phạm' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ description: 'UUID file bằng chứng kèm theo' })
  @IsOptional()
  @IsUUID()
  evidenceFileId?: string;
}
