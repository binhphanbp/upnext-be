import { Module } from '@nestjs/common';
import { CompanySubscriptionsService } from './company-subscriptions.service';
import { CompanySubscriptionsController } from './company-subscriptions.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompanySubscriptionsController],
  providers: [CompanySubscriptionsService],
  exports: [CompanySubscriptionsService],
})
export class CompanySubscriptionsModule {}
