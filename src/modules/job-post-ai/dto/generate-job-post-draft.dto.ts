import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum JobPostOutputLanguage {
  VI = 'vi',
  EN = 'en',
}

export enum JobPostPresentationStyle {
  TRADITIONAL = 'traditional',
  SKILL_FOCUSED = 'skill_focused',
  VALUE_FOCUSED = 'value_focused',
}

export enum JobPostWorkMode {
  ONSITE = 'onsite',
  HYBRID = 'hybrid',
  REMOTE = 'remote',
}

export class GenerateJobPostDraftDto {
  @ApiProperty({
    description: 'Chức danh hoặc vị trí cần tuyển.',
    example: 'Senior React Developer',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'UUID ngành nghề đã chọn.' })
  @IsUUID()
  @IsOptional()
  jobCategoryId?: string;

  @ApiPropertyOptional({ description: 'UUID cấp bậc kinh nghiệm đã chọn.' })
  @IsUUID()
  @IsOptional()
  experienceLevelId?: string;

  @ApiPropertyOptional({ description: 'UUID loại hình việc làm đã chọn.' })
  @IsUUID()
  @IsOptional()
  employmentTypeId?: string;

  @ApiPropertyOptional({
    description: 'Các kỹ năng bắt buộc lấy từ danh mục kỹ năng của hệ thống.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  @IsOptional()
  requiredSkillIds?: string[];

  @ApiPropertyOptional({
    description: 'Các kỹ năng ưu tiên lấy từ danh mục kỹ năng của hệ thống.',
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(12)
  @IsUUID('4', { each: true })
  @IsOptional()
  preferredSkillIds?: string[];

  @ApiPropertyOptional({
    description: 'Từ khóa tự do bổ sung cho vị trí.',
    type: [String],
    example: ['Fintech', 'Microservices', 'Agile'],
  })
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @IsOptional()
  keywords?: string[];

  @ApiPropertyOptional({ description: 'Số năm kinh nghiệm mong muốn.', example: '3-5 năm' })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  yearsOfExperience?: string;

  @ApiPropertyOptional({
    description: 'Mô tả công ty dùng làm ngữ cảnh. Nếu bỏ trống, hệ thống dùng hồ sơ công ty.',
  })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  companyDescription?: string;

  @ApiPropertyOptional({ description: 'Lĩnh vực sản phẩm hoặc dự án.', example: 'Fintech B2B' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  productOrDomain?: string;

  @ApiPropertyOptional({ description: 'Mục tiêu hoặc tác động chính của vị trí.' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  roleObjective?: string;

  @ApiPropertyOptional({ description: 'Thông tin đội nhóm hoặc quy trình làm việc.' })
  @IsString()
  @MaxLength(800)
  @IsOptional()
  teamContext?: string;

  @ApiPropertyOptional({ description: 'Yêu cầu ngoại ngữ của ứng viên.' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  languageRequirement?: string;

  @ApiPropertyOptional({ enum: JobPostWorkMode })
  @IsEnum(JobPostWorkMode)
  @IsOptional()
  workMode?: JobPostWorkMode;

  @ApiProperty({ enum: JobPostOutputLanguage, default: JobPostOutputLanguage.VI })
  @IsEnum(JobPostOutputLanguage)
  outputLanguage: JobPostOutputLanguage = JobPostOutputLanguage.VI;

  @ApiProperty({
    enum: JobPostPresentationStyle,
    default: JobPostPresentationStyle.TRADITIONAL,
  })
  @IsEnum(JobPostPresentationStyle)
  presentationStyle: JobPostPresentationStyle = JobPostPresentationStyle.TRADITIONAL;

  @ApiPropertyOptional({
    description: 'Ghi chú bổ sung. AI chỉ dùng làm ngữ cảnh, không được tự tạo chính sách công ty.',
  })
  @IsString()
  @MaxLength(1500)
  @IsOptional()
  hints?: string;
}
