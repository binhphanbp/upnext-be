import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SalaryInsightDto {
  @ApiProperty({ example: 'Senior React Developer' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Mô tả công việc dạng HTML hoặc văn bản.' })
  @IsString()
  @MinLength(20)
  @MaxLength(15_000)
  description: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(10_000)
  @IsOptional()
  requirements?: string;

  @ApiProperty({
    description: 'Số năm kinh nghiệm thực tế dùng để đối chiếu với các JD tương đồng.',
    example: 1,
    minimum: 0,
    maximum: 50,
  })
  @IsNumber()
  @Min(0)
  @Max(50)
  yearsOfExperience: number;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  jobCategoryId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  experienceLevelId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  @IsOptional()
  skillIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Kỹ năng bắt buộc dùng để xác định stack chính của vị trí.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  @IsOptional()
  requiredSkillIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Kỹ năng ưu tiên hoặc liên quan, chỉ dùng để cộng điểm tương đồng.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  @IsOptional()
  relatedSkillIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Tên công nghệ, kỹ năng hoặc từ khóa liên quan chưa có trong danh mục.',
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @IsOptional()
  skillKeywords?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  @IsOptional()
  jobLocationIds?: string[];

  @ApiPropertyOptional({ description: 'Mức lương tối thiểu recruiter đang cân nhắc.' })
  @IsNumber()
  @Min(0)
  @Max(99_999_999_999)
  @IsOptional()
  currentSalaryMin?: number;

  @ApiPropertyOptional({ description: 'Mức lương tối đa recruiter đang cân nhắc.' })
  @IsNumber()
  @Min(0)
  @Max(99_999_999_999)
  @IsOptional()
  currentSalaryMax?: number;
}
