import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer, { Transporter } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('smtpHost');
    const user = this.configService.get<string>('smtpUser');
    const pass = this.configService.get<string>('smtpPass');

    this.transporter =
      host && user && pass
        ? nodemailer.createTransport({
            host,
            port: this.configService.getOrThrow<number>('smtpPort'),
            secure: this.configService.getOrThrow<boolean>('smtpSecure'),
            auth: {
              user,
              pass,
            },
          })
        : null;
  }

  async sendCandidateEmailVerification(params: {
    to: string;
    candidateName?: string | null;
    verificationLink: string;
  }) {
    const html = this.renderTemplate('candidate-email-verification.html', {
      candidateName: params.candidateName?.trim() || params.to,
      verificationLink: params.verificationLink,
    });

    await this.sendMail({
      to: params.to,
      subject: 'Xác thực email UpNext',
      text: `Nhấn vào link để xác thực email: ${params.verificationLink}`,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
        {
          filename: 'hero-banner.png',
          path: this.resolveEmailAssetPath('hero-banner.png'),
          cid: 'hero-banner',
        },
      ],
      fallbackLog: `Candidate email verification link for ${params.to}: ${params.verificationLink}`,
    });
  }

  async sendRecruiterEmailVerification(params: {
    to: string;
    recruiterName?: string | null;
    verificationLink: string;
  }) {
    const html = this.renderTemplate('recruiter-email-verification.html', {
      recruiterName: params.recruiterName?.trim() || params.to,
      verificationLink: params.verificationLink,
    });

    await this.sendMail({
      to: params.to,
      subject: 'Xác thực email nhà tuyển dụng UpNext',
      text: `Nhấn vào link để xác thực email: ${params.verificationLink}`,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
        {
          filename: 'hero-banner.png',
          path: this.resolveEmailAssetPath('hero-banner.png'),
          cid: 'hero-banner',
        },
      ],
      fallbackLog: `Recruiter email verification link for ${params.to}: ${params.verificationLink}`,
    });
  }

  async sendPasswordReset(params: {
    to: string;
    resetLink: string;
    actor: 'candidate' | 'recruiter';
    locale?: string;
  }) {
    const lang = params.locale === 'en' ? 'en' : 'vi';
    const templateName = `password-reset-${lang}.html`;
    const subject = lang === 'en' ? 'Reset your UpNext Password' : 'Đặt lại mật khẩu UpNext';
    const bodyText = lang === 'en' 
      ? `Click the link to reset your password: ${params.resetLink}` 
      : `Nhấn vào link để đặt lại mật khẩu: ${params.resetLink}`;

    const html = this.renderTemplate(templateName, {
      resetLink: params.resetLink,
      sentDate: this.formatSentDate(lang),
      privacyLink: this.resolveFrontendLink('/privacy'),
      unsubscribeLink: this.resolveFrontendLink('/unsubscribe'),
      termsLink: this.resolveFrontendLink('/terms'),
    });

    await this.sendMail({
      to: params.to,
      subject,
      text: bodyText,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
        {
          filename: 'rotation-lock.png',
          path: this.resolveEmailAssetPath('rotation-lock.png'),
          cid: 'rotation-lock',
        },
      ],
      fallbackLog: `${params.actor} password reset link for ${params.to}: ${params.resetLink}`,
    });
  }

  async sendCompanyInvitation(params: {
    to: string;
    companyName: string;
    invitationLink: string;
    roleName?: string | null;
  }) {
    const roleText = params.roleName ? ` với vai trò ${params.roleName}` : '';

    const html = this.renderTemplate('company-invitation.html', {
      companyName: params.companyName,
      roleText,
      invitationLink: params.invitationLink,
      sentDate: this.formatSentDate(),
    });

    await this.sendMail({
      to: params.to,
      subject: `Lời mời tham gia ${params.companyName} trên UpNext`,
      text: `Bạn được mời tham gia ${params.companyName}${roleText}. Nhấn vào link để xem lời mời: ${params.invitationLink}`,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
      ],
      fallbackLog: `Company invitation for ${params.to}: ${params.invitationLink}`,
    });
  }

  private async sendMail(params: {
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments?: Mail.Attachment[];
    fallbackLog: string;
  }) {
    if (!this.transporter) {
      this.logger.warn('SMTP is not configured. Falling back to server log.');
      this.logger.log(params.fallbackLog);
      return;
    }

    try {
      await this.transporter.sendMail({
        from:
          this.configService.get<string>('mailFrom') ?? this.configService.get<string>('smtpUser'),
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
        attachments: params.attachments,
      });
    } catch (error) {
      if (this.configService.get<string>('nodeEnv') === 'production') {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SMTP send failed. Falling back to server log. ${message}`);
      this.logger.log(params.fallbackLog);
    }
  }

  private renderTemplate(templateName: string, variables: Record<string, string>) {
    const templatePath = join(__dirname, 'templates', templateName);
    let html = readFileSync(templatePath, 'utf8');

    for (const [key, value] of Object.entries(variables)) {
      html = html.replaceAll(`{{${key}}}`, this.escapeHtml(value));
    }

    return html;
  }

  private resolveEmailAssetPath(fileName: string) {
    return join(__dirname, 'assets', fileName);
  }

  private resolveFrontendLink(path: string) {
    const frontendUrl = this.configService.getOrThrow<string>('appFrontendUrl');
    return new URL(path, frontendUrl).toString();
  }

  private formatSentDate(locale?: string) {
    const formatLocale = locale === 'en' ? 'en-US' : 'vi-VN';
    return new Intl.DateTimeFormat(formatLocale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
