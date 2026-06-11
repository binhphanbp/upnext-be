import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { CreateSkillDto, CreateSkillCategoryDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

@ApiTags('skills')
@Controller()
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  // ─── Skill Categories ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create Skill Category' })
  @Post('skill-categories')
  createCategory(@Body() dto: CreateSkillCategoryDto) {
    return this.skillsService.createCategory(dto);
  }

  @ApiOperation({ summary: 'List Skill Categories' })
  @Get('skill-categories')
  findAllCategories() {
    return this.skillsService.findAllCategories();
  }

  // ─── Skills ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create Skill' })
  @Post('skills')
  create(@Body() dto: CreateSkillDto) {
    return this.skillsService.create(dto);
  }

  @ApiOperation({ summary: 'Search Skills' })
  @ApiQuery({ name: 'q', required: true })
  @Get('skills/search')
  search(@Query('q') q: string) {
    return this.skillsService.search(q);
  }

  @ApiOperation({ summary: 'List Skills' })
  @ApiQuery({ name: 'categoryId', required: false })
  @Get('skills')
  findAll(@Query('categoryId') categoryId?: string) {
    return this.skillsService.findAll(categoryId);
  }

  @ApiOperation({ summary: 'Get Skill' })
  @Get('skills/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillsService.findOne(id);
  }

  @ApiOperation({ summary: 'Update Skill' })
  @Patch('skills/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSkillDto) {
    return this.skillsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete Skill' })
  @HttpCode(204)
  @Delete('skills/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillsService.remove(id);
  }
}
