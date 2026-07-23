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
  ApiBody,
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
import { ActorType, ApplicationStatus } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AllowWhenRestricted } from '../../common/decorators/allow-when-restricted.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RestrictedModeGuard } from '../auth/guards/restricted-mode.guard';
import { ApplicationsService } from './applications.service';
import { ApplyJobDto } from './dto/apply-job.dto';
import { AssignApplicationDto, UnassignApplicationDto } from './dto/assign-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApplicationAssignmentService } from './application-assignment.service';
import { ApplicationEntity, CheckAppliedJobResponse } from './entities/application.entity';

@ApiTags('Applications')
@Controller()
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly assignments: ApplicationAssignmentService,
  ) {}

  @Post('applications')
  @ApiOperation({ summary: 'Nộp hồ sơ ứng tuyển' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @ApiCreatedResponse({
    type: ApplicationEntity,
    description: 'Hồ sơ ứng tuyển được nộp thành công.',
  })
  @ApiBadRequestResponse({
    description: 'Dữ liệu không hợp lệ hoặc bản CV không thuộc về ứng viên.',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy hồ sơ ứng viên, tin tuyển dụng hoặc bản CV.',
  })
  @ApiForbiddenResponse({ description: 'Email của ứng viên chưa được xác thực.' })
  @ApiConflictResponse({ description: 'Ứng viên đã nộp hồ sơ cho công việc này.' })
  applyJob(@Body() dto: ApplyJobDto, @CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.applyJob(user.id, dto);
  }

  @Patch('applications/:id/withdraw')
  @ApiOperation({ summary: 'Rút hồ sơ ứng tuyển' })
  @ApiParam({ name: 'id', description: 'UUID của hồ sơ ứng tuyển' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @ApiOkResponse({ type: ApplicationEntity, description: 'Rút hồ sơ ứng tuyển thành công.' })
  @ApiForbiddenResponse({ description: 'Ứng viên không sở hữu hồ sơ ứng tuyển này.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng tuyển hoặc hồ sơ ứng viên.' })
  @ApiConflictResponse({ description: 'Hồ sơ ứng tuyển đã được rút.' })
  withdrawApplication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.withdrawApplication(user.id, id);
  }

  @Get('applications/me')
  @ApiOperation({ summary: 'Lấy danh sách hồ sơ ứng tuyển của ứng viên hiện tại' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @ApiOkResponse({
    type: [ApplicationEntity],
    description: 'Danh sách các hồ sơ đã ứng tuyển của ứng viên.',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên.' })
  getMyApplications(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.getMyApplications(user.id);
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Lấy chi tiết hồ sơ ứng tuyển' })
  @ApiParam({ name: 'id', description: 'UUID của hồ sơ ứng tuyển' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER)
  @AllowWhenRestricted()
  @ApiOkResponse({ type: ApplicationEntity, description: 'Chi tiết hồ sơ ứng tuyển.' })
  @ApiForbiddenResponse({ description: 'Không có quyền truy cập hồ sơ ứng tuyển này.' })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy hồ sơ ứng tuyển hoặc tài khoản nhà tuyển dụng.',
  })
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === ActorType.CANDIDATE) {
      return this.applicationsService.findOne(id, user.id, undefined);
    }
    return this.applicationsService.findOne(id, undefined, user.id);
  }

  @Get('job-posts/:jobId/applications')
  @ApiOperation({
    summary: 'Lấy danh sách ứng viên của tin tuyển dụng (Chỉ dành cho nhà tuyển dụng)',
  })
  @ApiParam({ name: 'jobId', description: 'UUID của tin tuyển dụng' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @AllowWhenRestricted()
  @ApiOkResponse({
    type: [ApplicationEntity],
    description: 'Danh sách hồ sơ ứng tuyển của tin tuyển dụng.',
  })
  @ApiForbiddenResponse({
    description: 'Công ty của nhà tuyển dụng không khớp với công ty của tin tuyển dụng.',
  })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy tin tuyển dụng hoặc tài khoản nhà tuyển dụng.',
  })
  getJobApplicants(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.getJobApplicants(jobId, user.id);
  }

  @Get('job-posts/:jobId/applications/me')
  @ApiOperation({ summary: 'Kiểm tra xem ứng viên đã nộp hồ sơ vào tin tuyển dụng chưa' })
  @ApiParam({ name: 'jobId', description: 'UUID của tin tuyển dụng' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.CANDIDATE)
  @ApiOkResponse({
    type: CheckAppliedJobResponse,
    description: 'Trạng thái biểu thị ứng viên đã nộp hồ sơ hay chưa.',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên.' })
  checkAppliedJob(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.checkAppliedJob(jobId, user.id);
  }

  @Get('recruiter/company-applications')
  @ApiOperation({ summary: 'Lấy tất cả hồ sơ ứng tuyển của công ty (Chỉ dành cho nhà tuyển dụng)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @AllowWhenRestricted()
  @ApiQuery({ name: 'jobPostId', required: false, description: 'Lọc theo UUID của tin tuyển dụng' })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái hồ sơ ứng tuyển' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Tìm kiếm theo tên hoặc email ứng viên',
  })
  @ApiOkResponse({
    type: [ApplicationEntity],
    description: 'Danh sách hồ sơ ứng tuyển của công ty.',
  })
  getCompanyApplications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('jobPostId') jobPostId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const statusEnum = status ? (status as any) : undefined;
    return this.applicationsService.getCompanyApplications(user.id, {
      jobPostId,
      status: statusEnum,
      search,
    });
  }

  @Get('recruiter/pipeline')
  @ApiOperation({ summary: 'Get the recruiter application pipeline' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @AllowWhenRestricted()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'jobPostId', required: false })
  @ApiQuery({ name: 'stageId', required: false })
  @ApiOkResponse({ description: 'Recruiter pipeline grouped by application stage.' })
  getRecruiterPipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('jobPostId') jobPostId?: string,
    @Query('stageId') stageId?: string,
  ) {
    return this.applicationsService.getRecruiterPipeline(user.id, {
      search,
      jobPostId,
      stageId,
    });
  }

  @Patch('applications/:id/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái hồ sơ ứng tuyển' })
  @ApiParam({ name: 'id', description: 'UUID của hồ sơ ứng tuyển' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: Object.values(ApplicationStatus) },
        note: { type: 'string', nullable: true },
      },
      required: ['status'],
    },
  })
  @ApiOkResponse({
    type: ApplicationEntity,
    description: 'Trạng thái hồ sơ được cập nhật thành công.',
  })
  @ApiForbiddenResponse({ description: 'Không có quyền truy cập hồ sơ ứng tuyển này.' })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy hồ sơ ứng tuyển hoặc tài khoản nhà tuyển dụng.',
  })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.updateStatus(user, id, dto);
  }

  @Post('applications/:id/assignments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.assign(id, dto, user);
  }

  @Patch('applications/:id/assignments/:assignmentId/unassign')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  unassign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Body() dto: UnassignApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.unassign(id, assignmentId, dto, user);
  }
}
