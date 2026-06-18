import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApplicationsService } from './applications.service';
import { ApplyJobDto } from './dto/apply-job.dto';
import { ApplicationEntity, CheckAppliedJobResponse } from './entities/application.entity';

@ApiTags('Applications')
@Controller()
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('applications')
  @ApiOperation({ summary: 'Nộp hồ sơ ứng tuyển' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @ApiCreatedResponse({
    type: ApplicationEntity,
    description: 'Application submitted successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload or CV version does not belong to candidate.',
  })
  @ApiNotFoundResponse({ description: 'Candidate profile, job post, or CV version not found.' })
  @ApiForbiddenResponse({ description: 'Candidate email is not verified.' })
  @ApiConflictResponse({ description: 'Candidate has already applied to this job.' })
  applyJob(
    @Body() dto: ApplyJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.applyJob(user.id, dto);
  }

  @Patch('applications/:id/withdraw')
  @ApiOperation({ summary: 'Rút hồ sơ ứng tuyển' })
  @ApiParam({ name: 'id', description: 'Application UUID' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @ApiOkResponse({ type: ApplicationEntity, description: 'Application withdrawn successfully.' })
  @ApiForbiddenResponse({ description: 'Candidate does not own this application.' })
  @ApiNotFoundResponse({ description: 'Application or candidate profile not found.' })
  @ApiConflictResponse({ description: 'Application is already withdrawn.' })
  withdrawApplication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.applicationsService.withdrawApplication(candidateAccountId, id);
  }

  @Get('applications/me')
  @ApiOperation({ summary: 'Lấy danh sách hồ sơ ứng tuyển của ứng viên hiện tại' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @ApiOkResponse({ type: [ApplicationEntity], description: 'List of candidate applications.' })
  @ApiNotFoundResponse({ description: 'Candidate profile not found.' })
  getMyApplications(@Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string) {
    return this.applicationsService.getMyApplications(candidateAccountId);
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Lấy chi tiết hồ sơ ứng tuyển' })
  @ApiParam({ name: 'id', description: 'Application UUID' })
  @ApiQuery({
    name: 'candidateAccountId',
    required: false,
    description: 'Candidate account UUID (for candidate access)',
  })
  @ApiQuery({
    name: 'recruiterId',
    required: false,
    description: 'Recruiter account UUID (for recruiter access)',
  })
  @ApiOkResponse({ type: ApplicationEntity, description: 'Application details.' })
  @ApiForbiddenResponse({ description: 'Unauthorized access to this application.' })
  @ApiNotFoundResponse({ description: 'Application or recruiter account not found.' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('candidateAccountId') candidateAccountId?: string,
    @Query('recruiterId') recruiterId?: string,
  ) {
    return this.applicationsService.findOne(id, candidateAccountId, recruiterId);
  }

  @Get('job-posts/:jobId/applications')
  @ApiOperation({ summary: 'Lấy danh sách ứng viên của tin tuyển dụng (Chỉ dành cho nhà tuyển dụng)' })
  @ApiParam({ name: 'jobId', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', required: true, description: 'Recruiter account UUID' })
  @ApiOkResponse({ type: [ApplicationEntity], description: 'List of job applications.' })
  @ApiForbiddenResponse({ description: 'Recruiter company does not match job post company.' })
  @ApiNotFoundResponse({ description: 'Job post or recruiter account not found.' })
  getJobApplicants(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    return this.applicationsService.getJobApplicants(jobId, recruiterId);
  }

  @Get('job-posts/:jobId/applications/me')
  @ApiOperation({ summary: 'Kiểm tra xem ứng viên đã nộp hồ sơ vào tin tuyển dụng chưa' })
  @ApiParam({ name: 'jobId', description: 'Job post UUID' })
  @ApiQuery({ name: 'candidateAccountId', required: true, description: 'Candidate account UUID' })
  @ApiOkResponse({
    type: CheckAppliedJobResponse,
    description: 'Status indicating if candidate applied.',
  })
  @ApiNotFoundResponse({ description: 'Candidate profile not found.' })
  checkAppliedJob(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.applicationsService.checkAppliedJob(jobId, candidateAccountId);
  }
}
