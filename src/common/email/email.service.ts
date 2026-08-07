import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
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
          filename: 'flaticon.png',
          path: this.resolveEmailAssetPath('flaticon.png'),
          cid: 'flaticon',
          contentDisposition: 'inline',
        },
        {
          filename: 'image-footer.png',
          path: this.resolveEmailAssetPath('image-footer.png'),
          cid: 'image-footer',
          contentDisposition: 'inline',
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

  async sendCompanyPendingReviewToAdmin(params: {
    to: string;
    adminName?: string | null;
    companyName: string;
    recruiterName?: string | null;
    recruiterEmail: string;
    reviewLink: string;
  }) {
    const html = this.renderTemplate('company-submitted-admin.html', {
      adminName: params.adminName?.trim() || 'Quản trị viên',
      companyName: params.companyName,
      recruiterName: params.recruiterName?.trim() || params.recruiterEmail,
      recruiterEmail: params.recruiterEmail,
      reviewLink: params.reviewLink,
      sentDate: this.formatSentDate(),
    });

    await this.sendMail({
      to: params.to,
      subject: `[UpNext] Hồ sơ doanh nghiệp mới chờ duyệt: ${params.companyName}`,
      text: `Doanh nghiệp "${params.companyName}" (gửi bởi ${params.recruiterEmail}) đang chờ duyệt. Xem tại: ${params.reviewLink}`,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
      ],
      fallbackLog: `Company pending review "${params.companyName}" -> admin ${params.to}`,
    });
  }

  async sendCompanySubmittedToRecruiter(params: {
    to: string;
    recruiterName?: string | null;
    companyName: string;
  }) {
    const html = this.renderTemplate('company-submitted-recruiter.html', {
      recruiterName: params.recruiterName?.trim() || params.to,
      companyName: params.companyName,
      sentDate: this.formatSentDate(),
    });

    await this.sendMail({
      to: params.to,
      subject: `[UpNext] Đã nhận hồ sơ doanh nghiệp ${params.companyName}`,
      text: `Chúng tôi đã nhận hồ sơ doanh nghiệp "${params.companyName}" và đang chờ duyệt. UpNext sẽ thông báo kết quả sớm.`,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
      ],
      fallbackLog: `Company submission ack "${params.companyName}" -> recruiter ${params.to}`,
    });
  }

  async sendCompanyVerificationResult(params: {
    to: string;
    recruiterName?: string | null;
    companyName: string;
    approved: boolean;
    reason?: string | null;
    guidance?: string | null;
    recruiterCode?: string | null;
    companyLink: string;
  }) {
    const templateName = params.approved
      ? 'company-approved.html'
      : 'company-rejected.html';

    const name = params.recruiterName?.trim() || params.to;
    const recipientName = params.recruiterCode
      ? `${name} - Mã NTD ${params.recruiterCode}`
      : name;

    const html = this.renderTemplate(templateName, {
      recruiterName: name,
      recipientName,
      companyName: params.companyName,
      reason: params.reason?.trim() || 'Không có lý do cụ thể được cung cấp.',
      guidance:
        params.guidance?.trim() ||
        'Vui lòng đăng tải giấy chứng nhận đăng ký doanh nghiệp hoặc giấy tờ tương đương theo đúng quy định.',
      companyLink: params.companyLink,
      guidelinesLink: this.resolveFrontendLink('/huong-dan-xac-thuc-doanh-nghiep'),
      supportHotline: this.configService.get<string>('supportHotline') || '1900 0000',
      supportEmail:
        this.configService.get<string>('supportEmail') ||
        this.configService.get<string>('mailFrom') ||
        'cskh@upnext.works',
      supportZalo: this.configService.get<string>('supportZalo') || 'https://zalo.me/upnext',
      sentDate: this.formatSentDate(),
    });

    const subject = params.approved
      ? `[UpNext] Doanh nghiệp ${params.companyName} đã được duyệt`
      : `[UpNext] Hồ sơ doanh nghiệp ${params.companyName} chưa được duyệt`;

    const text = params.approved
      ? `Chúc mừng! Doanh nghiệp "${params.companyName}" của bạn đã được xác thực trên UpNext.`
      : `Hồ sơ doanh nghiệp "${params.companyName}" chưa được duyệt. Lý do: ${params.reason ?? 'Không có lý do cụ thể.'}`;

    await this.sendMail({
      to: params.to,
      subject,
      text,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
      ],
      fallbackLog: `Company verification (${params.approved ? 'approved' : 'rejected'}) "${params.companyName}" -> recruiter ${params.to}`,
    });
  }

  async sendInterviewReminder(params: {
    to: string;
    recipientName?: string | null;
    jobTitle: string;
    scheduledStartAt: Date;
    interviewType: 'ONLINE' | 'ONSITE';
    meetingUrl?: string | null;
    location?: string | null;
  }) {
    const scheduledTime = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(params.scheduledStartAt);
    const interviewTypeLabel = params.interviewType === 'ONLINE' ? 'Trực tuyến' : 'Trực tiếp';
    const locationOrMeetingLine =
      params.interviewType === 'ONLINE'
        ? params.meetingUrl
          ? `Link tham gia: ${params.meetingUrl}`
          : 'Vui lòng kiểm tra link tham gia trong phần chi tiết phỏng vấn.'
        : params.location
          ? `Địa điểm: ${params.location}`
          : 'Vui lòng kiểm tra địa điểm trong phần chi tiết phỏng vấn.';

    const html = this.renderTemplate('interview-reminder.html', {
      recipientName: params.recipientName?.trim() || params.to,
      jobTitle: params.jobTitle,
      scheduledTime,
      interviewType: interviewTypeLabel,
      locationOrMeetingLine,
      sentDate: this.formatSentDate(),
    });

    await this.sendMail({
      to: params.to,
      subject: `[UpNext] Nhắc lịch phỏng vấn: ${params.jobTitle}`,
      text: `Buổi phỏng vấn cho vị trí ${params.jobTitle} sẽ diễn ra lúc ${scheduledTime}.`,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
      ],
      fallbackLog: `Interview reminder for "${params.jobTitle}" -> ${params.to} at ${scheduledTime}`,
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
      if (this.configService.get<string>('appEnv') === 'production') {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SMTP send failed. Falling back to server log. ${message}`);
      this.logger.log(params.fallbackLog);
    }
  }

  private renderTemplate(templateName: string, variables: Record<string, string>) {
    const templatePath = this.resolveEmailResourcePath('templates', templateName);
    let html = readFileSync(templatePath, 'utf8');

    for (const [key, value] of Object.entries(variables)) {
      html = html.replaceAll(`{{${key}}}`, this.escapeHtml(value));
    }

    return html;
  }

  private resolveEmailAssetPath(fileName: string) {
    return this.resolveEmailResourcePath('assets', fileName);
  }

  /**
   * Templates and images are build assets, so they sit next to the compiled
   * service -- `nest-cli.json` copies them into every dist layout this repo
   * produces (`dist/**` from tsconfig.build.json, `dist/src/**` from the watcher).
   * The source tree is the last resort so a plain `tsx`/ts-node run still works.
   *
   * Every candidate is anchored on `__dirname`, never on `process.cwd()`: a
   * process manager such as pm2 can start the server from any directory.
   */
  private resolveEmailResourcePath(resourceDirectory: 'assets' | 'templates', fileName: string) {
    const paths = [
      join(__dirname, resourceDirectory, fileName),
      join(__dirname, '..', '..', '..', 'src', 'common', 'email', resourceDirectory, fileName),
      join(__dirname, '..', '..', '..', '..', 'src', 'common', 'email', resourceDirectory, fileName),
    ];

    return paths.find(existsSync) ?? paths[0];
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
