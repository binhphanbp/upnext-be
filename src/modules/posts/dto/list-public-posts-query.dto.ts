import { ApiPropertyOptional } from '@nestjs/swagger';
import { PostType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListPublicPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo loại bài viết (BLOG, NEWS, FAQ).',
    enum: PostType,
    example: PostType.BLOG,
  })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiPropertyOptional({
    description: 'Lọc theo ID danh mục bài viết.',
    example: '8e10280c-ae2d-4579-a048-c25279447a3e',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo slug danh mục bài viết (ví dụ: blog-upnext, su-nghiep-it).',
    example: 'blog-upnext',
  })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID thẻ bài viết.',
    example: '8e10280c-ae2d-4579-a048-c25279447a3e',
  })
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo slug hoặc tên thẻ bài viết.',
    example: 'reactjs',
  })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm bài viết.',
    example: 'NestJS',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Trường sắp xếp (mặc định: createdAt)',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Hướng sắp xếp (asc hoặc desc, mặc định: desc)',
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
