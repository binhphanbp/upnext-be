import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JobLocationsService } from './job-locations.service';
import { CreateJobLocationDto } from './dto/create-job-location.dto';
import { UpdateJobLocationDto } from './dto/update-job-location.dto';

@ApiTags('Job - Locations')
@Controller('job-locations')
export class JobLocationsController {
  constructor(private readonly jobLocationsService: JobLocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo địa điểm làm việc' })
  create(@Body() dto: CreateJobLocationDto) {
    return this.jobLocationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách địa điểm làm việc' })
  findAll() {
    return this.jobLocationsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết địa điểm làm việc' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobLocationsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật địa điểm làm việc' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobLocationDto) {
    return this.jobLocationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa địa điểm làm việc' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobLocationsService.remove(id);
  }
}
