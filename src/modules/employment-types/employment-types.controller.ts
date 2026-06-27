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
import { EmploymentTypesService } from './employment-types.service';
import { CreateEmploymentTypeDto } from './dto/create-employment-type.dto';
import { UpdateEmploymentTypeDto } from './dto/update-employment-type.dto';

@ApiTags('Employment - Types')
@Controller('employment-types')
export class EmploymentTypesController {
  constructor(private readonly employmentTypesService: EmploymentTypesService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo loại hình công việc' })
  create(@Body() dto: CreateEmploymentTypeDto) {
    return this.employmentTypesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách loại hình công việc' })
  findAll() {
    return this.employmentTypesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết loại hình công việc' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employmentTypesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật loại hình công việc' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmploymentTypeDto) {
    return this.employmentTypesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa loại hình công việc' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employmentTypesService.remove(id);
  }
}
