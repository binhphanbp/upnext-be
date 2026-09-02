import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActorType, InterviewStatus, Prisma } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ZaloBotService } from '../zalo-bot/zalo-bot.service';

const REMINDER_WINDOW_MINUTES = 60;

const dueInterviewInclude = {
  recruiterProfile: { include: { recruiterAccount: true } },
  application: {
    include: {
      jobPost: true,
      candidateProfile: { include: { account: true } },
    },
  },
} satisfies Prisma.InterviewInclude;

type DueInterview = Prisma.InterviewGetPayload<{ include: typeof dueInterviewInclude }>;

@Injectable()
export class InterviewRemindersService {
  private readonly logger = new Logger(InterviewRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly zaloBotService: ZaloBotService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendUpcomingReminders() {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60_000);

    const interviews = await this.prisma.interview.findMany({
      where: {
        status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] },
        scheduledStartAt: { gte: now, lte: windowEnd },
        reminderSentAt: null,
      },
      include: dueInterviewInclude,
    });

    if (interviews.length === 0) return;

    this.logger.log(`Sending reminders for ${interviews.length} upcoming interview(s)`);

    for (const interview of interviews) {
      try {
        await this.sendReminderFor(interview);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to send reminder for interview ${interview.id}: ${message}`);
      }
    }
  }

  private async sendReminderFor(interview: DueInterview) {
    const candidateAccount = interview.application.candidateProfile.account;
    const recruiterAccount = interview.recruiterProfile.recruiterAccount;
    const jobTitle = interview.application.jobPost.title;
    const scheduledTime = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(interview.scheduledStartAt);

    const candidateBody = `Buổi phỏng vấn vị trí ${jobTitle} sẽ bắt đầu lúc ${scheduledTime}.`;
    const recruiterBody = `Buổi phỏng vấn ứng viên cho vị trí ${jobTitle} sẽ bắt đầu lúc ${scheduledTime}.`;
    const zaloLocationLine =
      interview.type === 'ONLINE'
        ? interview.meetingUrl
          ? `Link: ${interview.meetingUrl}`
          : ''
        : interview.location
          ? `Địa điểm: ${interview.location}`
          : '';
    const zaloText = `[UpNext] Nhắc lịch phỏng vấn "${jobTitle}" lúc ${scheduledTime}.${
      zaloLocationLine ? ` ${zaloLocationLine}` : ''
    }`;

    const results = await Promise.allSettled([
      this.notificationsService.createNotification({
        recipientId: candidateAccount.id,
        recipientType: ActorType.CANDIDATE,
        title: 'Nhắc lịch phỏng vấn',
        body: candidateBody,
        targetType: 'INTERVIEW',
        targetId: interview.id,
      }),
      this.notificationsService.createNotification({
        recipientId: recruiterAccount.id,
        recipientType: ActorType.RECRUITER,
        title: 'Nhắc lịch phỏng vấn',
        body: recruiterBody,
        targetType: 'INTERVIEW',
        targetId: interview.id,
      }),
      this.emailService.sendInterviewReminder({
        to: candidateAccount.email,
        recipientName: candidateAccount.fullName,
        jobTitle,
        scheduledStartAt: interview.scheduledStartAt,
        interviewType: interview.type,
        meetingUrl: interview.meetingUrl,
        location: interview.location,
      }),
      this.emailService.sendInterviewReminder({
        to: recruiterAccount.email,
        recipientName: interview.recruiterProfile.fullName,
        jobTitle,
        scheduledStartAt: interview.scheduledStartAt,
        interviewType: interview.type,
        meetingUrl: interview.meetingUrl,
        location: interview.location,
      }),
      candidateAccount.zaloChatId
        ? this.zaloBotService.sendMessage(candidateAccount.zaloChatId, zaloText)
        : Promise.resolve(),
      recruiterAccount.zaloChatId
        ? this.zaloBotService.sendMessage(recruiterAccount.zaloChatId, zaloText)
        : Promise.resolve(),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(`Reminder channel failed for interview ${interview.id}: ${result.reason}`);
      }
    }

    await this.prisma.interview.update({
      where: { id: interview.id },
      data: { reminderSentAt: new Date() },
    });
  }
}
