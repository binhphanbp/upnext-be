import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActorType, JobStatus, ModerationStatus } from '@prisma/client';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * A posting older than this is never announced, even if it somehow reaches the sweep
 * unmarked. Following a company should not resurface something the candidate has already
 * had a week to find.
 */
const MAX_ANNOUNCE_AGE_DAYS = 7;

/** Bounds one sweep so a bulk import cannot turn into an unbounded mail run. */
const MAX_POSTINGS_PER_SWEEP = 200;

/** Beyond this the digest lists a remainder line rather than every title. */
const MAX_TITLES_PER_EMAIL = 10;

@Injectable()
export class CompanyFollowAlertsService {
  private readonly logger = new Logger(CompanyFollowAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Announces newly published postings to the people following that company.
   *
   * Runs on a timer rather than inline with publishing so that a company publishing a
   * batch of roles produces one digest per follower instead of one email per role. The
   * interval is the grouping window.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async announceNewPostingsToFollowers() {
    const cutoff = new Date(Date.now() - MAX_ANNOUNCE_AGE_DAYS * 24 * 60 * 60 * 1000);

    const postings = await this.prisma.jobPost.findMany({
      where: {
        followerAlertSentAt: null,
        status: JobStatus.PUBLISHED,
        moderationStatus: ModerationStatus.APPROVED,
        isHidden: false,
        publishedAt: { gte: cutoff },
      },
      select: {
        id: true,
        title: true,
        companyId: true,
        company: { select: { name: true, slug: true } },
      },
      orderBy: { publishedAt: 'asc' },
      take: MAX_POSTINGS_PER_SWEEP,
    });

    if (postings.length === 0) return;

    const byCompany = new Map<string, typeof postings>();
    for (const posting of postings) {
      const current = byCompany.get(posting.companyId);
      if (current) current.push(posting);
      else byCompany.set(posting.companyId, [posting]);
    }

    this.logger.log(
      `Announcing ${postings.length} posting(s) across ${byCompany.size} company/companies`,
    );

    for (const [companyId, companyPostings] of byCompany) {
      try {
        await this.announceForCompany(companyId, companyPostings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // The mark is only written on success, so a company that fails here is retried on
        // the next sweep rather than silently skipped.
        this.logger.error(`Failed to announce postings for company ${companyId}: ${message}`);
      }
    }
  }

  private async announceForCompany(
    companyId: string,
    postings: Array<{ id: string; title: string; company: { name: string; slug: string } }>,
  ) {
    const followers = await this.prisma.companyFollow.findMany({
      where: { companyId },
      select: {
        candidateProfile: {
          select: { account: { select: { id: true, email: true, fullName: true } } },
        },
      },
    });

    const [first] = postings;
    if (!first) return;

    const companyName = first.company.name;
    const companySlug = first.company.slug;
    const titles = postings.map((posting) => posting.title);

    if (followers.length > 0) {
      const notificationBody =
        titles.length === 1
          ? `${companyName} vừa đăng tin tuyển dụng "${titles[0]}".`
          : `${companyName} vừa đăng ${titles.length} tin tuyển dụng mới.`;

      const emailTitles =
        titles.length > MAX_TITLES_PER_EMAIL
          ? [
              ...titles.slice(0, MAX_TITLES_PER_EMAIL),
              `và ${titles.length - MAX_TITLES_PER_EMAIL} vị trí khác`,
            ]
          : titles;

      const results = await Promise.allSettled(
        followers.flatMap((follower) => {
          const account = follower.candidateProfile.account;
          return [
            this.notificationsService.createNotification({
              recipientId: account.id,
              recipientType: ActorType.CANDIDATE,
              title: 'Công ty bạn theo dõi có tin mới',
              body: notificationBody,
              targetType: 'COMPANY',
              targetId: companyId,
            }),
            this.emailService.sendFollowedCompanyJobs({
              to: account.email,
              recipientName: account.fullName,
              companyName,
              jobTitles: emailTitles,
              companyPath: `/companies/${companySlug}`,
            }),
          ];
        }),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          this.logger.warn(`Follower alert channel failed for ${companyId}: ${result.reason}`);
        }
      }
    }

    // Marked even when nobody follows the company: the postings have had their chance and
    // must not be held back to surprise a future follower with old news.
    await this.prisma.jobPost.updateMany({
      where: { id: { in: postings.map((posting) => posting.id) } },
      data: { followerAlertSentAt: new Date() },
    });
  }
}
