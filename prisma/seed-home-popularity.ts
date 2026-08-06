import { CompanyStatus, JobStatus, ModerationStatus, Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed homepage popularity data.');
}

if (
  process.env.NODE_ENV === 'production' &&
  process.env.ALLOW_DEMO_HOME_POPULARITY_SEED !== 'true'
) {
  throw new Error(
    'Refusing to create demo view data in production. Set ALLOW_DEMO_HOME_POPULARITY_SEED=true only for the staging/demo environment.',
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const SEED_PREFIX = 'seed-home-popularity:v1:';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const VIEW_COUNTS = [148, 116, 89, 67, 49, 34, 22, 15, 10, 7];

function deterministicViewedAt(now: Date, jobIndex: number, viewIndex: number) {
  // Spread every job's activity over the 14-day interest window instead of
  // creating a misleading single spike at seed time.
  const dayOffset = (viewIndex * 7 + jobIndex * 3) % 13;
  const hourOffset = (viewIndex * 5 + jobIndex * 11) % 20;
  const minuteOffset = (viewIndex * 17 + jobIndex * 13) % 60;
  return new Date(
    now.getTime() - dayOffset * DAY_MS - hourOffset * HOUR_MS - minuteOffset * 60_000,
  );
}

async function main() {
  const now = new Date();
  const popularWindowBoundary = new Date(now.getTime() + 14 * DAY_MS);

  const candidates = await prisma.jobPost.findMany({
    where: {
      status: JobStatus.PUBLISHED,
      moderationStatus: ModerationStatus.APPROVED,
      deletedAt: null,
      isHidden: false,
      publishedAt: { not: null },
      company: {
        status: CompanyStatus.ACTIVE,
        logoFileId: { not: null },
        description: { not: null },
      },
      OR: [{ expiredAt: null }, { expiredAt: { gt: popularWindowBoundary } }],
    },
    select: { id: true, title: true, companyId: true },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: VIEW_COUNTS.length * 3,
  });

  // The homepage should demonstrate variety, not ten vacancies from one
  // employer. Keep the highest-ranked eligible job from each company.
  const seenCompanyIds = new Set<string>();
  const jobs = candidates
    .filter((job) => {
      if (seenCompanyIds.has(job.companyId)) return false;
      seenCompanyIds.add(job.companyId);
      return true;
    })
    .slice(0, VIEW_COUNTS.length);

  if (jobs.length < 3) {
    throw new Error(
      `At least 3 eligible public jobs are required; found ${jobs.length}. Seed approved, published jobs before seeding homepage popularity.`,
    );
  }

  // Idempotent: refreshing the demo only replaces this script's own records,
  // never a real candidate's or visitor's viewing history.
  await prisma.jobView.deleteMany({
    where: { visitorKey: { startsWith: SEED_PREFIX } },
  });

  const views: Prisma.JobViewCreateManyInput[] = jobs.flatMap((job, jobIndex) => {
    const count = VIEW_COUNTS[jobIndex] ?? VIEW_COUNTS.at(-1) ?? 1;
    return Array.from({ length: count }, (_, viewIndex) => ({
      jobPostId: job.id,
      visitorKey: `${SEED_PREFIX}${jobIndex + 1}:${viewIndex + 1}`,
      userAgent: 'UpNext Demo Interest Seed/1.0',
      viewedAt: deterministicViewedAt(now, jobIndex, viewIndex),
    }));
  });

  await prisma.jobView.createMany({ data: views });

  console.table(
    jobs.map((job, index) => ({
      rank: index + 1,
      title: job.title,
      seededViews: VIEW_COUNTS[index],
    })),
  );
  console.log(
    `Seeded ${views.length} demo view events for ${jobs.length} eligible jobs. The homepage popular feed now has real queryable data.`,
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
