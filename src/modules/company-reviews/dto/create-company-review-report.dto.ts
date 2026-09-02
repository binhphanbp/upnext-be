import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { MAX_REPORT_EVIDENCE_FILES } from '../../reports/reports.service';

export class CreateCompanyReviewReportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({
    description: `Danh sách UUID ảnh bằng chứng, tối đa ${MAX_REPORT_EVIDENCE_FILES} ảnh. Thứ tự gửi lên được giữ nguyên.`,
    type: [String],
    maxItems: MAX_REPORT_EVIDENCE_FILES,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_REPORT_EVIDENCE_FILES, {
    message: `Chỉ được gửi tối đa ${MAX_REPORT_EVIDENCE_FILES} ảnh bằng chứng.`,
  })
  @IsUUID('all', { each: true })
  evidenceFileIds?: string[];
}
