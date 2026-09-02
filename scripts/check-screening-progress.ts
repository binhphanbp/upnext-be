import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function testJob() {
  const job = await prisma.jobPost.findUnique({
    where: { id: 'c542840c-e406-4b73-b858-513d372b0cb6' },
    select: { title: true, _count: { select: { applications: true } } }
  });
  console.log('Job:', job);

  const run = await prisma.cvScreeningRun.findFirst({
    where: { jobPostId: 'c542840c-e406-4b73-b858-513d372b0cb6' },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Run state:', run);

  const scoresCount = await prisma.applicationAiScore.count({
    where: { jobPostId: 'c542840c-e406-4b73-b858-513d372b0cb6' }
  });
  console.log('Scores count in DB:', scoresCount);
}

testJob().finally(() => prisma.$disconnect());
