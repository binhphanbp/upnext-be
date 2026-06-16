import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JobCategoriesService } from './job-categories.service';
import { CreateJobCategoryDto } from './dto/create-job-category.dto';
import { UpdateJobCategoryDto } from './dto/update-job-category.dto';

@ApiTags('job-categories')
@Controller('job-categories')
export class JobCategoriesController {
  constructor(private readonly jobCategoriesService: JobCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create Job Category' })
  create(@Body() dto: CreateJobCategoryDto) {
    return this.jobCategoriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List Job Categories' })
  findAll() {
    return this.jobCategoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Job Category' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobCategoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Job Category' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobCategoryDto) {
    return this.jobCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete Job Category' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobCategoriesService.remove(id);
  }
}
