import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

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
    verificationLink: string;
  }) {
    await this.sendMail({
      to: params.to,
      subject: 'Xác thực email UpNext',
      text: `Nhấn vào link để xác thực email: ${params.verificationLink}`,
      html: `
        <p>Nhấn vào link bên dưới để xác thực email UpNext:</p>
        <p><a href="${params.verificationLink}">${params.verificationLink}</a></p>
        <p>Link sẽ hết hạn sau 24 giờ.</p>
      `,
      fallbackLog: `Candidate email verification link for ${params.to}: ${params.verificationLink}`,
    });
  }

  async sendPasswordReset(params: {
    to: string;
    resetLink: string;
    actor: 'candidate' | 'recruiter';
  }) {
    await this.sendMail({
      to: params.to,
      subject: 'Đặt lại mật khẩu UpNext',
      text: `Nhấn vào link để đặt lại mật khẩu: ${params.resetLink}`,
      html: `
        <p>Nhấn vào link bên dưới để đặt lại mật khẩu UpNext:</p>
        <p><a href="${params.resetLink}">${params.resetLink}</a></p>
        <p>Link sẽ hết hạn sau 15 phút.</p>
      `,
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

    await this.sendMail({
      to: params.to,
      subject: `Lời mời tham gia ${params.companyName} trên UpNext`,
      text: `Bạn được mời tham gia ${params.companyName}${roleText}. Nhấn vào link để xem lời mời: ${params.invitationLink}`,
      html: `
        <p>Bạn được mời tham gia <strong>${params.companyName}</strong>${roleText} trên UpNext.</p>
        <p>Nhấn vào link bên dưới để xem và chấp nhận lời mời:</p>
        <p><a href="${params.invitationLink}">${params.invitationLink}</a></p>
      `,
      fallbackLog: `Company invitation for ${params.to}: ${params.invitationLink}`,
    });
  }

  private async sendMail(params: {
    to: string;
    subject: string;
    text: string;
    html: string;
    fallbackLog: string;
  }) {
    if (!this.transporter) {
      this.logger.warn('SMTP is not configured. Falling back to server log.');
      this.logger.log(params.fallbackLog);
      return;
    }

    await this.transporter.sendMail({
      from:
        this.configService.get<string>('mailFrom') ??
        this.configService.get<string>('smtpUser'),
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  }
}
