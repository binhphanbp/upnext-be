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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RestrictedModeGuard } from '../auth/guards/restricted-mode.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SpecializationsService } from './specializations.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';

/**
 * Reads stay public — the job pages need the catalog before anyone signs in. Writes are limited to
 * the roles that legitimately extend it; they used to be open to anonymous callers.
 */
@ApiTags('Specializations')
@Controller('specializations')
export class SpecializationsController {
  constructor(private readonly specializationsService: SpecializationsService) {}

  // Only the recruiter job-post form creates these, so candidates have no reason to be here.
  @Post()
  @ApiOperation({ summary: 'Tạo chuyên ngành (recruiter hoặc admin đã đăng nhập)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard, ThrottlerGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
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

  // Renaming or removing an entry rewrites what existing job posts point at: admin only.
  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật chuyên ngành (chỉ admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSpecializationDto) {
    return this.specializationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa chuyên ngành (chỉ admin)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.specializationsService.remove(id);
  }
}
