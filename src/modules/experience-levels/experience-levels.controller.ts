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
import { ExperienceLevelsService } from './experience-levels.service';
import { CreateExperienceLevelDto } from './dto/create-experience-level.dto';
import { UpdateExperienceLevelDto } from './dto/update-experience-level.dto';

@ApiTags('Experience - Levels')
@Controller('experience-levels')
export class ExperienceLevelsController {
  constructor(private readonly experienceLevelsService: ExperienceLevelsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo cấp độ kinh nghiệm' })
  create(@Body() dto: CreateExperienceLevelDto) {
    return this.experienceLevelsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách cấp độ kinh nghiệm' })
  findAll() {
    return this.experienceLevelsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết cấp độ kinh nghiệm' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.experienceLevelsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật cấp độ kinh nghiệm' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExperienceLevelDto) {
    return this.experienceLevelsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa cấp độ kinh nghiệm' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.experienceLevelsService.remove(id);
  }
}
