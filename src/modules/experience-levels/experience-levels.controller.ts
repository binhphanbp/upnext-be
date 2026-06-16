import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ExperienceLevelsService } from './experience-levels.service';
import { CreateExperienceLevelDto } from './dto/create-experience-level.dto';
import { UpdateExperienceLevelDto } from './dto/update-experience-level.dto';

@ApiTags('experience-levels')
@Controller('experience-levels')
export class ExperienceLevelsController {
  constructor(private readonly experienceLevelsService: ExperienceLevelsService) {}

  @Post()
  @ApiOperation({ summary: 'Create Experience Level' })
  create(@Body() dto: CreateExperienceLevelDto) {
    return this.experienceLevelsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List Experience Levels' })
  findAll() {
    return this.experienceLevelsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Experience Level' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.experienceLevelsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Experience Level' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExperienceLevelDto) {
    return this.experienceLevelsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete Experience Level' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.experienceLevelsService.remove(id);
  }
}
