import { Module } from '@nestjs/common';
import { ReputationModule } from '../reputation/reputation.module';
import { AdminAppealsController } from './admin-appeals.controller';
import { AppealsController } from './appeals.controller';
import { AppealsService } from './appeals.service';

@Module({
  imports: [ReputationModule],
  controllers: [AppealsController, AdminAppealsController],
  providers: [AppealsService],
})
export class AppealsModule {}
