import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { CreateSkillDto, CreateSkillCategoryDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

@ApiTags('Skills')
@Controller()
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  // ─── Skill Categories ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Tạo danh mục kỹ năng' })
  @Post('skill-categories')
  createCategory(@Body() dto: CreateSkillCategoryDto) {
    return this.skillsService.createCategory(dto);
  }

  @ApiOperation({ summary: 'Danh sách danh mục kỹ năng' })
  @Get('skill-categories')
  findAllCategories() {
    return this.skillsService.findAllCategories();
  }

  // ─── Skills ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Tạo kỹ năng' })
  @Post('skills')
  create(@Body() dto: CreateSkillDto) {
    return this.skillsService.create(dto);
  }

  @ApiOperation({ summary: 'Tìm kiếm kỹ năng' })
  @ApiQuery({ name: 'q', required: true })
  @Get('skills/search')
  search(@Query('q') q: string) {
    return this.skillsService.search(q);
  }

  @ApiOperation({ summary: 'Danh sách kỹ năng' })
  @ApiQuery({ name: 'categoryId', required: false })
  @Get('skills')
  findAll(@Query('categoryId') categoryId?: string) {
    return this.skillsService.findAll(categoryId);
  }

  @ApiOperation({ summary: 'Chi tiết kỹ năng' })
  @Get('skills/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillsService.findOne(id);
  }

  @ApiOperation({ summary: 'Cập nhật kỹ năng' })
  @Patch('skills/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSkillDto) {
    return this.skillsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa kỹ năng' })
  @HttpCode(204)
  @Delete('skills/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillsService.remove(id);
  }
}
