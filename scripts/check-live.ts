import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function testCurrentRun() {
  const run = await prisma.cvScreeningRun.findUnique({
    where: { id: 'd31dc21e-6459-45f4-af12-eb646881a287' },
  });
  console.log('Progress:', run?.processedCount, '/', run?.totalApplications, 'Status:', run?.status);
}

void testCurrentRun().finally(() => prisma.$disconnect());
