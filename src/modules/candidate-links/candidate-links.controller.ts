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
import { CandidateLinksService } from './candidate-links.service';
import { CreateCandidateLinkDto } from './dto/create-candidate-link.dto';
import { UpdateCandidateLinkDto } from './dto/update-candidate-link.dto';
import { CandidateLink } from './entities/candidate-link.entity';

@ApiTags('Candidate - Links')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles/me/links')
export class CandidateLinksController {
  constructor(private readonly candidateLinksService: CandidateLinksService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách liên kết' })
  @ApiOkResponse({ type: CandidateLink, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateLinksService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo liên kết' })
  @ApiCreatedResponse({ type: CandidateLink })
  @ApiConflictResponse({ description: 'Liên kết đã tồn tại trong hồ sơ này.' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCandidateLinkDto) {
    return this.candidateLinksService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật liên kết' })
  @ApiOkResponse({ type: CandidateLink })
  @ApiConflictResponse({ description: 'Liên kết đã tồn tại trong hồ sơ này.' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateLinkDto,
  ) {
    return this.candidateLinksService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa liên kết' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidateLinksService.remove(user.id, id);
  }
}
