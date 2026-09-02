import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { FilePurpose, FileVisibility, PrismaClient } from '@prisma/client';
import 'dotenv/config';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const appBackendUrl = (process.env.APP_BACKEND_URL?.trim() || 'http://localhost:3001').replace(
    /\/+$/,
    '',
  );
  const uploadRoot = path.resolve(process.env.UPLOAD_ROOT?.trim() || 'uploads');
  const coversDir = path.join(uploadRoot, 'company-covers');

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const companies = await prisma.company.findMany({
      select: { id: true, slug: true, name: true },
    });

    console.log(`Found ${companies.length} companies in DB. Updating cover photos...`);

    const now = new Date();
    let updatedCount = 0;

    for (const company of companies) {
      const pngPath = path.join(coversDir, `${company.slug}.png`);
      const jpgPath = path.join(coversDir, `${company.slug}.jpg`);
      const jpegPath = path.join(coversDir, `${company.slug}.jpeg`);

      let publicUrl: string | null = null;
      let mimeType = 'image/png';
      let originalName = `${company.slug}.png`;
      let storageKey = `company-covers/${company.slug}.png`;
      let sizeBytes = BigInt(0);

      if (fs.existsSync(pngPath)) {
        publicUrl = `${appBackendUrl}/uploads/company-covers/${company.slug}.png`;
        mimeType = 'image/png';
        originalName = `${company.slug}.png`;
        storageKey = `company-covers/${company.slug}.png`;
        sizeBytes = BigInt(fs.statSync(pngPath).size);
      } else if (fs.existsSync(jpgPath)) {
        publicUrl = `${appBackendUrl}/uploads/company-covers/${company.slug}.jpg`;
        mimeType = 'image/jpeg';
        originalName = `${company.slug}.jpg`;
        storageKey = `company-covers/${company.slug}.jpg`;
        sizeBytes = BigInt(fs.statSync(jpgPath).size);
      } else if (fs.existsSync(jpegPath)) {
        publicUrl = `${appBackendUrl}/uploads/company-covers/${company.slug}.jpeg`;
        mimeType = 'image/jpeg';
        originalName = `${company.slug}.jpeg`;
        storageKey = `company-covers/${company.slug}.jpeg`;
        sizeBytes = BigInt(fs.statSync(jpegPath).size);
      }

      if (publicUrl) {
        const fileId = createHash('md5').update(`company-cover:${company.slug}`).digest('hex');
        const formattedId = `${fileId.slice(0, 8)}-${fileId.slice(8, 12)}-${fileId.slice(12, 16)}-${fileId.slice(16, 20)}-${fileId.slice(20, 32)}`;

        await prisma.fileAsset.upsert({
          where: { id: formattedId },
          update: {
            ownerType: 'company_cover',
            ownerId: company.id,
            purpose: FilePurpose.OTHER,
            visibility: FileVisibility.PUBLIC,
            storageKey,
            originalName,
            mimeType,
            sizeBytes,
            publicUrl,
            updatedAt: now,
          },
          create: {
            id: formattedId,
            ownerType: 'company_cover',
            ownerId: company.id,
            purpose: FilePurpose.OTHER,
            visibility: FileVisibility.PUBLIC,
            storageKey,
            originalName,
            mimeType,
            sizeBytes,
            publicUrl,
            createdAt: now,
            updatedAt: now,
          },
        });

        updatedCount++;
      }
    }

    console.log(
      `✅ Successfully updated ${updatedCount}/${companies.length} company covers to local uploads!`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
