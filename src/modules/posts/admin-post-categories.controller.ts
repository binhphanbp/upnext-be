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
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreatePostCategoryDto, UpdatePostCategoryDto } from './dto/category-dto';
import { PostsService } from './posts.service';

@ApiTags('Admin - Post Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/post-categories')
export class AdminPostCategoriesController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo danh mục bài viết mới' })
  @ApiCreatedResponse({ description: 'Tạo danh mục bài viết thành công.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  createCategory(@Body() dto: CreatePostCategoryDto) {
    return this.postsService.createCategory(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách danh mục bài viết cho Admin' })
  @ApiOkResponse({ description: 'Lấy danh sách thành công.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  getCategories() {
    return this.postsService.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết danh mục bài viết' })
  @ApiOkResponse({ description: 'Lấy chi tiết danh mục thành công.' })
  @ApiNotFoundResponse({ description: 'Danh mục không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  findOneCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.findOneCategory(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật danh mục bài viết' })
  @ApiOkResponse({ description: 'Cập nhật danh mục thành công.' })
  @ApiNotFoundResponse({ description: 'Danh mục không tồn tại.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostCategoryDto) {
    return this.postsService.updateCategory(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa danh mục bài viết' })
  @ApiOkResponse({ description: 'Xóa danh mục thành công.' })
  @ApiNotFoundResponse({ description: 'Danh mục không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.removeCategory(id);
  }
}
