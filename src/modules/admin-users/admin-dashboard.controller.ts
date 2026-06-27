import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardQueryDto } from './dto/admin-dashboard-query.dto';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy dữ liệu dashboard thống kê nền tảng cho admin' })
  @ApiOkResponse({ description: 'Lấy dữ liệu dashboard thống kê nền tảng cho admin thành công.' })
  getDashboard(@Query() query: AdminDashboardQueryDto) {
    return this.dashboardService.getDashboard(query);
  }
}
