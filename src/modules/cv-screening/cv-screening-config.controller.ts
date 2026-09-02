import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CvScreeningConfigService } from './cv-screening-config.service';
import { UpdateCvScreeningConfigDto } from './dto/update-cv-screening-config.dto';

@ApiTags('Recruiter - CV Screening Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
@Controller('recruiter/cv-screening/config')
export class CvScreeningConfigController {
  constructor(private readonly cvScreeningConfigService: CvScreeningConfigService) {}

  @Get()
  @ApiOperation({ summary: "Get the company's default AI CV-screening configuration" })
  @ApiOkResponse({ description: 'Company defaults, merged with the system defaults.' })
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.cvScreeningConfigService.getConfig(user.id);
  }

  @Put()
  @ApiOperation({ summary: "Update the company's default AI CV-screening configuration" })
  @ApiBody({ type: UpdateCvScreeningConfigDto })
  @ApiOkResponse({ description: 'Configuration saved.' })
  updateConfig(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCvScreeningConfigDto) {
    return this.cvScreeningConfigService.updateConfig(user, dto);
  }

  @Get('job/:jobPostId')
  @ApiOperation({ summary: "Get one job post's screening config, merged over company defaults" })
  @ApiParam({ name: 'jobPostId', description: 'UUID of the job post' })
  @ApiOkResponse({ description: 'Effective config for this job post, with inheritance flags.' })
  getJobConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobPostId', new ParseUUIDPipe()) jobPostId: string,
  ) {
    return this.cvScreeningConfigService.getJobConfig(user.id, jobPostId);
  }

  @Put('job/:jobPostId')
  @ApiOperation({ summary: 'Override the company defaults for one job post' })
  @ApiParam({ name: 'jobPostId', description: 'UUID of the job post' })
  @ApiBody({ type: UpdateCvScreeningConfigDto })
  @ApiOkResponse({ description: 'Override saved.' })
  updateJobConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobPostId', new ParseUUIDPipe()) jobPostId: string,
    @Body() dto: UpdateCvScreeningConfigDto,
  ) {
    return this.cvScreeningConfigService.updateJobConfig(user, jobPostId, dto);
  }

  @Delete('job/:jobPostId')
  @ApiOperation({ summary: 'Drop a job post override so it follows the company defaults again' })
  @ApiParam({ name: 'jobPostId', description: 'UUID of the job post' })
  @ApiOkResponse({ description: 'Override removed; company defaults returned.' })
  resetJobConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobPostId', new ParseUUIDPipe()) jobPostId: string,
  ) {
    return this.cvScreeningConfigService.resetJobConfig(user.id, jobPostId);
  }
}
