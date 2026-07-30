import { AccountStatus, JobStatus, ModerationStatus, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed sample job post statuses.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_IN_MILLISECONDS);
}

async function findTargetRecruiter() {
  const recruiterEmail = process.env.SEED_RECRUITER_EMAIL?.trim();
  const companyName = process.env.SEED_COMPANY_NAME?.trim() || 'Toàn Dev Company';

  if (recruiterEmail) {
    return prisma.recruiterAccount.findFirst({
      where: {
        email: recruiterEmail,
        status: AccountStatus.ACTIVE,
        company: {
          is: {
            name: {
              equals: companyName,
              mode: 'insensitive',
            },
          },
        },
      },
      include: { company: true, profile: true },
    });
  }

  const preferredRecruiter = await prisma.recruiterAccount.findFirst({
    where: {
      status: AccountStatus.ACTIVE,
      company: {
        is: {
          name: {
            equals: companyName,
            mode: 'insensitive',
          },
        },
      },
      profile: {
        is: {
          fullName: {
            contains: 'Phan Đức Toàn',
            mode: 'insensitive',
          },
        },
      },
    },
    include: { company: true, profile: true },
    orderBy: { updatedAt: 'desc' },
  });

  if (preferredRecruiter) {
    return preferredRecruiter;
  }

  return prisma.recruiterAccount.findFirst({
    where: {
      status: AccountStatus.ACTIVE,
      company: {
        is: {
          name: {
            equals: companyName,
            mode: 'insensitive',
          },
        },
      },
    },
    include: { company: true, profile: true },
    orderBy: { updatedAt: 'desc' },
  });
}

async function main() {
  const recruiter = await findTargetRecruiter();

  if (!recruiter?.companyId || !recruiter.company) {
    throw new Error(
      'No active recruiter was found for the target company. Set SEED_COMPANY_NAME or SEED_RECRUITER_EMAIL and try again.',
    );
  }

  const [jobCategory, experienceLevel, employmentType, companyLocation] = await Promise.all([
    prisma.jobCategory.findFirst({ orderBy: { name: 'asc' } }),
    prisma.experienceLevel.findFirst({ orderBy: { name: 'asc' } }),
    prisma.employmentType.findFirst({ orderBy: { name: 'asc' } }),
    prisma.companyLocation.findFirst({
      where: { companyId: recruiter.companyId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const now = new Date();
  const commonData = {
    createdByRecruiterId: recruiter.id,
    companyId: recruiter.companyId,
    jobCategoryId: jobCategory?.id ?? null,
    experienceLevelId: experienceLevel?.id ?? null,
    employmentTypeId: employmentType?.id ?? null,
    description:
      '<p>Dữ liệu mẫu dùng để kiểm tra giao diện quản lý tin tuyển dụng theo từng trạng thái.</p>',
    requirements: '<ul><li>Có kiến thức nền tảng về phát triển phần mềm.</li></ul>',
    benefits: '<ul><li>Môi trường làm việc chuyên nghiệp và linh hoạt.</li></ul>',
    salaryIsNegotiable: true,
    salaryIsVisible: true,
    isHidden: false,
    deletedAt: null,
  };
  const samples = [
    {
      slug: 'upnext-demo-job-active',
      title: '[Demo] Backend Developer - Đang đăng',
      status: JobStatus.PUBLISHED,
      moderationStatus: ModerationStatus.APPROVED,
      publishedAt: addDays(now, -2),
      expiredAt: addDays(now, 30),
      vacanciesCount: 5,
    },
    {
      slug: 'upnext-demo-job-expiring',
      title: '[Demo] Frontend Developer - Sắp hết hạn',
      status: JobStatus.PUBLISHED,
      moderationStatus: ModerationStatus.APPROVED,
      publishedAt: addDays(now, -10),
      expiredAt: addDays(now, 3),
      vacanciesCount: 2,
    },
    {
      slug: 'upnext-demo-job-pending',
      title: '[Demo] DevOps Engineer - Chờ duyệt',
      status: JobStatus.PUBLISHED,
      moderationStatus: ModerationStatus.PENDING,
      publishedAt: now,
      expiredAt: addDays(now, 25),
      vacanciesCount: 3,
    },
    {
      slug: 'upnext-demo-job-draft',
      title: '[Demo] QA Automation Engineer - Bản nháp',
      status: JobStatus.DRAFT,
      moderationStatus: ModerationStatus.PENDING,
      publishedAt: null,
      expiredAt: addDays(now, 20),
      vacanciesCount: 4,
    },
    {
      slug: 'upnext-demo-job-closed',
      title: '[Demo] Fullstack Developer - Đã đóng',
      status: JobStatus.CLOSED,
      moderationStatus: ModerationStatus.APPROVED,
      publishedAt: addDays(now, -30),
      expiredAt: addDays(now, -1),
      vacanciesCount: 1,
    },
  ];

  for (const sample of samples) {
    const jobPost = await prisma.jobPost.upsert({
      where: { slug: sample.slug },
      update: { ...commonData, ...sample },
      create: { ...commonData, ...sample },
    });

    await prisma.jobPostLocation.deleteMany({
      where: { jobPostId: jobPost.id },
    });

    if (companyLocation) {
      await prisma.jobPostLocation.create({
        data: {
          jobPostId: jobPost.id,
          jobLocationId: companyLocation.id,
        },
      });
    }
  }

  console.log(
    `Seeded ${samples.length} job status samples for ${recruiter.company.name} (${recruiter.profile?.fullName ?? recruiter.email}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
