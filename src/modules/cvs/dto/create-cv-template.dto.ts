import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCvTemplateDto {
  @ApiProperty({
    example: 'Mẫu CV Backend tối giản',
    maxLength: 150,
    description: 'Tên hiển thị của mẫu CV.',
  })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({
    example: 'Mẫu CV phù hợp cho lập trình viên Backend, ưu tiên kinh nghiệm dự án.',
    description: 'Mô tả ngắn về mục đích hoặc phong cách của mẫu CV.',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.upnext.dev/cv-templates/backend-minimal.png',
    maxLength: 500,
    description: 'URL ảnh xem trước của mẫu CV.',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  previewImageUrl?: string;

  @ApiProperty({
    example: 'backend-minimal',
    maxLength: 80,
    description: 'Khóa định danh layout, là duy nhất trong hệ thống.',
  })
  @IsString()
  @MaxLength(80)
  layoutKey!: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Cho biết mẫu CV có đang được phép sử dụng hay không.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
