import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminPermissions } from '../../common/decorators/admin-permissions.decorator';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { ListAdminPostsQueryDto } from './dto/list-admin-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PublishPostDto } from './dto/publish-post.dto';
import { PostsService } from './posts.service';

@ApiTags('Admin - Posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(ActorType.ADMIN)
@AdminPermissions('posts:manage')
@Controller('admin/posts')
export class AdminPostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo bài viết mới' })
  @ApiCreatedResponse({ description: 'Tạo bài viết thành công.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  create(@Body() dto: CreatePostDto, @CurrentUser() user: AuthenticatedUser) {
    return this.postsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách bài viết cho Admin' })
  @ApiOkResponse({ description: 'Lấy danh sách thành công.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  findAll(@Query() query: ListAdminPostsQueryDto) {
    return this.postsService.findAllForAdmin(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Lấy danh sách danh mục bài viết cho dropdown selection' })
  @ApiOkResponse({ description: 'Lấy danh sách danh mục thành công.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  getCategories() {
    return this.postsService.getCategories();
  }

  @Get('tags')
  @ApiOperation({ summary: 'Lấy danh sách tag bài viết cho dropdown selection' })
  @ApiOkResponse({ description: 'Lấy danh sách tag thành công.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  getTags() {
    return this.postsService.getTags();
  }

  @Get('slug-availability')
  @ApiOperation({ summary: 'Kiá»ƒm tra slug cÃ³ sáºµn sÃ ng' })
  slugAvailability(@Query('slug') slug: string, @Query('excludePostId') excludePostId?: string) {
    return this.postsService.slugAvailability(slug, excludePostId);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Xem trÆ°á»›c bÃ i viáº¿t cho Admin' })
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.preview(id);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Xuáº¥t báº£n bÃ i viáº¿t' })
  publish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishPostDto) {
    return this.postsService.publish(id, dto);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'LÆ°u trá»¯ bÃ i viáº¿t' })
  archive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishPostDto) {
    return this.postsService.archive(id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết bài viết' })
  @ApiOkResponse({ description: 'Lấy chi tiết bài viết thành công.' })
  @ApiNotFoundResponse({ description: 'Bài viết không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật bài viết' })
  @ApiOkResponse({ description: 'Cập nhật bài viết thành công.' })
  @ApiNotFoundResponse({ description: 'Bài viết không tồn tại.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa bài viết' })
  @ApiOkResponse({ description: 'Xóa bài viết thành công.' })
  @ApiNotFoundResponse({ description: 'Bài viết không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.remove(id);
  }
}
