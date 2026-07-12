import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActorType } from '@prisma/client';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ZaloBotService {
  private readonly logger = new Logger(ZaloBotService.name);
  private readonly botToken?: string;
  private readonly webhookSecret?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.botToken = this.configService.get<string>('zaloBotToken');
    this.webhookSecret = this.configService.get<string>('zaloBotWebhookSecret');
  }

  isEnabled(): boolean {
    return Boolean(this.botToken);
  }

  /**
   * Best-effort send: never throws. The Zalo Bot channel is an optional
   * reminder channel layered on top of email + in-app notifications, so a
   * failure here must never break the caller's flow.
   */
  async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.debug('Zalo bot token not configured, skipping sendMessage');
      return false;
    }

    try {
      const response = await fetch(
        `https://bot-api.zaloplatforms.com/bot${this.botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        },
      );

      const data = (await response.json().catch(() => null)) as { ok?: boolean } | null;

      if (!response.ok || !data?.ok) {
        this.logger.warn(
          `Zalo sendMessage failed for chat ${chatId}: ${response.status} ${JSON.stringify(data)}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Zalo sendMessage error for chat ${chatId}: ${message}`);
      return false;
    }
  }

  generateLinkCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[randomInt(alphabet.length)];
    }
    return code;
  }

  verifyWebhookSecret(headerValue: string | undefined): boolean {
    if (!this.webhookSecret || !headerValue) return false;

    const expected = Buffer.from(this.webhookSecret);
    const actual = Buffer.from(headerValue);

    if (expected.length !== actual.length) return false;

    return timingSafeEqual(expected, actual);
  }

  async getStatus(user: AuthenticatedUser): Promise<{ enabled: boolean; linked: boolean }> {
    const account = await this.findAccount(user);
    return { enabled: this.isEnabled(), linked: Boolean(account?.zaloChatId) };
  }

  /**
   * Issues a fresh one-time code the user must send to the bot from the
   * Zalo app. Retries on the rare unique-collision.
   */
  async createLinkCode(user: AuthenticatedUser): Promise<{ code: string }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateLinkCode();
      try {
        await this.updateAccount(user, { zaloLinkCode: code });
        return { code };
      } catch {
        // Unique collision on zaloLinkCode — retry with a fresh code.
      }
    }

    throw new Error('Failed to generate a unique Zalo link code, please try again');
  }

  async unlink(user: AuthenticatedUser): Promise<void> {
    await this.updateAccount(user, { zaloChatId: null, zaloLinkCode: null });
  }

  /**
   * Called from the webhook when a user sends a plain text message to the
   * bot. If the text matches a pending link code, binds that Zalo chat to
   * the corresponding candidate/recruiter account.
   */
  async handleIncomingMessage(chatId: string, text: string): Promise<void> {
    const code = text.trim().toUpperCase();
    if (!code) return;

    const candidate = await this.prisma.candidateAccount.findUnique({
      where: { zaloLinkCode: code },
      select: { id: true, fullName: true },
    });

    if (candidate) {
      await this.prisma.candidateAccount.update({
        where: { id: candidate.id },
        data: { zaloChatId: chatId, zaloLinkCode: null },
      });
      await this.sendMessage(
        chatId,
        `Đã liên kết thành công với tài khoản ứng viên "${candidate.fullName}" trên UpNext. Bạn sẽ nhận được nhắc lịch phỏng vấn qua đây.`,
      );
      return;
    }

    const recruiter = await this.prisma.recruiterAccount.findUnique({
      where: { zaloLinkCode: code },
      select: { id: true, email: true },
    });

    if (recruiter) {
      await this.prisma.recruiterAccount.update({
        where: { id: recruiter.id },
        data: { zaloChatId: chatId, zaloLinkCode: null },
      });
      await this.sendMessage(
        chatId,
        `Đã liên kết thành công với tài khoản nhà tuyển dụng "${recruiter.email}" trên UpNext. Bạn sẽ nhận được nhắc lịch phỏng vấn qua đây.`,
      );
      return;
    }

    await this.sendMessage(
      chatId,
      'Mã liên kết không hợp lệ hoặc đã hết hạn. Vui lòng lấy mã mới từ trang cài đặt trên UpNext.',
    );
  }

  private async findAccount(
    user: AuthenticatedUser,
  ): Promise<{ zaloChatId: string | null } | null> {
    if (user.role === ActorType.CANDIDATE) {
      return this.prisma.candidateAccount.findUnique({
        where: { id: user.id },
        select: { zaloChatId: true },
      });
    }

    if (user.role === ActorType.RECRUITER) {
      return this.prisma.recruiterAccount.findUnique({
        where: { id: user.id },
        select: { zaloChatId: true },
      });
    }

    return null;
  }

  private async updateAccount(
    user: AuthenticatedUser,
    data: { zaloChatId?: string | null; zaloLinkCode?: string | null },
  ): Promise<void> {
    if (user.role === ActorType.CANDIDATE) {
      await this.prisma.candidateAccount.update({ where: { id: user.id }, data });
      return;
    }

    if (user.role === ActorType.RECRUITER) {
      await this.prisma.recruiterAccount.update({ where: { id: user.id }, data });
      return;
    }

    throw new Error('Only candidate and recruiter accounts can link Zalo');
  }
}
