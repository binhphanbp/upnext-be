import { PrismaClient, SubscriptionStatus, PlanAudience } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SubscriptionFeature } from '../src/modules/subscriptions/feature-registry';
import 'dotenv/config';

const TARGET_EMAIL = 'pductoandev@gmail.com';
const PLAN_CODE = 'CANDIDATE_DEV_UNLIMITED';
const SUBSCRIPTION_ID = 'b0d70a22-0000-4000-8000-0000000d0002';
const YEARS = 10;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in .env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const now = new Date();
  const expiredAt = new Date(now.getTime() + YEARS * 365 * 86_400_000);

  // 1. Find or verify candidate account
  let account = await prisma.candidateAccount.findUnique({
    where: { email: TARGET_EMAIL },
    include: { profile: true },
  });

  if (!account) {
    console.log(`Chưa có tài khoản candidate cho ${TARGET_EMAIL}, đang tạo tài khoản...`);
    account = await prisma.candidateAccount.create({
      data: {
        email: TARGET_EMAIL,
        fullName: 'Phan Toàn',
        passwordHash: '$2a$10$wT8m9Mv6qN8/e8F0lI0bKuG0sR1LwM8L0e8F0lI0bKuG0sR1LwM8L', // Password123!
        candidateAccountStatus: 'ACTIVE',
        emailVerifiedAt: now,
        profile: {
          create: {
            jobSearchStatus: 'OPEN_TO_WORK',
            profileVisibility: 'PUBLIC',
          },
        },
      },
      include: { profile: true },
    });
  }

  let profile = account.profile;
  if (!profile) {
    console.log(`Đang tạo CandidateProfile cho ${TARGET_EMAIL}...`);
    profile = await prisma.candidateProfile.create({
      data: {
        candidateAccountId: account.id,
        jobSearchStatus: 'OPEN_TO_WORK',
        profileVisibility: 'PUBLIC',
      },
    });
  }

  console.log(`Ứng viên: ${account.fullName} (${account.email}), Profile ID: ${profile.id}`);

  // 2. Create or update Dev Unlimited Plan for Candidate
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: PLAN_CODE },
    update: {
      audience: PlanAudience.CANDIDATE,
      subscriptionName: 'Candidate Dev Unlimited (VIP Max)',
      description: 'Gói ứng viên cao cấp không giới hạn tính năng và lượt dùng AI để kiểm thử luồng.',
      price: 0,
      durationDays: YEARS * 365,
      status: SubscriptionStatus.ACTIVE,
      isPublic: true,
    },
    create: {
      code: PLAN_CODE,
      audience: PlanAudience.CANDIDATE,
      subscriptionName: 'Candidate Dev Unlimited (VIP Max)',
      description: 'Gói ứng viên cao cấp không giới hạn tính năng và lượt dùng AI để kiểm thử luồng.',
      price: 0,
      durationDays: YEARS * 365,
      status: SubscriptionStatus.ACTIVE,
      isPublic: true,
      sortOrder: 1,
    },
  });

  console.log(`Plan: ${plan.subscriptionName} (${plan.code})`);

  // 3. Upsert features for this plan (AI_COPILOT_RUN unlimited)
  const candidateFeatures = [
    SubscriptionFeature.AI_COPILOT_RUN,
  ];

  for (const feature of candidateFeatures) {
    await prisma.planFeature.upsert({
      where: { planId_feature: { planId: plan.id, feature } },
      update: { enabled: true, limitValue: null }, // null = unlimited
      create: { planId: plan.id, feature, enabled: true, limitValue: null },
    });
  }

  // Also ensure CANDIDATE_PRO has 9999 if standard plan code is checked anywhere
  const proPlan = await prisma.subscriptionPlan.findUnique({
    where: { code: 'CANDIDATE_PRO' },
  });
  if (proPlan) {
    await prisma.planFeature.upsert({
      where: { planId_feature: { planId: proPlan.id, feature: SubscriptionFeature.AI_COPILOT_RUN } },
      update: { enabled: true, limitValue: 9999 },
      create: { planId: proPlan.id, feature: SubscriptionFeature.AI_COPILOT_RUN, enabled: true, limitValue: 9999 },
    });
  }

  // 4. Create/Upsert CandidateSubscription
  const subscription = await prisma.candidateSubscription.upsert({
    where: { id: SUBSCRIPTION_ID },
    update: {
      planId: plan.id,
      candidateProfileId: profile.id,
      status: SubscriptionStatus.ACTIVE,
      startedAt: now,
      expiredAt,
      currentPeriodStart: now,
      currentPeriodEnd: expiredAt,
      source: 'ADMIN_GRANT',
    },
    create: {
      id: SUBSCRIPTION_ID,
      planId: plan.id,
      candidateProfileId: profile.id,
      startedAt: now,
      expiredAt,
      currentPeriodStart: now,
      currentPeriodEnd: expiredAt,
      source: 'ADMIN_GRANT',
      status: SubscriptionStatus.ACTIVE,
    },
  });

  console.log(`Candidate Subscription: ACTIVE, Hạn dùng đến: ${expiredAt.toISOString().slice(0, 10)}`);

  // Clear quota counters for fresh start
  const cleared = await prisma.candidateSubscriptionQuotaCounter.deleteMany({
    where: { candidateSubscriptionId: subscription.id },
  });
  if (cleared.count) {
    console.log(`Đã reset ${cleared.count} quota counters về 0.`);
  }

  console.log(`\n🎉 THÀNH CÔNG: Tài khoản ứng viên ${account.email} đã được nâng lên gói VIP cao nhất (${plan.subscriptionName})!`);
}

main()
  .catch((err) => {
    console.error('Lỗi khi nâng gói:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
