import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SpecializationsService } from './specializations.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';

@ApiTags('specializations')
@Controller('specializations')
export class SpecializationsController {
  constructor(private readonly specializationsService: SpecializationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create Specialization' })
  create(@Body() dto: CreateSpecializationDto) {
    return this.specializationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List Specializations' })
  findAll() {
    return this.specializationsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Specialization' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.specializationsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update Specialization' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSpecializationDto) {
    return this.specializationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete Specialization' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.specializationsService.remove(id);
  }
}
