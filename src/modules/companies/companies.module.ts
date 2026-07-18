import { Module } from '@nestjs/common';
import { EmailService } from '../../common/email/email.service';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, EmailService],
})
export class CompaniesModule {}
