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
import { CandidateLanguagesService } from './candidate-languages.service';
import { CreateCandidateLanguageDto } from './dto/create-candidate-language.dto';
import { UpdateCandidateLanguageDto } from './dto/update-candidate-language.dto';
import { CandidateLanguage } from './entities/candidate-language.entity';

@ApiTags('Candidate - Languages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles/me/languages')
export class CandidateLanguagesController {
  constructor(private readonly candidateLanguagesService: CandidateLanguagesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách ngôn ngữ' })
  @ApiOkResponse({ type: CandidateLanguage, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateLanguagesService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo ngôn ngữ' })
  @ApiCreatedResponse({ type: CandidateLanguage })
  @ApiConflictResponse({ description: 'Ngôn ngữ đã tồn tại' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCandidateLanguageDto) {
    return this.candidateLanguagesService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật ngôn ngữ' })
  @ApiOkResponse({ type: CandidateLanguage })
  @ApiConflictResponse({ description: 'Ngôn ngữ đã tồn tại' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateLanguageDto,
  ) {
    return this.candidateLanguagesService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa ngôn ngữ' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidateLanguagesService.remove(user.id, id);
  }
}
