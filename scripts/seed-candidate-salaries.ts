import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  console.log('=== SEEDING EXPECTED SALARIES FOR CANDIDATES ===');

  const profiles = await prisma.candidateProfile.findMany({
    select: {
      id: true,
      account: { select: { fullName: true } },
      experiences: {
        select: { positionTitle: true },
        take: 1,
      },
      jobPreference: { select: { id: true } },
    },
  });

  console.log(`Found ${profiles.length} candidate profiles.`);

  let updatedCount = 0;
  let negotiableCount = 0;

  // Preset salary ranges for realistic tech job market in Vietnam
  const salaryPresets = [
    { min: 10_000_000, max: 15_000_000 },
    { min: 12_000_000, max: 18_000_000 },
    { min: 15_000_000, max: 22_000_000 },
    { min: 18_000_000, max: 25_000_000 },
    { min: 20_000_000, max: 30_000_000 },
    { min: 22_000_000, max: 35_000_000 },
    { min: 25_000_000, max: 40_000_000 },
    { min: 30_000_000, max: 45_000_000 },
    { min: 35_000_000, max: 55_000_000 },
  ];

  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const title = (profile.experiences[0]?.positionTitle || '').toLowerCase();

    // Leave ~25% as "Thoả thuận" (negotiable) for natural diversity
    if (i % 4 === 0) {
      negotiableCount++;
      continue;
    }

    let min = 15_000_000;
    let max = 25_000_000;

    if (
      title.includes('lead') ||
      title.includes('manager') ||
      title.includes('architect') ||
      title.includes('principal')
    ) {
      min = 35_000_000;
      max = 60_000_000;
    } else if (title.includes('senior')) {
      min = 28_000_000;
      max = 45_000_000;
    } else if (title.includes('intern') || title.includes('thực tập')) {
      min = 5_000_000;
      max = 9_000_000;
    } else if (title.includes('fresher') || title.includes('junior')) {
      min = 10_000_000;
      max = 16_000_000;
    } else {
      // Pick a preset deterministically by index
      const preset = salaryPresets[i % salaryPresets.length];
      min = preset.min;
      max = preset.max;
    }

    await prisma.candidateJobPreference.upsert({
      where: { candidateProfileId: profile.id },
      update: {
        desiredSalaryMin: new Prisma.Decimal(min),
        desiredSalaryMax: new Prisma.Decimal(max),
        salaryCurrency: 'VND',
      },
      create: {
        candidateProfileId: profile.id,
        desiredSalaryMin: new Prisma.Decimal(min),
        desiredSalaryMax: new Prisma.Decimal(max),
        salaryCurrency: 'VND',
      },
    });

    updatedCount++;
  }

  console.log(`=== SALARY SEED COMPLETED ===`);
  console.log(`Updated with salary ranges: ${updatedCount}`);
  console.log(`Kept as 'Thoả thuận': ${negotiableCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Failed to seed salaries:', err);
  process.exit(1);
});
