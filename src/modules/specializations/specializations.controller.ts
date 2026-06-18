import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SpecializationsService } from './specializations.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';

@ApiTags('Specializations')
@Controller('specializations')
export class SpecializationsController {
  constructor(private readonly specializationsService: SpecializationsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo chuyên ngành' })
  create(@Body() dto: CreateSpecializationDto) {
    return this.specializationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách chuyên ngành' })
  findAll() {
    return this.specializationsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết chuyên ngành' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.specializationsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật chuyên ngành' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSpecializationDto) {
    return this.specializationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa chuyên ngành' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.specializationsService.remove(id);
  }
}
