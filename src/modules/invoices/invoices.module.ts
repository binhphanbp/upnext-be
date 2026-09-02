import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { AdminInvoicesController } from './admin-invoices.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CompanySubscriptionsModule } from '../company-subscriptions/company-subscriptions.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';

@Module({
  imports: [PrismaModule, CompanySubscriptionsModule, AdminUsersModule],
  controllers: [InvoicesController, AdminInvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}

