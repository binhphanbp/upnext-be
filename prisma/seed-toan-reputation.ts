/* eslint-disable no-console */
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const TARGET_EMAIL = 'pductoandev@gmail.com';
const COMPANY_ID = '91963a43-0681-4004-9c2d-7ded162cdeb5';
const TARGET_SCORE = new Prisma.Decimal(72);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const uid = (n: number) =>
  `b7e90a11-0000-4000-8000-${String(n).padStart(12, '0')}`;

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(9 + (days % 8), (days * 7) % 60, 0, 0);
  return date;
};

const activities = [
  ['PROFILE_COMPLETED', 15, 'Hoàn thiện đầy đủ hồ sơ doanh nghiệp', 45],
  ['BUSINESS_LICENSE_VERIFIED', 20, 'Giấy phép kinh doanh đã được xác thực', 40],
  ['EMAIL_VERIFIED', 5, 'Xác thực email doanh nghiệp thành công', 34],
  ['JOB_POST_APPROVED', 3, 'Tin tuyển dụng đáp ứng tiêu chuẩn nội dung', 29],
  ['CV_PROCESSED_ON_TIME', 4, 'Xử lý hồ sơ ứng viên đúng thời hạn', 25],
  ['HIRING_RESULT_REPORTED', 5, 'Cập nhật kết quả tuyển dụng đầy đủ', 21],
  ['POSITIVE_REVIEW_RECEIVED', 6, 'Nhận phản hồi tích cực từ ứng viên', 18],
  ['CV_PROCESSED_ON_TIME', 4, 'Duy trì tốc độ phản hồi ứng viên tốt', 15],
  ['NEGLECTED_CV_PENALTY', -5, 'Có hồ sơ ứng viên chưa được xử lý đúng hạn', 13],
  ['JOB_POST_APPROVED', 3, 'Tin tuyển dụng được duyệt', 11],
  ['HIRING_RESULT_REPORTED', 5, 'Báo cáo kết quả tuyển dụng đúng hạn', 9],
  ['POSITIVE_REVIEW_RECEIVED', 4, 'Ứng viên đánh giá tích cực về quy trình', 7],
  ['EXPIRY_UNRESOLVED_PENALTY', -4, 'Tin hết hạn còn hồ sơ chưa xử lý', 6],
  ['CV_PROCESSED_ON_TIME', 3, 'Hoàn tất xử lý hồ sơ trong ngày', 5],
  ['JOB_POST_APPROVED', 2, 'Nội dung tuyển dụng minh bạch', 4],
  ['HIRING_RESULT_REPORTED', 3, 'Đã bổ sung kết quả tuyển dụng', 3],
  ['POSITIVE_REVIEW_RECEIVED', 2, 'Nhận phản hồi tốt từ ứng viên', 2],
  ['CV_PROCESSED_ON_TIME', 2, 'Phản hồi hồ sơ ứng viên đúng hạn', 1],
] as const;

async function main() {
  const account = await prisma.recruiterAccount.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true },
  });
  if (!account) throw new Error(`Recruiter account not found: ${TARGET_EMAIL}`);

  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Company not found: ${COMPANY_ID}`);

  await prisma.$transaction(async (tx) => {
    await tx.recruiterAccount.update({
      where: { id: account.id },
      data: { companyId: company.id },
    });

    await tx.company.update({
      where: { id: company.id },
      data: { reputationScore: TARGET_SCORE },
    });

    await tx.companyReputationActivity.createMany({
      data: activities.map(([actionType, score, reason, age], index) => ({
        id: uid(index + 1),
        companyId: company.id,
        actionType,
        score: new Prisma.Decimal(score),
        reason,
        createdAt: daysAgo(age),
      })),
      skipDuplicates: true,
    });
  });

  const totalActivities = await prisma.companyReputationActivity.count({
    where: { companyId: company.id },
  });
  console.log(
    JSON.stringify({
      email: TARGET_EMAIL,
      company: company.name,
      companyId: company.id,
      reputationScore: TARGET_SCORE.toString(),
      totalActivities,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
