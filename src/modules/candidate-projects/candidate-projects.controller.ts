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
import { CandidateProjectsService } from './candidate-projects.service';
import { CreateCandidateProjectDto } from './dto/create-candidate-project.dto';
import { UpdateCandidateProjectDto } from './dto/update-candidate-project.dto';
import { CandidateProject } from './entities/candidate-project.entity';

@ApiTags('Candidate - Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles/me/projects')
export class CandidateProjectsController {
  constructor(private readonly candidateProjectsService: CandidateProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách dự án' })
  @ApiOkResponse({ type: CandidateProject, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateProjectsService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo dự án' })
  @ApiCreatedResponse({ type: CandidateProject })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCandidateProjectDto) {
    return this.candidateProjectsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật dự án' })
  @ApiOkResponse({ type: CandidateProject })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateProjectDto,
  ) {
    return this.candidateProjectsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xoá dự án' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidateProjectsService.remove(user.id, id);
  }
}
