import { Module } from '@nestjs/common';
import { EmailService } from '../../common/email/email.service';
import { ReputationModule } from '../reputation/reputation.module';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';

@Module({
  imports: [ReputationModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, EmailService],
})
export class CompaniesModule {}
