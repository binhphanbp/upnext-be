import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { AdminPermissions } from '../../common/decorators/admin-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AdminAuditLogQueryDto } from './dto/admin-audit-log-query.dto';

@ApiTags('Admin - Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(ActorType.ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogService: AdminAuditLogService) {}

  @Get()
  @AdminPermissions('system:audit')
  @ApiOperation({ summary: 'Lấy danh sách nhật ký hệ thống có phân trang và bộ lọc' })
  findAuditLogs(@Query() query: AdminAuditLogQueryDto) {
    return this.auditLogService.findAuditLogs(query);
  }

  @Get('stats')
  @AdminPermissions('system:audit')
  @ApiOperation({ summary: 'Lấy thống kê KPI nhật ký hệ thống' })
  getStats() {
    return this.auditLogService.getAuditLogStats();
  }

  @Get('filter-options')
  @AdminPermissions('system:audit')
  @ApiOperation({ summary: 'Lấy danh sách lựa chọn cho bộ lọc nhật ký' })
  getFilterOptions() {
    return this.auditLogService.getAuditLogFilterOptions();
  }

  @Get(':id')
  @AdminPermissions('system:audit')
  @ApiOperation({ summary: 'Xem chi tiết một bản ghi nhật ký' })
  findAuditLogById(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditLogService.findAuditLogById(id);
  }
}
