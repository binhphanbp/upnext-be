import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigService } from './payment-config.service';
import { SepayWebhookController } from './sepay-webhook.controller';
import { SepayWebhookService } from './sepay-webhook.service';
import { SepayPollingService } from './sepay-polling.service';

@Module({
  imports: [PrismaModule, InvoicesModule],
  controllers: [PaymentConfigController, SepayWebhookController],
  providers: [PaymentConfigService, SepayWebhookService, SepayPollingService],
  exports: [PaymentConfigService, SepayPollingService],
})
export class PaymentsModule {}

