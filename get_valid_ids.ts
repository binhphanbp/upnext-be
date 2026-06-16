import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://upnext:upnext@localhost:5432/upnext?schema=public',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const candidate = await prisma.candidateAccount.findFirst({
      include: {
        profile: {
          include: {
            cvs: {
              include: {
                versions: true,
              },
            },
          },
        },
      },
    });

    const job = await prisma.jobPost.findFirst({
      where: { status: 'PUBLISHED' },
    });

    console.log('--- VALID DATA FOR TESTING ---');
    if (candidate) {
      console.log('candidateAccountId:', candidate.id);
      console.log('candidateProfileId:', candidate.profile?.id);
      if (candidate.profile?.cvs?.[0]?.versions?.[0]) {
        console.log('cvVersionId:       ', candidate.profile.cvs[0].versions[0].id);
      } else {
        console.log('cvVersionId:        (No CV Version found for this candidate)');
      }
    } else {
      console.log('No Candidate found in database.');
    }

    if (job) {
      console.log('jobPostId:         ', job.id, '|', job.title);
    } else {
      console.log('No PUBLISHED Job Post found in database.');
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
