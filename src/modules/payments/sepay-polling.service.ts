import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';

export interface SePayTransactionItem {
  id: string | number;
  transaction_date?: string;
  transactionDate?: string;
  account_number?: string;
  accountNumber?: string;
  transfer_type?: string;
  transferType?: string;
  amount_in?: number | string;
  transferAmount?: number;
  amount_out?: number | string;
  transaction_content?: string;
  content?: string;
  description?: string;
  reference_number?: string;
  referenceCode?: string;
  code?: string;
}

@Injectable()
export class SepayPollingService {
  private readonly logger = new Logger(SepayPollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /**
   * Helper to determine SePay API endpoints based on environment and config.
   */
  private getApiUrls(config: { bankName?: string | null; apiToken?: string | null }) {
    const isSandbox =
      config.bankName?.toLowerCase().includes('sandbox') ||
      config.bankName?.toLowerCase().includes('test') ||
      config.apiToken?.toLowerCase().includes('sandbox') ||
      config.apiToken?.toLowerCase().includes('test');

    if (isSandbox) {
      return [
        'https://userapi-sandbox.sepay.vn/v2/transactions?per_page=50',
        'https://userapi.sepay.vn/v2/transactions?per_page=50',
      ];
    }
    return [
      'https://userapi.sepay.vn/v2/transactions?per_page=50',
      'https://userapi-sandbox.sepay.vn/v2/transactions?per_page=50',
    ];
  }

  /**
   * Test connection to SePay API using the configured (or provided) API token.
   */
  async testConnection(customToken?: string): Promise<{
    success: boolean;
    isSandbox: boolean;
    message: string;
    transactionCount?: number;
  }> {
    const config = await this.prisma.paymentGatewayConfig.findUnique({
      where: { provider: PaymentMethod.SEPAY },
    });

    const token = customToken?.trim() || config?.apiToken?.trim() || config?.webhookSecret?.trim();
    if (!token) {
      return {
        success: false,
        isSandbox: false,
        message: 'Chưa nhập SePay API Token.',
      };
    }

    const urls = this.getApiUrls({ bankName: config?.bankName, apiToken: token });
    const isSandbox = urls[0].includes('sandbox');

    try {
      const response = await fetch(urls[0], {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // If 401/403: Invalid token
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            isSandbox,
            message: `API Token không hợp lệ (HTTP ${response.status}). Vui lòng kiểm tra lại token trong SePay -> API Access.`,
          };
        }
        return {
          success: false,
          isSandbox,
          message: `Không thể kết nối đến SePay API (HTTP ${response.status}).`,
        };
      }

      const json = await response.json();
      const list = (json.data || json.transactions || []) as SePayTransactionItem[];

      return {
        success: true,
        isSandbox,
        transactionCount: list.length,
        message: `Kết nối thành công với SePay ${isSandbox ? '(Sandbox)' : '(Live)'}! Lấy được ${list.length} giao dịch gần nhất.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to test SePay API connection: ${msg}`);
      return {
        success: false,
        isSandbox,
        message: `Lỗi kết nối đến SePay API: ${msg}`,
      };
    }
  }

  /**
   * Actively polls SePay API to check if an invoice has received its payment.
   * If a matching inbound transaction is found, automatically marks the invoice as PAID
   * and activates the recruiter's subscription plan.
   */
  async checkInvoicePayment(invoiceIdOrCode: string): Promise<{
    paid: boolean;
    status: string;
    message: string;
    invoice?: {
      id: string;
      invoiceCode: string;
      amount: number;
      paymentStatus: string;
    };
    transaction?: SePayTransactionItem;
  }> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceIdOrCode);

    const invoice = await this.prisma.invoice.findFirst({
      where: isUuid
        ? { id: invoiceIdOrCode }
        : { invoiceCode: invoiceIdOrCode },
      include: {
        subscriptionPlan: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Không tìm thấy hóa đơn: ${invoiceIdOrCode}`);
    }

    // Already paid -> return success immediately
    if (invoice.paymentStatus === 'PAID') {
      return {
        paid: true,
        status: 'PAID',
        message: 'Hóa đơn này đã được thanh toán thành công!',
        invoice: {
          id: invoice.id,
          invoiceCode: invoice.invoiceCode,
          amount: Number(invoice.amount),
          paymentStatus: invoice.paymentStatus,
        },
      };
    }

    if (invoice.paymentStatus === 'REFUNDED' || invoice.paymentStatus === 'FAILED') {
      return {
        paid: false,
        status: invoice.paymentStatus,
        message: `Hóa đơn đang ở trạng thái: ${invoice.paymentStatus}`,
      };
    }

    // Fetch SePay config
    const config = await this.prisma.paymentGatewayConfig.findUnique({
      where: { provider: PaymentMethod.SEPAY },
    });

    const token = config?.apiToken?.trim() || config?.webhookSecret?.trim();
    if (!token) {
      return {
        paid: false,
        status: invoice.paymentStatus,
        message:
          'Hệ thống chưa cấu hình SePay API Token. Vui lòng liên hệ Admin để cập nhật trong Cấu hình thanh toán.',
      };
    }

    const urls = this.getApiUrls({ bankName: config?.bankName, apiToken: token });
    let transactions: SePayTransactionItem[] = [];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const json = await response.json();
          transactions = (json.data || json.transactions || []) as SePayTransactionItem[];
          if (transactions.length > 0) break;
        } else {
          this.logger.warn(`SePay API at ${url} responded with status ${response.status}`);
        }
      } catch (err: unknown) {
        this.logger.warn(`Error querying SePay API at ${url}: ${err}`);
      }
    }

    const cleanInvoiceCode = invoice.invoiceCode.toUpperCase();
    const invoiceDigits = cleanInvoiceCode.replace(/[^0-9]/g, '');
    const prefix = config?.contentPrefix?.toUpperCase() ?? '';

    // Look for matching inbound transaction
    for (const tx of transactions) {
      const transferType = (tx.transfer_type || tx.transferType || '').toLowerCase();
      const amountIn = Number(tx.amount_in ?? tx.transferAmount ?? 0);

      // Must be incoming funds
      if (transferType !== 'in' && amountIn <= 0) {
        continue;
      }

      const content = (tx.transaction_content || tx.content || tx.description || '').toUpperCase();
      const code = (tx.code || '').toUpperCase();

      // Check required prefix if configured
      if (prefix && !content.includes(prefix) && !code.includes(prefix)) {
        continue;
      }

      // Check invoice code in content or code field
      const matchesCode =
        code === cleanInvoiceCode ||
        content.includes(cleanInvoiceCode) ||
        (invoiceDigits.length >= 8 && content.includes(invoiceDigits));

      if (matchesCode) {
        const expectedAmount = Number(invoice.amount);
        if (amountIn >= expectedAmount) {
          // Found matching payment! Activate invoice immediately
          const reference =
            tx.reference_number ||
            tx.referenceCode ||
            String(tx.id || `SEPAY-${Date.now()}`);

          await this.invoicesService.markPaidByWebhook(
            invoice.invoiceCode,
            PaymentMethod.SEPAY,
            reference,
            amountIn,
          );

          this.logger.log(
            `SePay API Polling: Successfully verified payment for invoice ${invoice.invoiceCode} (Ref: ${reference})`,
          );

          return {
            paid: true,
            status: 'PAID',
            message: 'Đã nhận được tiền thanh toán! Gói dịch vụ đã được kích hoạt thành công.',
            invoice: {
              id: invoice.id,
              invoiceCode: invoice.invoiceCode,
              amount: Number(invoice.amount),
              paymentStatus: 'PAID',
            },
            transaction: tx,
          };
        } else {
          this.logger.warn(
            `SePay API Polling: Matching content found but amount mismatch: expected ${expectedAmount}, received ${amountIn}`,
          );
        }
      }
    }

    return {
      paid: false,
      status: invoice.paymentStatus,
      message: 'Chưa tìm thấy giao dịch chuyển khoản cho hóa đơn này trên tài khoản ngân hàng.',
      invoice: {
        id: invoice.id,
        invoiceCode: invoice.invoiceCode,
        amount: Number(invoice.amount),
        paymentStatus: invoice.paymentStatus,
      },
    };
  }
}
