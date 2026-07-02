import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EducationLevel, SalaryPeriod } from '@prisma/client';

export class CreateJobPostDto {
  @ApiProperty({
    description: 'Tiêu đề tin tuyển dụng.',
    example: 'Senior Backend Developer',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Mô tả chi tiết công việc, trách nhiệm và phạm vi công việc.',
    example: 'Phát triển và vận hành các API backend cho nền tảng tuyển dụng.',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Yêu cầu ứng viên cần đáp ứng cho vị trí này.',
    example: 'Tối thiểu 3 năm kinh nghiệm với Node.js, NestJS và PostgreSQL.',
  })
  @IsString()
  @IsOptional()
  requirements?: string;

  @ApiPropertyOptional({
    description: 'Quyền lợi, phúc lợi hoặc chế độ đãi ngộ của công việc.',
    example: 'Lương tháng 13, bảo hiểm sức khỏe, làm việc hybrid.',
  })
  @IsString()
  @IsOptional()
  benefits?: string;

  @ApiPropertyOptional({
    description: 'Mức lương tối thiểu.',
    example: 25000000,
  })
  @IsOptional()
  salaryMin?: number;

  @ApiPropertyOptional({
    description: 'Mức lương tối đa.',
    example: 45000000,
  })
  @IsOptional()
  salaryMax?: number;

  @ApiPropertyOptional({
    description: 'Đơn vị tiền tệ của mức lương.',
    default: 'VND',
    example: 'VND',
  })
  @IsString()
  @IsOptional()
  salaryCurrency?: string;

  @ApiPropertyOptional({
    description: 'Chu kỳ tính lương.',
    enum: SalaryPeriod,
    default: SalaryPeriod.MONTH,
    example: SalaryPeriod.MONTH,
  })
  @IsOptional()
  salaryPeriod?: SalaryPeriod;

  @ApiPropertyOptional({
    description: 'Cho biết mức lương có thể thương lượng hay không.',
    default: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  salaryIsNegotiable?: boolean;

  @ApiPropertyOptional({
    description: 'Cho biết có hiển thị mức lương trên tin tuyển dụng hay không.',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  salaryIsVisible?: boolean;

  @ApiPropertyOptional({
    description: 'Số lượng vị trí cần tuyển.',
    default: 1,
    example: 2,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  vacanciesCount?: number;

  @ApiPropertyOptional({
    description: 'UUID của danh mục công việc.',
    example: '9cfc0f2e-df2d-4ff8-8e4f-dc9d1ef6f9a1',
  })
  @IsUUID()
  @IsOptional()
  jobCategoryId?: string;

  @ApiPropertyOptional({
    description: 'UUID của cấp độ kinh nghiệm.',
    example: '0ec939fd-aef7-4d2b-a33a-f38b2d4b7f36',
  })
  @IsUUID()
  @IsOptional()
  experienceLevelId?: string;

  @ApiPropertyOptional({
    description: 'UUID của hình thức làm việc.',
    example: '12fd0d6d-755c-4f2e-b08c-747a5a1b4e7f',
  })
  @IsUUID()
  @IsOptional()
  employmentTypeId?: string;

  @ApiPropertyOptional({
    description: 'Trình độ học vấn yêu cầu.',
    enum: EducationLevel,
    default: EducationLevel.ANY,
    example: EducationLevel.BACHELOR,
  })
  @IsEnum(EducationLevel)
  @IsOptional()
  educationLevel?: EducationLevel;
}
