import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SubmitHiringReportDto } from './dto/submit-hiring-report.dto';
import { HiringReportsService } from './hiring-reports.service';

@ApiTags('Recruiter - Hiring Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('job-posts/:jobPostId/hiring-report')
export class HiringReportsController {
  constructor(private readonly hiringReportsService: HiringReportsService) {}

  @Post()
  @Roles(ActorType.RECRUITER)
  @ApiOperation({ summary: 'Báo cáo kết quả tuyển dụng sau khi tin đã hết hạn' })
  @ApiCreatedResponse({ description: 'Báo cáo kết quả tuyển dụng thành công, cộng điểm uy tín.' })
  submit(
    @Param('jobPostId', ParseUUIDPipe) jobPostId: string,
    @Body() dto: SubmitHiringReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hiringReportsService.submit(jobPostId, user.id, dto);
  }

  @Get()
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @ApiOperation({ summary: 'Xem báo cáo kết quả tuyển dụng của 1 tin (nếu đã nộp)' })
  @ApiOkResponse({ description: 'Lấy báo cáo thành công (null nếu chưa nộp).' })
  findOne(@Param('jobPostId', ParseUUIDPipe) jobPostId: string) {
    return this.hiringReportsService.findByJobPost(jobPostId);
  }
}
