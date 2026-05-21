import { PrismaClient, UserRole, EmploymentType, ExperienceLevel, JobStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://upnext:upnext@localhost:5432/upnext?schema=public',
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await hash('Password123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@upnext.dev' },
    update: {},
    create: {
      email: 'admin@upnext.dev',
      fullName: 'UpNext Admin',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const recruiter = await prisma.user.upsert({
    where: { email: 'recruiter@upnext.dev' },
    update: {},
    create: {
      email: 'recruiter@upnext.dev',
      fullName: 'Demo Recruiter',
      passwordHash,
      role: UserRole.RECRUITER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'candidate@upnext.dev' },
    update: {},
    create: {
      email: 'candidate@upnext.dev',
      fullName: 'Demo Candidate',
      passwordHash,
      role: UserRole.CANDIDATE,
    },
  });

  const company = await prisma.company.upsert({
    where: { slug: 'upnext-labs' },
    update: {},
    create: {
      name: 'UpNext Labs',
      slug: 'upnext-labs',
      description: 'A sample IT company used for local development.',
      website: 'https://upnext.dev',
      members: {
        create: {
          userId: recruiter.id,
          role: 'OWNER',
          title: 'Talent Lead',
        },
      },
    },
  });

  await prisma.companyMember.upsert({
    where: { userId_companyId: { userId: admin.id, companyId: company.id } },
    update: {},
    create: {
      userId: admin.id,
      companyId: company.id,
      role: 'ADMIN',
      title: 'Platform Admin',
    },
  });

  const skills = await Promise.all(
    ['NestJS', 'TypeScript', 'PostgreSQL', 'Prisma'].map((name) =>
      prisma.skill.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );

  const job = await prisma.job.upsert({
    where: { companyId_slug: { companyId: company.id, slug: 'backend-nestjs-engineer' } },
    update: {},
    create: {
      companyId: company.id,
      title: 'Backend NestJS Engineer',
      slug: 'backend-nestjs-engineer',
      description: 'Build scalable APIs for IT recruitment workflows.',
      requirements: 'Strong TypeScript, NestJS, PostgreSQL and REST API experience.',
      benefits: 'Flexible work, learning budget and modern engineering process.',
      location: 'Ho Chi Minh City',
      isRemote: true,
      employmentType: EmploymentType.FULL_TIME,
      experienceLevel: ExperienceLevel.JUNIOR,
      minSalary: 15000000,
      maxSalary: 30000000,
      status: JobStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  await Promise.all(
    skills.map((skill) =>
      prisma.jobSkill.upsert({
        where: { jobId_skillId: { jobId: job.id, skillId: skill.id } },
        update: {},
        create: { jobId: job.id, skillId: skill.id, required: true },
      }),
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
