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
  @ApiQuery({
    name: 'candidateAccountId',
    required: true,
    description: 'UUID của tài khoản ứng viên',
  })
  @ApiOkResponse({ type: ApplicationEntity, description: 'Rút hồ sơ ứng tuyển thành công.' })
  @ApiForbiddenResponse({ description: 'Ứng viên không sở hữu hồ sơ ứng tuyển này.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng tuyển hoặc hồ sơ ứng viên.' })
  @ApiConflictResponse({ description: 'Hồ sơ ứng tuyển đã được rút.' })
  withdrawApplication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.applicationsService.withdrawApplication(candidateAccountId, id);
  }

  @Get('applications/me')
  @ApiOperation({ summary: 'Lấy danh sách hồ sơ ứng tuyển của ứng viên hiện tại' })
  @ApiQuery({
    name: 'candidateAccountId',
    required: true,
    description: 'UUID của tài khoản ứng viên',
  })
  @ApiOkResponse({
    type: [ApplicationEntity],
    description: 'Danh sách các hồ sơ đã ứng tuyển của ứng viên.',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên.' })
  getMyApplications(@Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string) {
    return this.applicationsService.getMyApplications(candidateAccountId);
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Lấy chi tiết hồ sơ ứng tuyển' })
  @ApiParam({ name: 'id', description: 'UUID của hồ sơ ứng tuyển' })
  @ApiQuery({
    name: 'candidateAccountId',
    required: false,
    description: 'UUID tài khoản ứng viên (cho ứng viên truy cập)',
  })
  @ApiQuery({
    name: 'recruiterId',
    required: false,
    description: 'UUID tài khoản nhà tuyển dụng (cho nhà tuyển dụng truy cập)',
  })
  @ApiOkResponse({ type: ApplicationEntity, description: 'Chi tiết hồ sơ ứng tuyển.' })
  @ApiForbiddenResponse({ description: 'Không có quyền truy cập hồ sơ ứng tuyển này.' })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy hồ sơ ứng tuyển hoặc tài khoản nhà tuyển dụng.',
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('candidateAccountId') candidateAccountId?: string,
    @Query('recruiterId') recruiterId?: string,
  ) {
    return this.applicationsService.findOne(id, candidateAccountId, recruiterId);
  }

  @Get('job-posts/:jobId/applications')
  @ApiOperation({
    summary: 'Lấy danh sách ứng viên của tin tuyển dụng (Chỉ dành cho nhà tuyển dụng)',
  })
  @ApiParam({ name: 'jobId', description: 'UUID của tin tuyển dụng' })
  @ApiQuery({ name: 'recruiterId', required: true, description: 'UUID tài khoản nhà tuyển dụng' })
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
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    return this.applicationsService.getJobApplicants(jobId, recruiterId);
  }

  @Get('job-posts/:jobId/applications/me')
  @ApiOperation({ summary: 'Kiểm tra xem ứng viên đã nộp hồ sơ vào tin tuyển dụng chưa' })
  @ApiParam({ name: 'jobId', description: 'UUID của tin tuyển dụng' })
  @ApiQuery({
    name: 'candidateAccountId',
    required: true,
    description: 'UUID của tài khoản ứng viên',
  })
  @ApiOkResponse({
    type: CheckAppliedJobResponse,
    description: 'Trạng thái biểu thị ứng viên đã nộp hồ sơ hay chưa.',
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ ứng viên.' })
  checkAppliedJob(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query('candidateAccountId', new ParseUUIDPipe()) candidateAccountId: string,
  ) {
    return this.applicationsService.checkAppliedJob(jobId, candidateAccountId);
  }

  @Get('recruiter/company-applications')
  @ApiOperation({ summary: 'Lấy tất cả hồ sơ ứng tuyển của công ty (Chỉ dành cho nhà tuyển dụng)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
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
  @ApiOperation({ summary: 'Lấy dữ liệu quy trình ứng viên (RECRUITER)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @ApiQuery({ name: 'jobPostId', required: false, description: 'Lọc theo ID tin tuyển dụng' })
  @ApiQuery({ name: 'stageId', required: false, description: 'Lọc theo ID giai đoạn pipeline' })
  @ApiQuery({ name: 'search', required: false, description: 'Tìm kiếm theo tên, email, vị trí hoặc kỹ năng' })
  @ApiOkResponse({
    description: 'Dữ liệu pipeline ứng viên.',
  })
  getRecruiterPipeline(
    @CurrentUser() user: AuthenticatedUser,
    @Query('jobPostId') jobPostId?: string,
    @Query('stageId') stageId?: string,
    @Query('search') search?: string,
  ) {
    return this.applicationsService.getRecruiterPipeline(user.id, {
      jobPostId,
      stageId,
      search,
    });
  }

  @Patch('applications/:id/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái hồ sơ ứng tuyển' })
  @ApiParam({ name: 'id', description: 'UUID của hồ sơ ứng tuyển' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
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
    @Body() dto: { status: ApplicationStatus; note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applicationsService.updateStatus(user.id, id, dto.status, dto.note);
  }
}
