import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  console.log('=== REMOVING TALENT DISCOVERY DEMO CANDIDATES ===');

  const accounts = await prisma.candidateAccount.findMany({
    where: {
      OR: [
        { fullName: { contains: 'Talent Discovery Demo', mode: 'insensitive' } },
        { email: { contains: 'talent-discovery-seed', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      profile: { select: { id: true } },
    },
  });

  console.log(`Found ${accounts.length} Talent Discovery Demo accounts to remove.`);

  if (accounts.length === 0) {
    console.log('Nothing to delete.');
    await prisma.$disconnect();
    return;
  }

  const accountIds = accounts.map((a) => a.id);
  const profileIds = accounts.map((a) => a.profile?.id).filter((id): id is string => Boolean(id));

  // 1. Delete associated FileAssets
  if (profileIds.length > 0) {
    const deletedFiles = await prisma.fileAsset.deleteMany({
      where: {
        ownerId: { in: profileIds },
      },
    });
    console.log(`Deleted ${deletedFiles.count} associated FileAsset records.`);

    // Delete CvPoolDetailView if any
    const deletedViews = await prisma.cvPoolDetailView.deleteMany({
      where: {
        candidateProfileId: { in: profileIds },
      },
    });
    console.log(`Deleted ${deletedViews.count} CvPoolDetailView records.`);

    // Delete CvPoolUnlock if any
    const deletedUnlocks = await prisma.cvPoolUnlock.deleteMany({
      where: {
        candidateProfileId: { in: profileIds },
      },
    });
    console.log(`Deleted ${deletedUnlocks.count} CvPoolUnlock records.`);
  }

  // 2. Delete candidate accounts (cascades to profile, skills, experiences, cv, etc.)
  const deletedAccounts = await prisma.candidateAccount.deleteMany({
    where: {
      id: { in: accountIds },
    },
  });

  console.log(`Successfully deleted ${deletedAccounts.count} Talent Discovery Demo accounts.`);
  console.log('=== CLEANUP COMPLETED ===');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Failed to remove demo candidates:', err);
  process.exit(1);
});
