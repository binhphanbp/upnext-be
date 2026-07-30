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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RestrictedModeGuard } from '../auth/guards/restricted-mode.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SkillsService } from './skills.service';
import { CreateSkillDto, CreateSkillCategoryDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

/**
 * Reads stay public: the job search, the public job pages and the recruiter form all load the
 * catalog before anyone signs in. Writes are the opposite — they used to be open to the internet,
 * which is how a shared catalog fills up with junk, so each one now names the roles it accepts.
 */
@ApiTags('Skills')
@Controller()
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  // ─── Skill Categories ────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Tạo danh mục kỹ năng (chỉ admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
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

  // Candidates add skills to their profile and recruiters to their job posts, so both may extend
  // the catalog — but only while signed in, and at a rate that rules out bulk insertion.
  @ApiOperation({ summary: 'Tạo kỹ năng (ứng viên, recruiter hoặc admin đã đăng nhập)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard, ThrottlerGuard)
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER, ActorType.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  // Renaming or deleting an entry affects every profile and job post already pointing at it, so
  // curation stays with admins even though creation does not.
  @ApiOperation({ summary: 'Cập nhật kỹ năng (chỉ admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @Patch('skills/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSkillDto) {
    return this.skillsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xóa kỹ năng (chỉ admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  @HttpCode(204)
  @Delete('skills/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillsService.remove(id);
  }
}
