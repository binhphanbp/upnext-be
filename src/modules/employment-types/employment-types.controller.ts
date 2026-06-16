import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EmploymentTypesService } from './employment-types.service';
import { CreateEmploymentTypeDto } from './dto/create-employment-type.dto';
import { UpdateEmploymentTypeDto } from './dto/update-employment-type.dto';

@ApiTags('employment-types')
@Controller('employment-types')
export class EmploymentTypesController {
  constructor(private readonly employmentTypesService: EmploymentTypesService) {}

  @Post()
  @ApiOperation({ summary: 'Create Employment Type' })
  create(@Body() dto: CreateEmploymentTypeDto) {
    return this.employmentTypesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List Employment Types' })
  findAll() {
    return this.employmentTypesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Employment Type' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employmentTypesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Employment Type' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmploymentTypeDto) {
    return this.employmentTypesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete Employment Type' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employmentTypesService.remove(id);
  }
}
