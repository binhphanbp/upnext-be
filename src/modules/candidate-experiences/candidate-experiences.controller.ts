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
import { CandidateExperiencesService } from './candidate-experiences.service';
import { CreateCandidateExperienceDto } from './dto/create-candidate-experience.dto';
import { UpdateCandidateExperienceDto } from './dto/update-candidate-experience.dto';
import { CandidateExperience } from './entities/candidate-experience.entity';

@ApiTags('Candidate - Experiences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles/me/experiences')
export class CandidateExperiencesController {
  constructor(private readonly candidateExperiencesService: CandidateExperiencesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách kinh nghiệm' })
  @ApiOkResponse({ type: CandidateExperience, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateExperiencesService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Thêm kinh nghiệm' })
  @ApiCreatedResponse({ type: CandidateExperience })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCandidateExperienceDto) {
    return this.candidateExperiencesService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật kinh nghiệm' })
  @ApiOkResponse({ type: CandidateExperience })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateExperienceDto,
  ) {
    return this.candidateExperiencesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa kinh nghiệm' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidateExperiencesService.remove(user.id, id);
  }
}
