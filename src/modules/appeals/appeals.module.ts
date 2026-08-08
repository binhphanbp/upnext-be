import { Module } from '@nestjs/common';
import { EmailService } from '../../common/email/email.service';
import { ReputationModule } from '../reputation/reputation.module';
import { AdminAppealsController } from './admin-appeals.controller';
import { AppealsController } from './appeals.controller';
import { AppealsService } from './appeals.service';

@Module({
  imports: [ReputationModule],
  controllers: [AppealsController, AdminAppealsController],
  providers: [AppealsService, EmailService],
})
export class AppealsModule {}
