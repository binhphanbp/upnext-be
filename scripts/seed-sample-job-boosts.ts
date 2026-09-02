import 'dotenv/config';
import {
  PrismaClient,
  JobBoostStatus,
  JobBoostType,
  JobBoostEndedReason,
  SubscriptionUsageDirection,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function truncateToDate(d: Date): Date {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function main() {
  console.log('🚀 Bắt đầu nạp dữ liệu mẫu cho Job Boost theo đúng nghiệp vụ...');

  const now = new Date();
  const proPlan = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { code: 'RECRUITER_PRO' },
  });
  const freePlan = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { code: 'RECRUITER_FREE' },
  });

  // Tìm các công ty tiêu biểu
  const targetCompanies = [
    { search: 'FPT Software', plan: proPlan, activeCount: 1, endedCount: 1 },
    { search: 'Be Group', plan: proPlan, activeCount: 1, endedCount: 0 },
    { search: 'TopCV Vietnam', plan: proPlan, activeCount: 1, endedCount: 1 },
    { search: 'Sendo Technology', plan: freePlan, activeCount: 1, endedCount: 0 },
    { search: 'Becamex IDC', plan: freePlan, activeCount: 0, endedCount: 0 },
    { search: 'Vietravel', plan: proPlan, activeCount: 0, endedCount: 0 },
  ];

  for (const item of targetCompanies) {
    const company = await prisma.company.findFirst({
      where: { name: { contains: item.search, mode: 'insensitive' } },
      include: {
        recruiterAccounts: true,
        jobPosts: {
          where: { status: 'PUBLISHED', moderationStatus: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!company) {
      console.log(`⚠️ Không tìm thấy công ty: ${item.search}`);
      continue;
    }

    const recruiter = company.recruiterAccounts[0];
    if (!recruiter) {
      console.log(`⚠️ Công ty ${company.name} không có tài khoản recruiter`);
      continue;
    }

    console.log(`\n🏢 Cấu hình cho công ty: ${company.name} (${recruiter.email})`);

    // 1. Tạo hoặc cập nhật gói đăng ký ACTIVE
    let activeSub = await prisma.companySubscription.findFirst({
      where: { companyId: company.id, status: 'ACTIVE' },
    });

    const totalBoostsNeeded = item.activeCount + item.endedCount;
    const boostLimit = item.plan.code === 'RECRUITER_PRO' ? 10 : 1;

    if (!activeSub) {
      activeSub = await prisma.companySubscription.create({
        data: {
          planId: item.plan.id,
          companyId: company.id,
          jobPostLimit: item.plan.jobPostLimit ?? 100,
          jobPostUsed: Math.min(company.jobPosts.length, 5),
          boostCreditTotal: boostLimit,
          boostCreditUsed: totalBoostsNeeded,
          startedAt: addDays(now, -10),
          expiredAt: addDays(now, 20),
          status: 'ACTIVE',
        },
      });

      await prisma.invoice.create({
        data: {
          subscriptionPlanId: item.plan.id,
          companyId: company.id,
          invoiceCode: `INV-${company.name
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 8)
            .toUpperCase()}-${Date.now().toString().slice(-4)}`,
          amount: item.plan.price,
          paymentMethod: 'SEPAY',
          paymentStatus: 'PAID',
          paidAt: addDays(now, -10),
        },
      });
      console.log(
        `  ✅ Đã tạo gói đăng ký ${item.plan.code} (Hạn mức: ${boostLimit} Boost, Đã dùng: ${totalBoostsNeeded})`,
      );
    } else {
      await prisma.companySubscription.update({
        where: { id: activeSub.id },
        data: {
          planId: item.plan.id,
          boostCreditTotal: boostLimit,
          boostCreditUsed: totalBoostsNeeded,
          status: 'ACTIVE',
        },
      });
      console.log(
        `  ✅ Đã cập nhật gói đăng ký ${item.plan.code} (Hạn mức: ${boostLimit} Boost, Đã dùng: ${totalBoostsNeeded})`,
      );
    }

    // 2. Dọn dẹp boost cũ của các job được target để tránh duplicate live index
    const jobsToBoost = company.jobPosts.slice(0, totalBoostsNeeded + 2);

    let jobIndex = 0;

    // ACTIVE Boosts
    for (let i = 0; i < item.activeCount && jobIndex < jobsToBoost.length; i++) {
      const job = jobsToBoost[jobIndex++];
      const boostId = randomUUID();
      const idempotencyKey = `job-boost:${company.id}:${boostId}`;

      // Xóa boost live cũ nếu có trên job này
      await prisma.jobBoost.deleteMany({
        where: {
          jobPostId: job.id,
          status: { in: [JobBoostStatus.SCHEDULED, JobBoostStatus.ACTIVE] },
        },
      });

      const boost = await prisma.jobBoost.create({
        data: {
          id: boostId,
          createdByRecruiterId: recruiter.id,
          companySubscriptionId: activeSub.id,
          jobPostId: job.id,
          companyId: company.id,
          type: JobBoostType.FEATURED,
          status: JobBoostStatus.ACTIVE,
          creditCost: 1,
          startsAt: addDays(now, -3),
          endsAt: addDays(now, 4),
          firstImpressionAt: addDays(now, -3),
          lastImpressionAt: addDays(now, 0),
          lastServedAt: addDays(now, 0),
          idempotencyKey,
        },
      });

      // Tạo SubscriptionUsage
      await prisma.subscriptionUsage.upsert({
        where: { idempotencyKey },
        create: {
          companyId: company.id,
          companySubscriptionId: activeSub.id,
          feature: 'featured_job',
          quantity: 1,
          direction: SubscriptionUsageDirection.CONSUME,
          referenceType: 'job_boost',
          referenceId: boost.id,
          idempotencyKey,
          createdByRecruiterId: recruiter.id,
        },
        update: {},
      });

      // Tạo 4 ngày metrics cho active boost
      const metricsData = [];
      for (let day = -3; day <= 0; day++) {
        const metricDate = truncateToDate(addDays(now, day));
        metricsData.push({
          jobBoostId: boost.id,
          jobPostId: job.id,
          impressions: 180 + Math.floor(Math.random() * 80) + (day + 3) * 30,
          clicks: 22 + Math.floor(Math.random() * 12) + (day + 3) * 5,
          applicationsCount: Math.floor(Math.random() * 3) + 1,
          savedCount: Math.floor(Math.random() * 4) + 2,
          date: metricDate,
        });
      }

      await prisma.jobBoostMetric.createMany({
        data: metricsData,
        skipDuplicates: true,
      });

      console.log(`  🌟 [ACTIVE BOOST] Đã boost tin: "${job.title}" (Còn hiệu lực 4 ngày)`);
    }

    // ENDED Boosts
    for (let i = 0; i < item.endedCount && jobIndex < jobsToBoost.length; i++) {
      const job = jobsToBoost[jobIndex++];
      const boostId = randomUUID();
      const idempotencyKey = `job-boost:${company.id}:${boostId}`;

      await prisma.jobBoost.deleteMany({
        where: {
          jobPostId: job.id,
          status: { in: [JobBoostStatus.SCHEDULED, JobBoostStatus.ACTIVE] },
        },
      });

      const boost = await prisma.jobBoost.create({
        data: {
          id: boostId,
          createdByRecruiterId: recruiter.id,
          companySubscriptionId: activeSub.id,
          jobPostId: job.id,
          companyId: company.id,
          type: JobBoostType.FEATURED,
          status: JobBoostStatus.ENDED,
          endedReason: JobBoostEndedReason.EXPIRED,
          creditCost: 1,
          startsAt: addDays(now, -10),
          endsAt: addDays(now, -3),
          firstImpressionAt: addDays(now, -10),
          lastImpressionAt: addDays(now, -3),
          lastServedAt: addDays(now, -3),
          idempotencyKey,
        },
      });

      await prisma.subscriptionUsage.upsert({
        where: { idempotencyKey },
        create: {
          companyId: company.id,
          companySubscriptionId: activeSub.id,
          feature: 'featured_job',
          quantity: 1,
          direction: SubscriptionUsageDirection.CONSUME,
          referenceType: 'job_boost',
          referenceId: boost.id,
          idempotencyKey,
          createdByRecruiterId: recruiter.id,
        },
        update: {},
      });

      // Tạo 7 ngày metrics cho ended boost
      const metricsData = [];
      for (let day = -10; day <= -3; day++) {
        const metricDate = truncateToDate(addDays(now, day));
        metricsData.push({
          jobBoostId: boost.id,
          jobPostId: job.id,
          impressions: 160 + Math.floor(Math.random() * 90),
          clicks: 20 + Math.floor(Math.random() * 15),
          applicationsCount: Math.floor(Math.random() * 2),
          savedCount: Math.floor(Math.random() * 3) + 1,
          date: metricDate,
        });
      }

      await prisma.jobBoostMetric.createMany({
        data: metricsData,
        skipDuplicates: true,
      });

      console.log(`  📜 [ENDED BOOST] Đã tạo lịch sử boost tin: "${job.title}" (Đã kết thúc)`);
    }

    // Các job còn lại để trống để test bấm nút "Đẩy tin"
    const remainingJobs = company.jobPosts.slice(jobIndex);
    if (remainingJobs.length > 0) {
      console.log(
        `  🆕 Có ${remainingJobs.length} tin chưa boost: "${remainingJobs[0].title}" (Sẵn sàng test nút Đẩy tin)`,
      );
    }
  }

  console.log('\n🎉 Nạp dữ liệu mẫu Job Boost hoàn tất thành công 100%!');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed dữ liệu:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
