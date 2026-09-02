import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_CRITERIA_ITEMS,
  MAX_CRITERION_LENGTH,
  MAX_CUSTOM_PROMPT_LENGTH,
  WEIGHT_TOTAL,
} from '../screening-config.resolver';

const ALLOWED_WEIGHT_PRESETS = ['FRESHER', 'MID', 'SENIOR', 'CUSTOM'] as const;

export class UpdateCvScreeningConfigDto {
  @ApiPropertyOptional({
    example: 35,
    minimum: 0,
    maximum: WEIGHT_TOTAL,
    description:
      'Điểm tối đa cho nhóm kỹ năng. Bốn trọng số phải gửi cùng nhau, là bội số của 5 và tổng bằng 100.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(WEIGHT_TOTAL)
  weightSkills?: number | null;

  @ApiPropertyOptional({ example: 35, minimum: 0, maximum: WEIGHT_TOTAL })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(WEIGHT_TOTAL)
  weightExperience?: number | null;

  @ApiPropertyOptional({ example: 20, minimum: 0, maximum: WEIGHT_TOTAL })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(WEIGHT_TOTAL)
  weightProjects?: number | null;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: WEIGHT_TOTAL })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(WEIGHT_TOTAL)
  weightEducation?: number | null;

  @ApiPropertyOptional({
    enum: ALLOWED_WEIGHT_PRESETS,
    description: 'Preset trọng số đã chọn, chỉ để giao diện chọn lại đúng thẻ preset.',
  })
  @IsOptional()
  @IsIn(ALLOWED_WEIGHT_PRESETS)
  weightPreset?: string | null;

  @ApiPropertyOptional({
    example: ['Ít nhất 2 năm React', 'Tiếng Anh giao tiếp tốt'],
    description:
      'Tiêu chí bắt buộc (deal-breaker). Thiếu sẽ bị cảnh báo và phản ánh vào điểm các hạng mục liên quan, không loại thẳng ứng viên.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CRITERIA_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_CRITERION_LENGTH, { each: true })
  mustHaveCriteria?: string[] | null;

  @ApiPropertyOptional({
    example: ['Từng làm fintech', 'Có chứng chỉ AWS'],
    description: 'Tiêu chí ưu tiên, được cộng điểm trong các hạng mục kỹ năng ưu tiên / domain.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CRITERIA_ITEMS)
  @IsString({ each: true })
  @MaxLength(MAX_CRITERION_LENGTH, { each: true })
  niceToHaveCriteria?: string[] | null;

  @ApiPropertyOptional({
    example: 'Ưu tiên ứng viên có thể onboard trong tháng này.',
    maxLength: MAX_CUSTOM_PROMPT_LENGTH,
    description: 'Ghi chú tự do cho AI. Gửi null để xoá.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CUSTOM_PROMPT_LENGTH)
  customPrompt?: string | null;
}
