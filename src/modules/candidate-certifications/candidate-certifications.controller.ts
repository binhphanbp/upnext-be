import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CandidateCertificationsService } from './candidate-certifications.service';
import { CreateCandidateCertificationDto } from './dto/create-candidate-certification.dto';
import { UpdateCandidateCertificationDto } from './dto/update-candidate-certification.dto';
import { CandidateCertification } from './entities/candidate-certification.entity';

@ApiTags('Candidate - Certifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles/me/certifications')
export class CandidateCertificationsController {
  constructor(private readonly candidateCertificationsService: CandidateCertificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách chứng chỉ' })
  @ApiOkResponse({ type: CandidateCertification, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateCertificationsService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo chứng chỉ' })
  @ApiCreatedResponse({ type: CandidateCertification })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCandidateCertificationDto) {
    return this.candidateCertificationsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật chứng chỉ' })
  @ApiOkResponse({ type: CandidateCertification })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateCertificationDto,
  ) {
    return this.candidateCertificationsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xóa chứng chỉ' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.candidateCertificationsService.remove(user.id, id);
  }
}
