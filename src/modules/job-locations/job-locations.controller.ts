import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JobLocationsService } from './job-locations.service';
import { CreateJobLocationDto } from './dto/create-job-location.dto';
import { UpdateJobLocationDto } from './dto/update-job-location.dto';

@ApiTags('job-locations')
@Controller('job-locations')
export class JobLocationsController {
  constructor(private readonly jobLocationsService: JobLocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create Job Location' })
  create(@Body() dto: CreateJobLocationDto) {
    return this.jobLocationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List Job Locations' })
  findAll() {
    return this.jobLocationsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Job Location' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobLocationsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Job Location' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobLocationDto) {
    return this.jobLocationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete Job Location' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobLocationsService.remove(id);
  }
}
