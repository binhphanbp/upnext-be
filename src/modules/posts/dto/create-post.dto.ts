import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostStatus, PostType } from '@prisma/client';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ description: 'Tiêu đề bài viết' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Nội dung bài viết' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    enum: PostStatus,
    default: PostStatus.DRAFT,
    description: 'Trạng thái bài viết',
  })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @ApiPropertyOptional({ enum: PostType, default: PostType.BLOG, description: 'Loại bài viết' })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiPropertyOptional({ description: 'UUID danh mục bài viết' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'UUID hình ảnh thumbnail' })
  @IsOptional()
  @IsUUID()
  thumbnailFileId?: string;

  @ApiPropertyOptional({ description: 'UUID hình ảnh cover' })
  @IsOptional()
  @IsUUID()
  coverImageFileId?: string;

  @ApiPropertyOptional({ description: 'Thẻ meta title cho SEO' })
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'Thẻ meta description cho SEO' })
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'Thẻ meta keywords cho SEO' })
  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @ApiPropertyOptional({ description: 'Danh sách UUID của các tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}
