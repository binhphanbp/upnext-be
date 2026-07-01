import { Injectable } from '@nestjs/common';
import {
  CompanyVerificationStatus,
  JobStatus,
  ModerationStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardQueryDto, DashboardChartPeriod } from './dto/admin-dashboard-query.dto';

type RevenueBucket = {
  label: string;
  start: Date;
  end: Date;
};

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(query: AdminDashboardQueryDto) {
    const now = new Date();
    const currentWeekStart = this.startOfWeek(now);
    const nextWeekStart = this.addDays(currentWeekStart, 7);
    const previousWeekStart = this.addDays(currentWeekStart, -7);
    const activityLimit = query.activityLimit ?? 10;

    const [
      totalRevenue,
      currentWeekRevenue,
      previousWeekRevenue,
      currentWeekCandidates,
      currentWeekRecruiters,
      previousWeekCandidates,
      previousWeekRecruiters,
      activeJobPosts,
      currentWeekActiveJobPosts,
      previousWeekActiveJobPosts,
      pendingCompanyRegistrations,
      pendingJobPosts,
      revenueChart,
      latestActivities,
    ] = await Promise.all([
      this.sumPaidRevenue(),
      this.sumPaidRevenue(currentWeekStart, nextWeekStart),
      this.sumPaidRevenue(previousWeekStart, currentWeekStart),
      this.prisma.candidateAccount.count({
        where: { createdAt: { gte: currentWeekStart, lt: nextWeekStart } },
      }),
      this.prisma.recruiterAccount.count({
        where: { createdAt: { gte: currentWeekStart, lt: nextWeekStart } },
      }),
      this.prisma.candidateAccount.count({
        where: { createdAt: { gte: previousWeekStart, lt: currentWeekStart } },
      }),
      this.prisma.recruiterAccount.count({
        where: { createdAt: { gte: previousWeekStart, lt: currentWeekStart } },
      }),
      this.countActiveJobPosts(),
      this.countActiveJobPosts(currentWeekStart, nextWeekStart),
      this.countActiveJobPosts(previousWeekStart, currentWeekStart),
      this.prisma.company.count({
        where: { verificationStatus: CompanyVerificationStatus.PENDING },
      }),
      this.prisma.jobPost.count({
        where: {
          moderationStatus: ModerationStatus.PENDING,
          deletedAt: null,
        },
      }),
      this.getRevenueChart(query, now),
      this.getLatestActivities(activityLimit),
    ]);

    const currentWeekUsers = currentWeekCandidates + currentWeekRecruiters;
    const previousWeekUsers = previousWeekCandidates + previousWeekRecruiters;

    return {
      summary: {
        revenue: {
          total: totalRevenue,
          currentWeek: currentWeekRevenue,
          previousWeek: previousWeekRevenue,
          growthPercent: this.percentGrowth(currentWeekRevenue, previousWeekRevenue),
        },
        newUsers: {
          currentWeek: {
            candidate: currentWeekCandidates,
            recruiter: currentWeekRecruiters,
            total: currentWeekUsers,
          },
          previousWeek: {
            candidate: previousWeekCandidates,
            recruiter: previousWeekRecruiters,
            total: previousWeekUsers,
          },
          growthPercent: this.percentGrowth(currentWeekUsers, previousWeekUsers),
        },
        activeJobPosts: {
          total: activeJobPosts,
          currentWeek: currentWeekActiveJobPosts,
          previousWeek: previousWeekActiveJobPosts,
          growthPercent: this.percentGrowth(currentWeekActiveJobPosts, previousWeekActiveJobPosts),
        },
        pendingReview: {
          total: pendingCompanyRegistrations + pendingJobPosts,
          companyRegistrations: pendingCompanyRegistrations,
          jobPosts: pendingJobPosts,
        },
      },
      revenueChart,
      latestActivities,
    };
  }

  private async sumPaidRevenue(start?: Date, end?: Date) {
    const aggregate = await this.prisma.invoice.aggregate({
      where: {
        paymentStatus: PaymentStatus.PAID,
        ...(start || end
          ? {
              paidAt: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lt: end } : {}),
              },
            }
          : {}),
      },
      _sum: { amount: true },
    });

    return Number(aggregate._sum.amount ?? 0);
  }

  private countActiveJobPosts(start?: Date, end?: Date) {
    const now = new Date();

    return this.prisma.jobPost.count({
      where: {
        status: JobStatus.PUBLISHED,
        deletedAt: null,
        OR: [{ expiredAt: null }, { expiredAt: { gt: now } }],
        ...(start || end
          ? {
              createdAt: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lt: end } : {}),
              },
            }
          : {}),
      },
    });
  }

  private async getRevenueChart(query: AdminDashboardQueryDto, now: Date) {
    const period = query.chartPeriod ?? 'year';
    const buckets = this.buildRevenueBuckets(period, query, now);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        paymentStatus: PaymentStatus.PAID,
        paidAt: {
          gte: buckets[0].start,
          lt: buckets[buckets.length - 1].end,
        },
      },
      select: {
        amount: true,
        paidAt: true,
        subscriptionPlan: {
          select: {
            id: true,
            subscriptionName: true,
          },
        },
      },
    });

    return {
      period,
      from: buckets[0].start,
      to: buckets[buckets.length - 1].end,
      points: buckets.map((bucket) => {
        const bucketInvoices = invoices.filter((invoice) => {
          if (!invoice.paidAt) return false;
          return invoice.paidAt >= bucket.start && invoice.paidAt < bucket.end;
        });
        const revenue = bucketInvoices.reduce(
          (total, invoice) => total + Number(invoice.amount),
          0,
        );

        return {
          label: bucket.label,
          from: bucket.start,
          to: bucket.end,
          revenue,
          invoices: bucketInvoices.length,
          plans: this.groupRevenueByPlan(bucketInvoices),
        };
      }),
    };
  }

  private groupRevenueByPlan(
    invoices: Array<{
      amount: unknown;
      subscriptionPlan: { id: string; subscriptionName: string };
    }>,
  ) {
    const byPlan = new Map<
      string,
      { planId: string; planName: string; revenue: number; sold: number }
    >();

    for (const invoice of invoices) {
      const key = invoice.subscriptionPlan.id;
      const current = byPlan.get(key) ?? {
        planId: invoice.subscriptionPlan.id,
        planName: invoice.subscriptionPlan.subscriptionName,
        revenue: 0,
        sold: 0,
      };

      current.revenue += Number(invoice.amount);
      current.sold += 1;
      byPlan.set(key, current);
    }

    return [...byPlan.values()];
  }

  private async getLatestActivities(limit: number) {
    const [companies, jobPosts] = await Promise.all([
      this.prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          verificationStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.jobPost.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          moderationStatus: true,
          createdAt: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    return [
      ...companies.map((company) => ({
        id: company.id,
        type: 'company_registration' as const,
        title: company.name,
        subtitle: 'Đăng ký công ty',
        status: company.verificationStatus,
        createdAt: company.createdAt,
      })),
      ...jobPosts.map((jobPost) => ({
        id: jobPost.id,
        type: 'job_post' as const,
        title: jobPost.title,
        subtitle: 'Tin tuyển dụng',
        status: jobPost.moderationStatus,
        jobStatus: jobPost.status,
        company: jobPost.company,
        createdAt: jobPost.createdAt,
      })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  private buildRevenueBuckets(
    period: DashboardChartPeriod,
    query: AdminDashboardQueryDto,
    now: Date,
  ): RevenueBucket[] {
    if (period === 'week') {
      const weekStart = query.weekStart
        ? this.startOfDay(new Date(query.weekStart))
        : this.startOfWeek(now);

      return Array.from({ length: 7 }, (_, index) => {
        const start = this.addDays(weekStart, index);
        const end = this.addDays(start, 1);
        return {
          label: index === 6 ? 'CN' : `T${index + 2}`,
          start,
          end,
        };
      });
    }

    if (period === 'month') {
      const year = query.year ?? now.getFullYear();
      const month = query.month ?? now.getMonth() + 1;
      const monthStart = new Date(year, month - 1, 1);
      const nextMonthStart = this.addMonths(monthStart, 1);
      const days = Math.round(
        (nextMonthStart.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000),
      );

      return Array.from({ length: days }, (_, index) => {
        const start = this.addDays(monthStart, index);
        const end = this.addDays(start, 1);
        return {
          label: `${index + 1}`,
          start,
          end,
        };
      });
    }

    const year = query.year ?? now.getFullYear();
    return Array.from({ length: 12 }, (_, index) => {
      const start = new Date(year, index, 1);
      const end = this.addMonths(start, 1);
      return {
        label: `Thg ${index + 1}`,
        start,
        end,
      };
    });
  }

  private percentGrowth(current: number, previous: number) {
    if (previous === 0) {
      return current === 0 ? 0 : 100;
    }

    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private addMonths(date: Date, months: number) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  private startOfWeek(date: Date) {
    const start = this.startOfDay(date);
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return this.addDays(start, mondayOffset);
  }
}
