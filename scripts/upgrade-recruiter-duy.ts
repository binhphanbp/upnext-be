import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SubscriptionFeature } from '../src/modules/subscriptions/feature-registry';
import 'dotenv/config';

const TARGET_EMAIL = 'duycc771@gmail.com';
const PLAN_CODE = 'RECRUITER_DEV_UNLIMITED';
const YEARS = 10;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in .env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const ALL_FEATURES = Object.values(SubscriptionFeature);

async function main() {
  const now = new Date();
  const expiredAt = new Date(now.getTime() + YEARS * 365 * 86_400_000);

  const account = await prisma.recruiterAccount.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, companyId: true, company: { select: { id: true, name: true } } },
  });

  if (!account) {
    throw new Error(`Không tìm thấy recruiter ${TARGET_EMAIL}.`);
  }
  if (!account.companyId || !account.company) {
    throw new Error(`Recruiter ${TARGET_EMAIL} chưa liên kết với công ty nào.`);
  }

  console.log(`Nhà tuyển dụng: ${TARGET_EMAIL}`);
  console.log(`Công ty: ${account.company.name} (${account.companyId})`);

  // 1. Upsert Dev Unlimited Plan
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: PLAN_CODE },
    update: {
      status: SubscriptionStatus.ACTIVE,
      jobPostLimit: 9_999,
      boostCreditLimit: 9_999,
      talentContactLimit: 9_999,
      isPublic: false,
    },
    create: {
      code: PLAN_CODE,
      subscriptionName: 'Recruiter Dev Unlimited (VIP Max)',
      description:
        'Gói nhà tuyển dụng cao cấp mở khóa toàn bộ tính năng và không giới hạn lượt dùng.',
      price: 0,
      durationDays: YEARS * 365,
      jobPostLimit: 9_999,
      boostCreditLimit: 9_999,
      talentContactLimit: 9_999,
      isPublic: false,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  console.log(`Plan: ${plan.subscriptionName} (${plan.code})`);

  // 2. Bật full tất cả các feature (AI, đăng tin, đẩy tin, liên hệ talent, xem CV...)
  for (const feature of ALL_FEATURES) {
    await prisma.planFeature.upsert({
      where: { planId_feature: { planId: plan.id, feature } },
      update: { enabled: true, limitValue: null },
      create: { planId: plan.id, feature, enabled: true, limitValue: null },
    });
  }
  console.log(`PlanFeature: ${ALL_FEATURES.length} tính năng, bật tất cả, không giới hạn.`);

  // 3. Find existing subscription or create new
  const existingSub = await prisma.companySubscription.findFirst({
    where: { companyId: account.companyId, status: SubscriptionStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
  });

  let subscription;
  if (existingSub) {
    subscription = await prisma.companySubscription.update({
      where: { id: existingSub.id },
      data: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startedAt: now,
        expiredAt,
        currentPeriodStart: now,
        currentPeriodEnd: expiredAt,
        jobPostLimit: 9_999,
        jobPostUsed: 0,
        boostCreditTotal: 9_999,
        boostCreditUsed: 0,
        talentContactLimit: 9_999,
        talentContactUsed: 0,
      },
    });
  } else {
    subscription = await prisma.companySubscription.create({
      data: {
        planId: plan.id,
        companyId: account.companyId,
        jobPostLimit: 9_999,
        jobPostUsed: 0,
        boostCreditTotal: 9_999,
        boostCreditUsed: 0,
        talentContactLimit: 9_999,
        talentContactUsed: 0,
        startedAt: now,
        expiredAt,
        currentPeriodStart: now,
        currentPeriodEnd: expiredAt,
        source: 'ADMIN_GRANT',
        status: SubscriptionStatus.ACTIVE,
      },
    });
  }

  console.log(
    `Subscription: ACTIVE (ID: ${subscription.id}), Hạn dùng đến: ${expiredAt.toISOString().slice(0, 10)}`,
  );

  // Clear counters
  const cleared = await prisma.subscriptionQuotaCounter.deleteMany({
    where: { companySubscriptionId: subscription.id },
  });
  if (cleared.count) {
    console.log(`Đã reset ${cleared.count} quota counters về 0.`);
  }

  console.log(
    `\n🎉 THÀNH CÔNG: Tài khoản Recruiter ${TARGET_EMAIL} (Công ty ${account.company.name}) đã được nâng lên gói VIP Max cao nhất (10 năm, full AI & Job quota)!`,
  );
}

main()
  .catch((err) => {
    console.error('Lỗi:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
