import { Module } from '@nestjs/common';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

@Module({
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminAccountsController,
    AdminAuditLogsController,
  ],
  providers: [
    AdminAuthService,
    AdminDashboardService,
    AdminAccountsService,
    AdminAuditLogService,
  ],
  exports: [AdminAccountsService, AdminAuditLogService],
})
export class AdminUsersModule {}


