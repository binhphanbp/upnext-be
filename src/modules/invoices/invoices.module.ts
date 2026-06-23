import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CompanySubscriptionsModule } from '../company-subscriptions/company-subscriptions.module';

@Module({
  imports: [PrismaModule, CompanySubscriptionsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
