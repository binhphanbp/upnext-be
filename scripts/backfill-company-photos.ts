import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { FilePurpose, FileVisibility, PrismaClient } from '@prisma/client';
import 'dotenv/config';

type CompanySeedItem = {
  slug: string;
  environmentImages?: unknown[];
};

type CompanySeedData = {
  companies?: CompanySeedItem[];
};

function uuidFromSeed(value: string) {
  const hash = createHash('md5').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to backfill company photos.');
  }

  const seedPath = path.resolve('prisma/data/companies_50_real_logo_dev.json');
  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as CompanySeedData;
  const seedCompanies = seedData.companies ?? [];
  const slugs = seedCompanies.map((company) => company.slug);
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const companies = await prisma.company.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });
    const companyIdBySlug = new Map(companies.map((company) => [company.slug, company.id]));
    const now = new Date();
    const photos = seedCompanies.flatMap((company) => {
      const companyId = companyIdBySlug.get(company.slug);
      if (!companyId) return [];

      const environmentImages = (company.environmentImages ?? []).filter(
        (imageUrl): imageUrl is string =>
          typeof imageUrl === 'string' && imageUrl.trim().length > 0,
      );

      return environmentImages.map((publicUrl, index) => ({
        id: uuidFromSeed(`logo-dev-photo:${company.slug}:${index + 1}`),
        ownerType: 'company_photo',
        ownerId: companyId,
        purpose: FilePurpose.OTHER,
        visibility: FileVisibility.PUBLIC,
        storageKey: `upnext/seed/company-workplaces/${company.slug}/workplace-${index + 1}`,
        originalName: `${company.slug}-workplace-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(0),
        publicUrl,
        createdAt: now,
        updatedAt: now,
      }));
    });
    const covers = seedCompanies.flatMap((company) => {
      const companyId = companyIdBySlug.get(company.slug);
      if (!companyId) return [];

      const coverUrl = (company.environmentImages ?? []).find(
        (imageUrl): imageUrl is string =>
          typeof imageUrl === 'string' && imageUrl.trim().length > 0,
      );
      if (!coverUrl) return [];

      return [
        {
          id: uuidFromSeed(`logo-dev-cover:${company.slug}`),
          ownerType: 'company_cover',
          ownerId: companyId,
          purpose: FilePurpose.OTHER,
          visibility: FileVisibility.PUBLIC,
          storageKey: `upnext/seed/company-workplaces/${company.slug}/cover`,
          originalName: `${company.slug}-cover.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: BigInt(0),
          publicUrl: coverUrl,
          createdAt: now,
          updatedAt: now,
        },
      ];
    });
    const assets = [...covers, ...photos];

    const existingAssets = await prisma.fileAsset.findMany({
      where: { id: { in: assets.map((asset) => asset.id) } },
      select: { id: true },
    });
    const existingIds = new Set(existingAssets.map((asset) => asset.id));
    const newAssets = assets.filter((asset) => !existingIds.has(asset.id));
    const assetsToUpdate = assets.filter((asset) => existingIds.has(asset.id));

    const result = await prisma.fileAsset.createMany({
      data: newAssets,
      skipDuplicates: true,
    });

    for (let index = 0; index < assetsToUpdate.length; index += 50) {
      const batch = assetsToUpdate.slice(index, index + 50);
      await prisma.$transaction(
        batch.map((asset) =>
          prisma.fileAsset.update({
            where: { id: asset.id },
            data: {
              ownerType: asset.ownerType,
              ownerId: asset.ownerId,
              purpose: asset.purpose,
              visibility: asset.visibility,
              storageKey: asset.storageKey,
              originalName: asset.originalName,
              mimeType: asset.mimeType,
              sizeBytes: asset.sizeBytes,
              publicUrl: asset.publicUrl,
              updatedAt: now,
            },
          }),
        ),
      );
    }

    console.log(
      `Company media sync complete: ${result.count} inserted, ${assetsToUpdate.length} updated (${covers.length} covers, ${photos.length} photos).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
