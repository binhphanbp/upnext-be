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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { ListAdminPostsQueryDto } from './dto/list-admin-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@ApiTags('Admin - Posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
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
