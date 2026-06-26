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
  ApiConflictResponse,
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
import { CandidateSkillsService } from './candidate-skills.service';
import { CreateCandidateSkillDto } from './dto/create-candidate-skill.dto';
import { UpdateCandidateSkillDto } from './dto/update-candidate-skill.dto';
import { CandidateSkill } from './entities/candidate-skill.entity';

@ApiTags('Candidate - Skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles/me/skills')
export class CandidateSkillsController {
  constructor(private readonly candidateSkillsService: CandidateSkillsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách kỹ năng' })
  @ApiOkResponse({ type: CandidateSkill, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateSkillsService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Thêm kỹ năng' })
  @ApiCreatedResponse({ type: CandidateSkill })
  @ApiConflictResponse({ description: 'Skill already exists in this profile.' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCandidateSkillDto) {
    return this.candidateSkillsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật kỹ năng' })
  @ApiOkResponse({ type: CandidateSkill })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateSkillDto,
  ) {
    return this.candidateSkillsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa kỹ năng' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidateSkillsService.remove(user.id, id);
  }
}
