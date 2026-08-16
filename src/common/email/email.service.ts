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
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 10000,
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

  async sendOfferLetter(params: {
    to: string;
    candidateName?: string | null;
    jobTitle: string;
    companyName: string;
    salaryOffer?: string | null;
    startDate?: string | null;
    expiryDateText?: string | null;
    offerNote?: string | null;
    offerLetterUrl?: string | null;
    attachmentName?: string | null;
    applicationLink: string;
  }) {
    let salary = params.salaryOffer || 'Thỏa thuận';
    let start = params.startDate || 'Theo trao đổi trực tiếp';
    let expiry = params.expiryDateText || '7 ngày';
    let noteText = params.offerNote || '';
    let offerLetterUrl = params.offerLetterUrl || '';
    let attachmentName = params.attachmentName || '';

    // If offerNote is JSON string from SendOfferDialog, parse it
    if (params.offerNote && params.offerNote.startsWith('{')) {
      try {
        const parsed = JSON.parse(params.offerNote);
        if (parsed.salaryOffer) salary = parsed.salaryOffer;
        if (parsed.startDate) start = parsed.startDate;
        if (parsed.expiryDateText) expiry = parsed.expiryDateText;
        if (parsed.note !== undefined) noteText = parsed.note;
        if (parsed.offerLetterUrl) offerLetterUrl = parsed.offerLetterUrl;
        if (parsed.attachmentName) attachmentName = parsed.attachmentName;
      } catch {
        // Note is a plain string rather than JSON
      }
    }

    const defaultNoteHtml =
      'Chúc mừng bạn! Chúng tôi rất ấn tượng với năng lực và kinh nghiệm của bạn trong suốt quá trình phỏng vấn. Công ty trân trọng mời bạn gia nhập đội ngũ với các điều khoản đề xuất trên.<br/><br/>Vui lòng xem kỹ thông tin và phản hồi lại cho chúng tôi trước hạn chót. Rất mong được đồng hành cùng bạn!';

    const formattedNoteHtml = noteText
      ? this.escapeHtml(noteText).replaceAll('\n', '<br/>')
      : defaultNoteHtml;

    const html = this.renderTemplate('offer-letter.html', {
      candidateName: params.candidateName?.trim() || params.to,
      jobTitle: params.jobTitle,
      companyName: params.companyName,
      salaryOffer: salary,
      startDate: start,
      expiryDateText: expiry,
      offerNoteHtml: formattedNoteHtml,
      offerLetterUrl: offerLetterUrl.trim(),
      attachmentName: attachmentName.trim() || 'Thư mời nhận việc đính kèm',
      applicationLink: params.applicationLink,
      sentDate: this.formatSentDate(),
    });

    await this.sendMail({
      to: params.to,
      subject: `[UpNext] Thư mời nhận việc - ${params.jobTitle} - ${params.companyName}`,
      text: `Chúc mừng! Qua quá trình ứng tuyển và phỏng vấn, ${params.companyName} trân trọng gửi tới bạn Thư mời nhận việc cho vị trí ${params.jobTitle}. Xem chi tiết tại: ${params.applicationLink}`,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
      ],
      fallbackLog: `Offer letter for "${params.jobTitle}" from ${params.companyName} -> ${params.to}`,
    });
  }

  /**
   * Every moderation notification (report / appeal, to admin / reporter / affected party)
   * shares one template — they differ only in wording, so a file each would be six copies
   * of the same markup to keep in sync.
   */
  private async sendModerationNotice(params: {
    to: string;
    subject: string;
    text: string;
    title: string;
    subtitle: string;
    recipientName: string;
    message: string;
    details: { label: string; value: string }[];
    ctaLabel?: string;
    ctaLink?: string;
    footerNote: string;
    /** Red for enforcement, green for everything else. */
    accent?: 'positive' | 'negative';
  }) {
    const [detailOne, detailTwo, detailThree] = params.details;

    const html = this.renderTemplate('moderation-notice.html', {
      title: params.title,
      subtitle: params.subtitle,
      recipientName: params.recipientName,
      message: params.message,
      detailOneLabel: detailOne?.label ?? '',
      detailOneValue: detailOne?.value ?? '',
      detailTwoLabel: detailTwo?.label ?? '',
      detailTwoValue: detailTwo?.value ?? '',
      detailThreeLabel: detailThree?.label ?? '',
      detailThreeValue: detailThree?.value ?? '',
      ctaLabel: params.ctaLabel ?? '',
      ctaLink: params.ctaLink ?? '',
      footerNote: params.footerNote,
      accentColor: params.accent === 'negative' ? '#dc2626' : '#10a778',
      sentDate: this.formatSentDate(),
    });

    await this.sendMail({
      to: params.to,
      subject: params.subject,
      text: params.text,
      html,
      attachments: [
        {
          filename: 'upnext-logo.png',
          path: this.resolveEmailAssetPath('upnext-logo.png'),
          cid: 'upnext-logo',
        },
      ],
      fallbackLog: `${params.subject} -> ${params.to}`,
    });
  }

  /** A new report has landed in the moderation queue. */
  async sendReportSubmittedToAdmin(params: {
    to: string;
    adminName?: string | null;
    targetLabel: string;
    reporterLabel: string;
    reason: string;
  }) {
    await this.sendModerationNotice({
      to: params.to,
      subject: `[UpNext] Báo cáo vi phạm mới: ${params.targetLabel}`,
      text: `Có báo cáo vi phạm mới về "${params.targetLabel}". Lý do: ${params.reason}`,
      title: 'Báo cáo vi phạm mới',
      subtitle: 'Một báo cáo vừa được gửi và đang chờ xử lý.',
      recipientName: params.adminName?.trim() || params.to,
      message: 'Vui lòng xem xét báo cáo dưới đây trong màn hình kiểm duyệt nội dung.',
      details: [
        { label: 'Đối tượng bị báo cáo', value: params.targetLabel },
        { label: 'Người báo cáo', value: params.reporterLabel },
        { label: 'Lý do', value: params.reason },
      ],
      ctaLabel: 'XEM VÀ XỬ LÝ BÁO CÁO',
      ctaLink: this.resolveFrontendLink('/admin/reports'),
      footerNote: 'Email tự động gửi tới quản trị viên kiểm duyệt nội dung trên UpNext.',
    });
  }

  /** The reporter learns how their report was handled. */
  async sendReportOutcomeToReporter(params: {
    to: string;
    recipientName?: string | null;
    targetLabel: string;
    approved: boolean;
    note?: string | null;
  }) {
    await this.sendModerationNotice({
      to: params.to,
      subject: params.approved
        ? `[UpNext] Báo cáo của bạn đã được xử lý`
        : `[UpNext] Báo cáo của bạn không được chấp nhận`,
      text: params.approved
        ? `Báo cáo của bạn về "${params.targetLabel}" đã được xác nhận và xử lý.`
        : `Báo cáo của bạn về "${params.targetLabel}" không được chấp nhận.`,
      title: params.approved ? 'Báo cáo đã được xử lý' : 'Báo cáo không được chấp nhận',
      subtitle: 'Kết quả kiểm duyệt cho báo cáo bạn đã gửi.',
      recipientName: params.recipientName?.trim() || params.to,
      message: params.approved
        ? 'Cảm ơn bạn đã báo cáo. Quản trị viên đã xác nhận vi phạm và áp dụng biện pháp xử lý.'
        : 'Quản trị viên đã xem xét và chưa thấy đủ căn cứ vi phạm, nên báo cáo này được đóng lại.',
      details: [
        { label: 'Đối tượng bị báo cáo', value: params.targetLabel },
        { label: 'Kết quả', value: params.approved ? 'Đã xử lý' : 'Không chấp nhận' },
        { label: 'Ghi chú', value: params.note?.trim() ?? '' },
      ],
      footerNote: 'Email tự động gửi từ hệ thống kiểm duyệt UpNext.',
      accent: params.approved ? 'positive' : undefined,
    });
  }

  /** The company is told it has been put into Restricted Mode, and how to appeal. */
  async sendCompanyRestrictedToRecruiter(params: {
    to: string;
    recipientName?: string | null;
    companyName: string;
    reason: string;
    appealWindowDays: number;
  }) {
    await this.sendModerationNotice({
      to: params.to,
      subject: `[UpNext] Doanh nghiệp ${params.companyName} đã bị hạn chế`,
      text: `Doanh nghiệp "${params.companyName}" đã bị chuyển sang chế độ hạn chế. Lý do: ${params.reason}`,
      title: 'Doanh nghiệp bị hạn chế',
      subtitle: 'Một báo cáo vi phạm về doanh nghiệp của bạn đã được xác nhận.',
      recipientName: params.recipientName?.trim() || params.to,
      message:
        'Doanh nghiệp của bạn đang ở chế độ hạn chế và điểm uy tín tạm thời bị thu hồi. ' +
        'Nếu bạn cho rằng đây là quyết định chưa chính xác, hãy gửi kháng cáo kèm bằng chứng.',
      details: [
        { label: 'Doanh nghiệp', value: params.companyName },
        { label: 'Lý do', value: params.reason },
        { label: 'Thời hạn kháng cáo', value: `${params.appealWindowDays} ngày` },
      ],
      ctaLabel: 'GỬI KHÁNG CÁO',
      ctaLink: this.resolveFrontendLink('/nha-tuyen-dung/khang-cao'),
      footerNote: 'Email tự động gửi từ hệ thống kiểm duyệt UpNext.',
      accent: 'negative',
    });
  }

  /** The reviewer is told their company review was hidden. */
  async sendReviewHiddenToReviewer(params: {
    to: string;
    recipientName?: string | null;
    companyName: string;
    reason: string;
  }) {
    await this.sendModerationNotice({
      to: params.to,
      subject: `[UpNext] Đánh giá của bạn về ${params.companyName} đã bị ẩn`,
      text: `Đánh giá của bạn về "${params.companyName}" đã bị ẩn. Lý do: ${params.reason}`,
      title: 'Đánh giá đã bị ẩn',
      subtitle: 'Đánh giá của bạn không còn hiển thị công khai.',
      recipientName: params.recipientName?.trim() || params.to,
      message:
        'Sau khi xem xét báo cáo từ doanh nghiệp, quản trị viên đã ẩn đánh giá của bạn. ' +
        'Bạn có thể chỉnh sửa và gửi lại một đánh giá khách quan, đúng trải nghiệm thực tế.',
      details: [
        { label: 'Doanh nghiệp', value: params.companyName },
        { label: 'Lý do báo cáo', value: params.reason },
      ],
      footerNote: 'Email tự động gửi từ hệ thống kiểm duyệt UpNext.',
      accent: 'negative',
    });
  }

  /** A new appeal has landed in the moderation queue. */
  async sendAppealSubmittedToAdmin(params: {
    to: string;
    adminName?: string | null;
    companyName: string;
    content: string;
  }) {
    await this.sendModerationNotice({
      to: params.to,
      subject: `[UpNext] Kháng cáo mới từ ${params.companyName}`,
      text: `Doanh nghiệp "${params.companyName}" vừa gửi kháng cáo: ${params.content}`,
      title: 'Kháng cáo mới',
      subtitle: 'Một doanh nghiệp bị hạn chế vừa gửi kháng cáo.',
      recipientName: params.adminName?.trim() || params.to,
      message: 'Vui lòng xem xét nội dung kháng cáo và bằng chứng kèm theo.',
      details: [
        { label: 'Doanh nghiệp', value: params.companyName },
        { label: 'Nội dung kháng cáo', value: params.content },
      ],
      ctaLabel: 'XEM VÀ XỬ LÝ KHÁNG CÁO',
      ctaLink: this.resolveFrontendLink('/admin/reports'),
      footerNote: 'Email tự động gửi tới quản trị viên kiểm duyệt nội dung trên UpNext.',
    });
  }

  /** The company learns whether its appeal succeeded. */
  async sendAppealOutcomeToRecruiter(params: {
    to: string;
    recipientName?: string | null;
    companyName: string;
    approved: boolean;
  }) {
    await this.sendModerationNotice({
      to: params.to,
      subject: params.approved
        ? `[UpNext] Kháng cáo được chấp nhận - ${params.companyName} đã được mở lại`
        : `[UpNext] Kháng cáo của ${params.companyName} không được chấp nhận`,
      text: params.approved
        ? `Kháng cáo của "${params.companyName}" đã được chấp nhận, doanh nghiệp được mở lại.`
        : `Kháng cáo của "${params.companyName}" không được chấp nhận.`,
      title: params.approved ? 'Kháng cáo được chấp nhận' : 'Kháng cáo không được chấp nhận',
      subtitle: 'Kết quả xử lý kháng cáo của doanh nghiệp bạn.',
      recipientName: params.recipientName?.trim() || params.to,
      message: params.approved
        ? 'Quản trị viên đã chấp nhận kháng cáo. Doanh nghiệp của bạn được đưa trở lại trạng thái hoạt động và điểm uy tín đã được phục hồi.'
        : 'Quản trị viên đã xem xét kháng cáo nhưng chưa đủ căn cứ để mở lại. Doanh nghiệp của bạn tiếp tục ở chế độ hạn chế.',
      details: [
        { label: 'Doanh nghiệp', value: params.companyName },
        { label: 'Kết quả', value: params.approved ? 'Được chấp nhận' : 'Không được chấp nhận' },
      ],
      ctaLabel: 'XEM HỒ SƠ DOANH NGHIỆP',
      ctaLink: this.resolveFrontendLink('/nha-tuyen-dung/ho-so-cong-ty'),
      footerNote: 'Email tự động gửi từ hệ thống kiểm duyệt UpNext.',
      accent: params.approved ? 'positive' : 'negative',
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

    // `{{?key}}…{{/key}}` keeps its block only when `key` has a value, so one shared
    // template can drop the rows a given notification has nothing to put in.
    for (const [key, value] of Object.entries(variables)) {
      const block = new RegExp(`\\{\\{\\?${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, 'g');
      html = html.replace(block, value.trim() ? '$1' : '');
    }

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
