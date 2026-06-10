import { PrismaClient, JobStatus, SkillPriority } from '@prisma/client';
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

  const adminRole = await prisma.adminRole.upsert({
    where: { roleName: 'Platform Admin' },
    update: {},
    create: {
      roleName: 'Platform Admin',
      description: 'Default administrator role for local development.',
    },
  });

  await prisma.adminUser.upsert({
    where: { email: 'admin@upnext.dev' },
    update: {},
    create: {
      email: 'admin@upnext.dev',
      fullName: 'UpNext Admin',
      passwordHash,
      roleId: adminRole.id,
    },
  });

  const recruiterRole = await prisma.recruiterRole.upsert({
    where: { code: 'OWNER' },
    update: { name: 'Company Owner' },
    create: {
      code: 'OWNER',
      name: 'Company Owner',
      description: 'Default company owner role for local development.',
    },
  });

  const recruiter = await prisma.recruiterAccount.upsert({
    where: { email: 'recruiter@upnext.dev' },
    update: {},
    create: {
      email: 'recruiter@upnext.dev',
      passwordHash,
      recruiterRoleId: recruiterRole.id,
      profile: {
        create: {
          fullName: 'Demo Recruiter',
        },
      },
    },
  });

  const company = await prisma.company.upsert({
    where: { taxCode: 'UPNEXT-LOCAL-001' },
    update: {},
    create: {
      name: 'UpNext Labs',
      taxCode: 'UPNEXT-LOCAL-001',
      description: 'A sample IT company used for local development.',
      website: 'https://upnext.dev',
    },
  });

  await prisma.recruiterAccount.update({
    where: { id: recruiter.id },
    data: {
      companyId: company.id,
      recruiterRoleId: recruiterRole.id,
    },
  });

  await prisma.companyMember.upsert({
    where: {
      recruiterAccountId_companyId: {
        recruiterAccountId: recruiter.id,
        companyId: company.id,
      },
    },
    update: {},
    create: {
      recruiterAccountId: recruiter.id,
      companyId: company.id,
      roleId: recruiterRole.id,
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

  const employmentType = await prisma.employmentType.upsert({
    where: { name: 'Full-time' },
    update: {},
    create: { name: 'Full-time' },
  });

  const experienceLevel = await prisma.experienceLevel.upsert({
    where: { code: 'junior' },
    update: { name: 'Junior' },
    create: {
      code: 'junior',
      name: 'Junior',
    },
  });

  const job = await prisma.jobPost.upsert({
    where: { slug: 'backend-nestjs-engineer' },
    update: {},
    create: {
      createdByRecruiterId: recruiter.id,
      companyId: company.id,
      title: 'Backend NestJS Engineer',
      slug: 'backend-nestjs-engineer',
      description: 'Build scalable APIs for IT recruitment workflows.',
      requirements: 'Strong TypeScript, NestJS, PostgreSQL and REST API experience.',
      benefits: 'Flexible work, learning budget and modern engineering process.',
      employmentTypeId: employmentType.id,
      experienceLevelId: experienceLevel.id,
      salaryMin: 15000000,
      salaryMax: 30000000,
      status: JobStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });

  await Promise.all(
    skills.map((skill: (typeof skills)[number]) =>
      prisma.jobPostSkill.upsert({
        where: { jobPostId_skillId: { jobPostId: job.id, skillId: skill.id } },
        update: {},
        create: {
          jobPostId: job.id,
          skillId: skill.id,
          priority: SkillPriority.REQUIRED,
        },
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
