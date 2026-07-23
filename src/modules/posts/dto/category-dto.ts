import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePostCategoryDto {
  @ApiProperty({
    description: 'Tên danh mục bài viết',
    example: 'Kinh nghiệm phỏng vấn',
  })
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Slug danh mục (nếu để trống sẽ tự tạo từ name)',
    example: 'kinh-nghiem-phong-van',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  slug?: string;
}

export class UpdatePostCategoryDto extends PartialType(CreatePostCategoryDto) {}
