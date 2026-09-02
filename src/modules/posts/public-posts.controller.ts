import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ListPublicPostsQueryDto } from './dto/list-public-posts-query.dto';
import { PostsService } from './posts.service';

@ApiTags('Public - Posts')
@Controller('posts')
export class PublicPostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách bài viết đã xuất bản (Công khai)',
    description: 'Chỉ các bài viết có trạng thái PUBLISHED mới được trả về.',
  })
  @ApiOkResponse({ description: 'Lấy danh sách bài viết thành công.' })
  findAllPublic(@Query() query: ListPublicPostsQueryDto) {
    return this.postsService.findAllPublic(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Lấy danh sách danh mục bài viết (Công khai)' })
  @ApiOkResponse({ description: 'Lấy danh sách danh mục thành công.' })
  getCategories() {
    return this.postsService.getCategories();
  }

  @Get('tags')
  @ApiOperation({ summary: 'Lấy danh sách tag bài viết (Công khai)' })
  @ApiOkResponse({ description: 'Lấy danh sách tag thành công.' })
  getTags() {
    return this.postsService.getTags();
  }

  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Chi tiết bài viết qua Slug (Công khai)' })
  @ApiParam({
    name: 'slug',
    description: 'URL slug của bài viết',
    example: 'huong-dan-viet-cv-2026',
  })
  @ApiOkResponse({ description: 'Lấy chi tiết bài viết thành công.' })
  @ApiNotFoundResponse({ description: 'Bài viết không tồn tại hoặc chưa xuất bản.' })
  findBySlug(@Param('slug') slug: string) {
    return this.postsService.findPublicBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết bài viết qua ID (Công khai)' })
  @ApiParam({ name: 'id', description: 'UUID bài viết' })
  @ApiOkResponse({ description: 'Lấy chi tiết bài viết thành công.' })
  @ApiNotFoundResponse({ description: 'Bài viết không tồn tại hoặc chưa xuất bản.' })
  findOnePublic(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.findPublicById(id);
  }
}
