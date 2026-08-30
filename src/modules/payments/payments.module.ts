import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigService } from './payment-config.service';
import { SepayWebhookController } from './sepay-webhook.controller';
import { SepayWebhookService } from './sepay-webhook.service';

@Module({
  imports: [PrismaModule, InvoicesModule],
  controllers: [PaymentConfigController, SepayWebhookController],
  providers: [PaymentConfigService, SepayWebhookService],
  exports: [PaymentConfigService],
})
export class PaymentsModule {}
