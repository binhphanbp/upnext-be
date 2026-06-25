import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

@Module({
  controllers: [AdminAuthController, AdminDashboardController],
  providers: [AdminAuthService, AdminDashboardService],
})
export class AdminUsersModule {}
