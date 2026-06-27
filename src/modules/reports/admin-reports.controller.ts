import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { ReportsService } from './reports.service';

@ApiTags('Admin - Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách báo cáo vi phạm cho Admin' })
  @ApiOkResponse({ description: 'Lấy danh sách báo cáo thành công.' })
  findAll(@Query() query: ListReportsQueryDto) {
    return this.reportsService.findAllForAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết báo cáo vi phạm' })
  @ApiOkResponse({ description: 'Lấy chi tiết báo cáo thành công.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Duyệt báo cáo vi phạm (cập nhật trạng thái)' })
  @ApiOkResponse({ description: 'Cập nhật trạng thái báo cáo thành công.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.updateStatus(id, user.id, dto.status);
  }
}
