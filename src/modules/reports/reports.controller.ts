import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Candidate - Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @Roles(ActorType.CANDIDATE)
  @ApiOperation({ summary: 'Tạo báo cáo vi phạm mới (Ứng viên)' })
  @ApiCreatedResponse({ description: 'Báo cáo vi phạm đã được tạo thành công.' })
  create(@Body() dto: CreateReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.create(user, dto);
  }

  @Get('check')
  @Roles(ActorType.CANDIDATE)
  @ApiOperation({ summary: 'Kiểm tra trạng thái báo cáo của ứng viên cho đối tượng' })
  checkReportStatus(
    @Query('targetType') targetType: string,
    @Query('targetId') targetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.findActiveCandidateReport(user.id, targetType, targetId);
  }
}
