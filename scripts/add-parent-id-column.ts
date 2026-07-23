import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  console.log('Adding parent_id column to post_categories if missing...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE post_categories
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES post_categories(id) ON DELETE SET NULL;
  `);
  console.log('✅ Column parent_id checked/added successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error executing SQL:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
