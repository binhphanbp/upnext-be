import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCompanyReviewReportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({ description: 'UUID ảnh/file bằng chứng kèm theo' })
  @IsOptional()
  @IsUUID()
  evidenceFileId?: string;
}
