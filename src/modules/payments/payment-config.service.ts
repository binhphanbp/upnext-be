import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertPaymentConfigDto } from './dto/upsert-payment-config.dto';

export type PublicSepayConfig = {
  enabled: boolean;
  bankName: string | null;
  bankBin: string | null;
  accountNumber: string | null;
  accountName: string | null;
};

export type AdminPaymentConfig = {
  provider: PaymentMethod;
  isEnabled: boolean;
  bankName: string | null;
  bankBin: string | null;
  accountNumber: string | null;
  accountName: string | null;
  /** Never the real secret -- last 4 chars only, or null if none is set. */
  webhookApiKeyMasked: string | null;
  webhookUrl: string;
};

function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

@Injectable()
export class PaymentConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private webhookUrlFor(provider: PaymentMethod): string {
    const backendUrl = (this.configService.get<string>('appBackendUrl') || '').replace(/\/+$/, '');
    // Must include the URI version segment (`enableVersioning` in main.ts) --
    // every route in this app actually lives under /api/v1/*, not /api/*.
    const path =
      provider === PaymentMethod.SEPAY ? '/api/v1/payments/sepay/webhook' : '/api/v1/payments';
    return `${backendUrl}${path}`;
  }

  async getForAdmin(provider: PaymentMethod): Promise<AdminPaymentConfig> {
    const config = await this.prisma.paymentGatewayConfig.findUnique({ where: { provider } });
    return {
      provider,
      isEnabled: config?.isEnabled ?? false,
      bankName: config?.bankName ?? null,
      bankBin: config?.bankBin ?? null,
      accountNumber: config?.accountNumber ?? null,
      accountName: config?.accountName ?? null,
      webhookApiKeyMasked: maskApiKey(config?.webhookApiKey ?? null),
      webhookUrl: this.webhookUrlFor(provider),
    };
  }

  async getPublicSepayConfig(): Promise<PublicSepayConfig> {
    const config = await this.prisma.paymentGatewayConfig.findUnique({
      where: { provider: PaymentMethod.SEPAY },
    });
    if (!config || !config.isEnabled) {
      return {
        enabled: false,
        bankName: null,
        bankBin: null,
        accountNumber: null,
        accountName: null,
      };
    }
    return {
      enabled: true,
      bankName: config.bankName,
      bankBin: config.bankBin,
      accountNumber: config.accountNumber,
      accountName: config.accountName,
    };
  }

  /** Only used internally by the webhook handler -- never exposed via an API response. */
  async getWebhookApiKey(provider: PaymentMethod): Promise<string | null> {
    const config = await this.prisma.paymentGatewayConfig.findUnique({ where: { provider } });
    return config?.webhookApiKey ?? null;
  }

  async upsert(
    provider: PaymentMethod,
    dto: UpsertPaymentConfigDto,
    adminId: string,
  ): Promise<AdminPaymentConfig> {
    // A blank webhookApiKey means "leave it as-is" -- an admin editing the
    // bank account should not be forced to re-paste the secret every time.
    const webhookApiKeyUpdate =
      dto.webhookApiKey && dto.webhookApiKey.trim().length > 0
        ? { webhookApiKey: dto.webhookApiKey.trim() }
        : {};

    await this.prisma.paymentGatewayConfig.upsert({
      where: { provider },
      update: {
        isEnabled: dto.isEnabled,
        bankName: dto.bankName,
        bankBin: dto.bankBin,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
        updatedByAdminId: adminId,
        ...webhookApiKeyUpdate,
      },
      create: {
        provider,
        isEnabled: dto.isEnabled ?? false,
        bankName: dto.bankName,
        bankBin: dto.bankBin,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName,
        updatedByAdminId: adminId,
        ...webhookApiKeyUpdate,
      },
    });

    return this.getForAdmin(provider);
  }
}
