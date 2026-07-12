import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CvVersionsService } from '../cvs/cv-versions.service';
import { CvScreeningService } from './cv-screening.service';
import { RunCvScreeningDto } from './dto/run-cv-screening.dto';

@ApiTags('Recruiter - CV Screening')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.RECRUITER)
@Controller('recruiter')
export class CvScreeningController {
  constructor(
    private readonly cvScreeningService: CvScreeningService,
    private readonly cvVersionsService: CvVersionsService,
  ) {}

  @Post('cv-screening/run')
  @ApiOperation({ summary: 'Create and start an async CV screening run for a job post' })
  @ApiBody({ type: RunCvScreeningDto })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        status: { type: 'string', example: 'PENDING' },
      },
    },
  })
  run(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunCvScreeningDto) {
    return this.cvScreeningService.startRun(user.id, dto);
  }

  @Get('cv-screening/runs/:runId')
  @ApiOperation({ summary: 'Get CV screening run status and progress' })
  @ApiParam({ name: 'runId', description: 'UUID of the CV screening run' })
  @ApiOkResponse({ description: 'CV screening run status.' })
  @ApiNotFoundResponse({ description: 'CV screening run not found.' })
  getRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.cvScreeningService.getRun(user.id, runId);
  }

  @Get('cv-screening/runs/:runId/results')
  @ApiOperation({ summary: 'Get CV screening ranking sorted by finalScore descending' })
  @ApiParam({ name: 'runId', description: 'UUID of the CV screening run' })
  @ApiOkResponse({ description: 'Ranked CV screening results.' })
  @ApiNotFoundResponse({ description: 'CV screening run not found.' })
  getResults(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.cvScreeningService.getResults(user.id, runId);
  }

  @Get('applications/:applicationId/ai-score')
  @ApiOperation({ summary: 'Get detailed AI score for an application' })
  @ApiParam({ name: 'applicationId', description: 'UUID of the application' })
  @ApiOkResponse({ description: 'Detailed AI evaluation for modal display.' })
  @ApiNotFoundResponse({ description: 'Application or AI score not found.' })
  getApplicationAiScore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
  ) {
    return this.cvScreeningService.getApplicationAiScore(user.id, applicationId);
  }

  @Get('applications/:applicationId/cv')
  @ApiOperation({ summary: 'View or download the original CV file for an application' })
  @ApiParam({ name: 'applicationId', description: 'UUID of the application' })
  @ApiOkResponse({ description: 'Original CV file stream.' })
  @ApiNotFoundResponse({ description: 'Application or CV file not found.' })
  async getApplicationCv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cvVersionId = await this.cvScreeningService.getAuthorizedApplicationCvVersionId(
      user.id,
      applicationId,
    );
    const download = await this.cvVersionsService.prepareDownload(cvVersionId, user);

    response.set({
      'Content-Type': download.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(download.fileName)}"`,
    });

    return new StreamableFile(download.stream);
  }
}
