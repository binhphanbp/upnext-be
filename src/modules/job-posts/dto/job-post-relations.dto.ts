import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ProficiencyLevel, SkillPriority } from '@prisma/client';

export class AddSkillToJobDto {
  @ApiProperty({
    description: 'UUID của kỹ năng cần gắn vào tin tuyển dụng.',
    example: '16f75d04-8c84-4b86-a2c0-6f3bc1c6e201',
  })
  @IsUUID()
  @IsNotEmpty()
  skillId: string;

  @ApiPropertyOptional({
    description: 'Số năm kinh nghiệm tối thiểu cho kỹ năng này.',
    example: 2,
  })
  @IsOptional()
  minYearsExperience?: number;

  @ApiPropertyOptional({
    description: 'Mức độ thành thạo mong muốn cho kỹ năng.',
    enum: ProficiencyLevel,
    example: ProficiencyLevel.INTERMEDIATE,
  })
  @IsEnum(ProficiencyLevel)
  @IsOptional()
  proficiencyLevel?: ProficiencyLevel;

  @ApiPropertyOptional({
    description: 'Mức độ ưu tiên của kỹ năng trong tin tuyển dụng.',
    enum: SkillPriority,
    default: SkillPriority.REQUIRED,
    example: SkillPriority.REQUIRED,
  })
  @IsEnum(SkillPriority)
  @IsOptional()
  priority?: SkillPriority;
}

export class AddLocationToJobDto {
  @ApiProperty({
    description: 'UUID của địa điểm làm việc cần gắn vào tin tuyển dụng.',
    example: '6fd6b3f9-0a21-4ad1-8f4d-414edba8b0cc',
  })
  @IsUUID()
  @IsNotEmpty()
  jobLocationId: string;
}

export class AddSpecializationToJobDto {
  @ApiProperty({
    description: 'UUID của chuyên ngành cần gắn vào tin tuyển dụng.',
    example: '9a04153f-4235-457c-9c83-3591c5ca76c9',
  })
  @IsUUID()
  @IsNotEmpty()
  specializationId: string;

  @ApiPropertyOptional({
    description: 'Đánh dấu chuyên ngành này là bắt buộc hay chỉ là lợi thế.',
    default: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;
}
