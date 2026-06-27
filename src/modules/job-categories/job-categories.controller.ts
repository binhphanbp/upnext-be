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
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JobCategoriesService } from './job-categories.service';
import { CreateJobCategoryDto } from './dto/create-job-category.dto';
import { UpdateJobCategoryDto } from './dto/update-job-category.dto';

@ApiTags('Job - Categories')
@Controller('job-categories')
export class JobCategoriesController {
  constructor(private readonly jobCategoriesService: JobCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo danh mục việc làm' })
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
  @ApiOperation({ summary: 'Cập nhật danh mục việc làm' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobCategoryDto) {
    return this.jobCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa danh mục việc làm' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobCategoriesService.remove(id);
  }
}
