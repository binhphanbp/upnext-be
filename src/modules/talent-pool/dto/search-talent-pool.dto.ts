import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Chỉ hai bộ lọc thật sự query được: `skillIds` (quan hệ có sẵn
 * `CandidateSkill`) và `city` (`CandidateProfile.preferredSearchCity`). Không
 * có "cấp bậc" -- phía ứng viên không có cột enum nào cho việc đó, chỉ có
 * `CandidateExperience` dạng lịch sử công việc, không suy ra được một mức duy
 * nhất mà không tự bịa quy tắc tính.
 */
export class SearchTalentPoolDto {
  @ApiPropertyOptional({ type: [String], description: 'Lọc theo kỹ năng (UUID Skill).' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }): unknown => (Array.isArray(value) ? value : [value]))
  skillIds?: string[];

  @ApiPropertyOptional({ description: 'Lọc theo thành phố mong muốn làm việc.' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;
}
