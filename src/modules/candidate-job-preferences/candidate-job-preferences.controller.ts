import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CandidateJobPreferencesService } from './candidate-job-preferences.service';
import { UpsertCandidateJobPreferenceDto } from './dto/upsert-candidate-job-preference.dto';
import { CandidateJobPreference } from './entities/candidate-job-preference.entity';

@ApiTags('Candidate - Job Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('candidate-profiles/me/job-preference')
export class CandidateJobPreferencesController {
  constructor(private readonly candidateJobPreferencesService: CandidateJobPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy mong muốn việc làm' })
  @ApiOkResponse({ type: CandidateJobPreference })
  findMe(@CurrentUser() user: AuthenticatedUser) {
    return this.candidateJobPreferencesService.findMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Cập nhật mong muốn việc làm' })
  @ApiOkResponse({ type: CandidateJobPreference })
  upsertMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertCandidateJobPreferenceDto) {
    return this.candidateJobPreferencesService.upsertMe(user.id, dto);
  }
}
