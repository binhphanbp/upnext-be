/* eslint-disable */
/**
 * Standalone seed: give pductoandev@gmail.com's company a full-access recruiter
 * plan on the LOCAL dev database.
 *
 * ## Vì sao cần script này
 *
 * `prisma/seed-toan.ts` tạo tài khoản + công ty + gói nhưng **không tạo dòng
 * `PlanFeature` nào**, và một công ty không có `CompanySubscription` nào đang
 * hoạt động cũng rơi vào cùng ngõ cụt. Cả hai đường đều dẫn tới
 * `ForbiddenException` **403**:
 *
 * - không có subscription  → `NO_ACTIVE_SUBSCRIPTION`
 * - có gói nhưng thiếu `PlanFeature` cho tính năng → `FEATURE_NOT_IN_PLAN`
 *
 * `SubscriptionQuotaService.consume()` tra `PlanFeature` theo `(planId, feature)`
 * và ném 403 khi không thấy, nên mọi tính năng AI đều tắt một cách âm thầm --
 * biểu hiện ở UI là recruiter bị **đăng xuất** giữa lúc upload JD (frontend từng
 * coi 403 là hết phiên đăng nhập).
 *
 * ## Gói này cố ý là gói riêng cho dev
 *
 * Không sửa `RECRUITER_PREMIUM` trong catalogue: những công ty khác cũng dùng
 * plan đó, và nâng nó thành vô hạn sẽ làm sai dữ liệu của họ. Gói ở đây có `code`
 * riêng và `isPublic: false` nên **không hiện trên trang giá công khai**.
 *
 * Idempotent: chạy lại thì upsert đúng bản ghi cũ (khoá theo `code` và một UUID
 * tiền định).
 *
 * Run with:  pnpm tsx prisma/seed-toan-plan.ts
 */
import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
// `SubscriptionFeature` không còn là enum Prisma: cột `feature` giờ là VARCHAR(60)
// và registry là source of truth (xem docblock của feature-registry.ts).
import { SubscriptionFeature } from '../src/modules/subscriptions/feature-registry';
import 'dotenv/config';

const TARGET_EMAIL = 'pductoandev@gmail.com';
const PLAN_CODE = 'RECRUITER_DEV_UNLIMITED';
/** UUID tiền định để chạy lại không sinh thêm subscription mới (chỉ ký tự hex). */
const SUBSCRIPTION_ID = 'a0d70a11-0000-4000-8000-0000000d0001';
const YEARS = 10;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in the environment (.env).');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

/**
 * `limitValue: null` nghĩa là vô hạn (xem chú thích trên `PlanFeature.limitValue`).
 * Lượt dùng vẫn được đếm -- `consume()` tăng counter cho cả gói vô hạn để báo cáo
 * usage và phân tích chi phí AI vẫn chạy -- chỉ là không bao giờ chặn.
 *
 * Lấy trực tiếp từ enum thay vì liệt kê tay, để một `SubscriptionFeature` mới
 * thêm vào schema sẽ tự động có mặt ở đây thay vì âm thầm bị tắt.
 */
const ALL_FEATURES = Object.values(SubscriptionFeature);

async function main() {
  const now = new Date();
  const expiredAt = new Date(now.getTime() + YEARS * 365 * 86_400_000);

  const account = await prisma.recruiterAccount.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, companyId: true, company: { select: { id: true, name: true } } },
  });

  if (!account) {
    throw new Error(
      `Không tìm thấy recruiter ${TARGET_EMAIL}. Chạy \`pnpm tsx prisma/seed-toan.ts\` trước.`,
    );
  }
  if (!account.companyId || !account.company) {
    throw new Error(`Recruiter ${TARGET_EMAIL} chưa được liên kết với công ty nào.`);
  }

  console.log(`Công ty: ${account.company.name} (${account.companyId})`);

  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: PLAN_CODE },
    update: {
      status: SubscriptionStatus.ACTIVE,
      jobPostLimit: 0,
      boostCreditLimit: 9_999,
      talentContactLimit: 9_999,
      isPublic: false,
    },
    create: {
      code: PLAN_CODE,
      subscriptionName: 'Dev Unlimited (local only)',
      description:
        'Gói chỉ dùng cho môi trường dev: mọi tính năng bật và không giới hạn. Không hiển thị trên trang giá.',
      price: 0,
      durationDays: YEARS * 365,
      jobPostLimit: 0,
      boostCreditLimit: 9_999,
      talentContactLimit: 9_999,
      // Gói dev không được lọt ra trang giá công khai.
      isPublic: false,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  console.log(`Plan: ${plan.subscriptionName} (${plan.code})`);

  for (const feature of ALL_FEATURES) {
    await prisma.planFeature.upsert({
      where: { planId_feature: { planId: plan.id, feature } },
      update: { enabled: true, limitValue: null },
      create: { planId: plan.id, feature, enabled: true, limitValue: null },
    });
  }
  console.log(`PlanFeature: ${ALL_FEATURES.length} tính năng, bật hết, không giới hạn`);

  // Respect company_subscriptions_one_active_per_company_uq by deactivating any existing active subscription
  await prisma.companySubscription.updateMany({
    where: {
      companyId: account.companyId,
      status: SubscriptionStatus.ACTIVE,
      id: { not: SUBSCRIPTION_ID },
    },
    data: {
      status: SubscriptionStatus.INACTIVE,
    },
  });

  const subscription = await prisma.companySubscription.upsert({
    where: { id: SUBSCRIPTION_ID },
    update: {
      planId: plan.id,
      companyId: account.companyId,
      status: SubscriptionStatus.ACTIVE,
      startedAt: now,
      expiredAt,
      currentPeriodStart: now,
      currentPeriodEnd: expiredAt,
      jobPostLimit: 0,
      boostCreditTotal: 9_999,
      talentContactLimit: 9_999,
    },
    create: {
      id: SUBSCRIPTION_ID,
      planId: plan.id,
      companyId: account.companyId,
      jobPostLimit: 0,
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

  console.log(`Subscription: ACTIVE, hết hạn ${expiredAt.toISOString().slice(0, 10)}`);

  // Counter cũ của các gói trước có thể đang ở trạng thái đã cạn. Chúng thuộc
  // subscription khác nên không ảnh hưởng gói này, nhưng dọn counter CỦA CHÍNH gói
  // này để một lần chạy lại trả lượt về 0.
  const cleared = await prisma.subscriptionQuotaCounter.deleteMany({
    where: { companySubscriptionId: subscription.id },
  });
  if (cleared.count) {
    console.log(`Đã xoá ${cleared.count} counter cũ của gói này (lượt dùng về 0)`);
  }

  // ── Xác minh lại bằng đúng câu truy vấn mà runtime dùng ────────────────────
  const active = await prisma.companySubscription.findFirst({
    where: {
      companyId: account.companyId,
      status: SubscriptionStatus.ACTIVE,
      expiredAt: { gt: new Date() },
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true, planId: true, plan: { select: { subscriptionName: true } } },
  });

  if (active?.id !== subscription.id) {
    throw new Error(
      `Gói vừa seed KHÔNG phải gói đang hoạt động. Runtime sẽ dùng ${active?.plan.subscriptionName ?? '(không có)'}.`,
    );
  }

  const jdFeature = await prisma.planFeature.findUnique({
    where: {
      planId_feature: { planId: active.planId, feature: SubscriptionFeature.AI_JD_GENERATE },
    },
  });

  if (!jdFeature?.enabled || (jdFeature.limitValue !== null && jdFeature.limitValue <= 0)) {
    throw new Error('AI_JD_GENERATE vẫn chưa dùng được — đây đúng là ca gây 403 trước đó.');
  }

  console.log(
    `\nOK: gói đang hoạt động là "${active.plan.subscriptionName}", AI_JD_GENERATE bật, giới hạn ${jdFeature.limitValue ?? 'vô hạn'}.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
