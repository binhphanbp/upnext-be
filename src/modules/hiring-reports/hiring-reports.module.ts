import { Module } from '@nestjs/common';
import { ReputationModule } from '../reputation/reputation.module';
import { HiringReportsController } from './hiring-reports.controller';
import { HiringReportsService } from './hiring-reports.service';

@Module({
  imports: [ReputationModule],
  controllers: [HiringReportsController],
  providers: [HiringReportsService],
})
export class HiringReportsModule {}
