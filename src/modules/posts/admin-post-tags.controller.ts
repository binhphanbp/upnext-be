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
import { CreateTagDto, UpdateTagDto } from './dto/tag-dto';
import { PostsService } from './posts.service';

@ApiTags('Admin - Post Tags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/post-tags')
export class AdminPostTagsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo thẻ bài viết (Tag) mới' })
  @ApiCreatedResponse({ description: 'Tạo thẻ thành công.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  createTag(@Body() dto: CreateTagDto) {
    return this.postsService.createTag(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thẻ bài viết cho Admin' })
  @ApiOkResponse({ description: 'Lấy danh sách thành công.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  getTags() {
    return this.postsService.getTags();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết thẻ bài viết' })
  @ApiOkResponse({ description: 'Lấy chi tiết thẻ thành công.' })
  @ApiNotFoundResponse({ description: 'Thẻ không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  findOneTag(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.findOneTag(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thẻ bài viết' })
  @ApiOkResponse({ description: 'Cập nhật thẻ thành công.' })
  @ApiNotFoundResponse({ description: 'Thẻ không tồn tại.' })
  @ApiBadRequestResponse({ description: 'Dữ liệu không hợp lệ.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  updateTag(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTagDto) {
    return this.postsService.updateTag(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa thẻ bài viết' })
  @ApiOkResponse({ description: 'Xóa thẻ thành công.' })
  @ApiNotFoundResponse({ description: 'Thẻ không tồn tại.' })
  @ApiForbiddenResponse({ description: 'Chỉ Admin mới được phép thực hiện hành động này.' })
  removeTag(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.removeTag(id);
  }
}
