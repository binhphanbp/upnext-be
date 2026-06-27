import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CandidateEducationsService } from './candidate-educations.service';
import { CreateCandidateEducationDto } from './dto/create-candidate-education.dto';
import { UpdateCandidateEducationDto } from './dto/update-candidate-education.dto';
import { CandidateEducation } from './entities/candidate-education.entity';

@ApiTags('Candidate - Educations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles/me/educations')
export class CandidateEducationsController {
  constructor(private readonly candidateEducationsService: CandidateEducationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách học vấn' })
  @ApiOkResponse({ type: CandidateEducation, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateEducationsService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Thêm học vấn' })
  @ApiCreatedResponse({ type: CandidateEducation })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCandidateEducationDto) {
    return this.candidateEducationsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật học vấn' })
  @ApiOkResponse({ type: CandidateEducation })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateEducationDto,
  ) {
    return this.candidateEducationsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa học vấn' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidateEducationsService.remove(user.id, id);
  }
}
