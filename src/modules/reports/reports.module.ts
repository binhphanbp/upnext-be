import { Module } from '@nestjs/common';
import { EmailService } from '../../common/email/email.service';
import { ReputationModule } from '../reputation/reputation.module';
import { AdminReportsController } from './admin-reports.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ReputationModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService, EmailService],
  exports: [ReportsService],
})
export class ReportsModule {}
