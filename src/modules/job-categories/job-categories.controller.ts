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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JobCategoriesService } from './job-categories.service';
import { CreateJobCategoryDto } from './dto/create-job-category.dto';
import { UpdateJobCategoryDto } from './dto/update-job-category.dto';

/**
 * Reads stay public. Nothing in the product asks a recruiter or candidate to invent an industry, so
 * the whole write side belongs to admins — it was reachable anonymously before.
 */
@ApiTags('Job - Categories')
@Controller('job-categories')
export class JobCategoriesController {
  constructor(private readonly jobCategoriesService: JobCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo danh mục việc làm (chỉ admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  create(@Body() dto: CreateJobCategoryDto) {
    return this.jobCategoriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách danh mục việc làm' })
  findAll() {
    return this.jobCategoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết danh mục việc làm' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobCategoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật danh mục việc làm (chỉ admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobCategoryDto) {
    return this.jobCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa danh mục việc làm (chỉ admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobCategoriesService.remove(id);
  }
}
