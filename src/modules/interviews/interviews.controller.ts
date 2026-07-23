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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AllowWhenRestricted } from '../../common/decorators/allow-when-restricted.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RestrictedModeGuard } from '../auth/guards/restricted-mode.guard';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { RescheduleInterviewDto } from './dto/reschedule-interview.dto';
import { CancelInterviewDto } from './dto/cancel-interview.dto';
import { UpdateInterviewResultDto } from './dto/update-interview-result.dto';
import { InterviewsService } from './interviews.service';

@ApiTags('Interviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @ApiOperation({ summary: 'Lên lịch phỏng vấn mới' })
  @ApiCreatedResponse({ description: 'Tạo và lên lịch phỏng vấn thành công' })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiForbiddenResponse({ description: 'Không có quyền lên lịch phỏng vấn cho hồ sơ này' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy Application hoặc Recruiter' })
  create(@Body() dto: CreateInterviewDto, @CurrentUser() user: AuthenticatedUser) {
    return this.interviewsService.create(dto, user);
  }

  @Get()
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER, ActorType.ADMIN)
  @AllowWhenRestricted()
  @ApiOperation({ summary: 'Lấy danh sách các cuộc phỏng vấn' })
  @ApiQuery({ name: 'applicationId', required: false, description: 'Lọc theo ID của Application' })
  @ApiOkResponse({ description: 'Lấy danh sách thành công' })
  findAll(@Query('applicationId') applicationId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interviewsService.findAll({ applicationId }, user);
  }

  @Get(':id')
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER, ActorType.ADMIN)
  @AllowWhenRestricted()
  @ApiOperation({ summary: 'Lấy thông tin chi tiết cuộc phỏng vấn kèm logs' })
  @ApiParam({ name: 'id', description: 'Interview UUID' })
  @ApiOkResponse({ description: 'Lấy chi tiết thành công' })
  @ApiForbiddenResponse({ description: 'Không có quyền truy cập cuộc phỏng vấn này' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy cuộc phỏng vấn' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interviewsService.findOne(id, user);
  }

  @Patch(':id/reschedule')
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER, ActorType.ADMIN)
  @ApiOperation({ summary: 'Đề xuất hoặc dời lịch phỏng vấn mới' })
  @ApiParam({ name: 'id', description: 'Interview UUID' })
  @ApiOkResponse({ description: 'Dời lịch phỏng vấn thành công' })
  @ApiBadRequestResponse({
    description: 'Lịch phỏng vấn đã hoàn thành/hủy hoặc vượt quá giới hạn dời lịch',
  })
  @ApiForbiddenResponse({ description: 'Không có quyền dời lịch phỏng vấn này' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy cuộc phỏng vấn' })
  reschedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RescheduleInterviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interviewsService.reschedule(id, dto, user);
  }

  @Patch(':id/cancel')
  @Roles(ActorType.CANDIDATE, ActorType.RECRUITER, ActorType.ADMIN)
  @ApiOperation({ summary: 'Hủy lịch phỏng vấn' })
  @ApiParam({ name: 'id', description: 'Interview UUID' })
  @ApiOkResponse({ description: 'Hủy phỏng vấn thành công' })
  @ApiBadRequestResponse({ description: 'Lịch phỏng vấn đã hoàn thành/hủy' })
  @ApiForbiddenResponse({ description: 'Không có quyền hủy lịch phỏng vấn này' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy cuộc phỏng vấn' })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelInterviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interviewsService.cancel(id, dto, user);
  }

  @Patch(':id/result')
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @ApiOperation({ summary: 'Cập nhật kết quả phỏng vấn và hoàn thành phỏng vấn' })
  @ApiParam({ name: 'id', description: 'Interview UUID' })
  @ApiOkResponse({ description: 'Cập nhật kết quả thành công' })
  @ApiBadRequestResponse({ description: 'Lịch phỏng vấn đã bị hủy trước đó' })
  @ApiForbiddenResponse({ description: 'Không có quyền cập nhật kết quả phỏng vấn này' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy cuộc phỏng vấn' })
  updateResult(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInterviewResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interviewsService.updateResult(id, dto, user);
  }
}
