import { PrismaClient, FilePurpose, FileVisibility } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  console.log('=== SEEDING AVATARS FOR ALL CANDIDATES ===');

  const candidates = await prisma.candidateProfile.findMany({
    select: {
      id: true,
      gender: true,
      account: { select: { fullName: true, email: true } },
    },
  });

  console.log(`Found ${candidates.length} candidate profiles in DB.`);

  let createdCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    // Use pravatar with deterministic unique seed so it gives a consistent, real human face
    const avatarUrl = `https://i.pravatar.cc/150?u=candidate-${candidate.id}`;

    const existingAsset = await prisma.fileAsset.findFirst({
      where: {
        ownerId: candidate.id,
        purpose: FilePurpose.AVATAR,
      },
    });

    if (!existingAsset) {
      await prisma.fileAsset.create({
        data: {
          ownerType: 'candidate_profile',
          ownerId: candidate.id,
          purpose: FilePurpose.AVATAR,
          visibility: FileVisibility.PUBLIC,
          storageKey: `avatars/${candidate.id}.jpg`,
          originalName: `${candidate.account.email}-avatar.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: BigInt(24500),
          publicUrl: avatarUrl,
        },
      });
      createdCount++;
    } else {
      await prisma.fileAsset.update({
        where: { id: existingAsset.id },
        data: {
          publicUrl: avatarUrl,
        },
      });
      updatedCount++;
    }

    if ((i + 1) % 25 === 0 || i + 1 === candidates.length) {
      console.log(`[AVATAR SEED] Processed ${i + 1}/${candidates.length} candidates...`);
    }
  }

  console.log(`=== AVATAR SEED COMPLETED ===`);
  console.log(`Created: ${createdCount}`);
  console.log(`Updated: ${updatedCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal avatar seed error:', err);
  process.exit(1);
});
