import {
  ApplicationStatus,
  CompanyStatus,
  CompanyType,
  CompanyVerificationStatus,
  CvSource,
  CvStatus,
  FilePurpose,
  FileVisibility,
  JobStatus,
  PrismaClient,
  SalaryPeriod,
  SkillPriority,
  WorkingModel,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ?? 'postgresql://upnext:upnext@localhost:5432/upnext?schema=public',
});
const prisma = new PrismaClient({ adapter });

const SEED_KEY = 'seed-home-test';
const SEED_EMAIL_PREFIX = `${SEED_KEY}.`;
const SEED_TAX_CODE_PREFIX = 'SEED_HOME_TEST_';
const SEED_STORAGE_PREFIX = `${SEED_KEY}/`;
const SEED_ADDRESS_PREFIX = '[SEED_HOME_TEST]';
const DAY = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function cleanHomeSeedData() {
  const candidateAccounts = await prisma.candidateAccount.findMany({
    where: {
      email: {
        startsWith: SEED_EMAIL_PREFIX,
      },
    },
    select: {
      id: true,
      profile: {
        select: {
          id: true,
        },
      },
    },
  });

  const candidateProfileIds = candidateAccounts
    .map((account) => account.profile?.id)
    .filter((id): id is string => Boolean(id));

  const recruiterAccounts = await prisma.recruiterAccount.findMany({
    where: {
      email: {
        startsWith: `${SEED_EMAIL_PREFIX}recruiter.`,
      },
    },
    select: {
      id: true,
    },
  });

  const recruiterIds = recruiterAccounts.map((account) => account.id);

  const jobPosts = await prisma.jobPost.findMany({
    where: {
      slug: {
        startsWith: SEED_KEY,
      },
    },
    select: {
      id: true,
    },
  });

  const jobIds = jobPosts.map((job) => job.id);

  if (jobIds.length > 0) {
    const applicationIds = (
      await prisma.application.findMany({
        where: {
          jobPostId: {
            in: jobIds,
          },
        },
        select: {
          id: true,
        },
      })
    ).map((application) => application.id);

    if (applicationIds.length > 0) {
      await prisma.applicationStatusLog.deleteMany({
        where: {
          applicationId: {
            in: applicationIds,
          },
        },
      });
    }

    await prisma.savedJob.deleteMany({
      where: {
        jobPostId: {
          in: jobIds,
        },
      },
    });

    await prisma.jobView.deleteMany({
      where: {
        jobPostId: {
          in: jobIds,
        },
      },
    });

    await prisma.application.deleteMany({
      where: {
        jobPostId: {
          in: jobIds,
        },
      },
    });

    await prisma.jobPostSkill.deleteMany({
      where: {
        jobPostId: {
          in: jobIds,
        },
      },
    });

    await prisma.jobPostLocation.deleteMany({
      where: {
        jobPostId: {
          in: jobIds,
        },
      },
    });

    await prisma.jobPost.deleteMany({
      where: {
        id: {
          in: jobIds,
        },
      },
    });
  }

  if (candidateProfileIds.length > 0) {
    await prisma.savedJob.deleteMany({
      where: {
        candidateProfileId: {
          in: candidateProfileIds,
        },
      },
    });

    await prisma.jobView.deleteMany({
      where: {
        candidateProfileId: {
          in: candidateProfileIds,
        },
      },
    });

    await prisma.application.deleteMany({
      where: {
        candidateProfileId: {
          in: candidateProfileIds,
        },
      },
    });
  }

  if (recruiterIds.length > 0) {
    await prisma.companyMember.deleteMany({
      where: {
        recruiterAccountId: {
          in: recruiterIds,
        },
      },
    });
  }

  await prisma.jobLocation.deleteMany({
    where: {
      address: {
        startsWith: SEED_ADDRESS_PREFIX,
      },
    },
  });

  await prisma.recruiterAccount.deleteMany({
    where: {
      email: {
        startsWith: `${SEED_EMAIL_PREFIX}recruiter.`,
      },
    },
  });

  await prisma.company.deleteMany({
    where: {
      taxCode: {
        startsWith: SEED_TAX_CODE_PREFIX,
      },
    },
  });

  await prisma.candidateAccount.deleteMany({
    where: {
      email: {
        startsWith: SEED_EMAIL_PREFIX,
      },
    },
  });

  await prisma.fileAsset.deleteMany({
    where: {
      storageKey: {
        startsWith: SEED_STORAGE_PREFIX,
      },
    },
  });
}

async function main() {
  await cleanHomeSeedData();

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

  const employmentTypes = {
    fullTime: await prisma.employmentType.upsert({
      where: { name: 'Full-time' },
      update: {},
      create: { name: 'Full-time' },
    }),
    partTime: await prisma.employmentType.upsert({
      where: { name: 'Part-time' },
      update: {},
      create: { name: 'Part-time' },
    }),
  };

  const experienceLevels = {
    junior: await prisma.experienceLevel.upsert({
      where: { code: 'junior' },
      update: { name: 'Junior' },
      create: { code: 'junior', name: 'Junior' },
    }),
    mid: await prisma.experienceLevel.upsert({
      where: { code: 'mid' },
      update: { name: 'Mid-level' },
      create: { code: 'mid', name: 'Mid-level' },
    }),
    senior: await prisma.experienceLevel.upsert({
      where: { code: 'senior' },
      update: { name: 'Senior' },
      create: { code: 'senior', name: 'Senior' },
    }),
  };

  const jobCategories = {
    backend: await prisma.jobCategory.upsert({
      where: { name: 'Backend Engineering' },
      update: {},
      create: { name: 'Backend Engineering' },
    }),
    frontend: await prisma.jobCategory.upsert({
      where: { name: 'Frontend Engineering' },
      update: {},
      create: { name: 'Frontend Engineering' },
    }),
    data: await prisma.jobCategory.upsert({
      where: { name: 'Data & AI' },
      update: {},
      create: { name: 'Data & AI' },
    }),
    design: await prisma.jobCategory.upsert({
      where: { name: 'Product Design' },
      update: {},
      create: { name: 'Product Design' },
    }),
    operations: await prisma.jobCategory.upsert({
      where: { name: 'Operations' },
      update: {},
      create: { name: 'Operations' },
    }),
    security: await prisma.jobCategory.upsert({
      where: { name: 'Security' },
      update: {},
      create: { name: 'Security' },
    }),
  };

  const skills = Object.fromEntries(
    await Promise.all(
      ['TypeScript', 'NestJS', 'Prisma', 'React', 'AWS', 'AI', 'QA', 'Figma'].map(async (name) => {
        const skill = await prisma.skill.upsert({
          where: { name },
          update: {},
          create: { name },
        });

        return [name, skill] as const;
      }),
    ),
  );

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const futureDeadline = addDays(now, 45);

  const companyDefinitions = [
    {
      key: 'alpha',
      name: 'Northstar Product Studio',
      type: CompanyType.PRODUCT,
      description: 'Builds SaaS hiring products for regional employers.',
      companySize: '100-199',
      city: 'Ho Chi Minh City',
      applicationsWeight: 11,
    },
    {
      key: 'beta',
      name: 'Bluewave Outsourcing',
      type: CompanyType.OUTSOURCING,
      description: 'Delivers distributed product teams for fast-growing startups.',
      companySize: '200-499',
      city: 'Da Nang',
      applicationsWeight: 8,
    },
    {
      key: 'gamma',
      name: 'Orbit AI Labs',
      type: CompanyType.STARTUP,
      description: 'Applies AI workflows to recruiting and talent analytics.',
      companySize: '50-99',
      city: 'Ha Noi',
      applicationsWeight: 5,
    },
    {
      key: 'delta',
      name: 'Vertex Commerce Tech',
      type: CompanyType.PRODUCT,
      description: 'Builds commerce operations tools and internal platforms.',
      companySize: '100-199',
      city: 'Can Tho',
      applicationsWeight: 3,
    },
  ] as const;

  const companies = companyDefinitions.map((definition) => {
    const companyId = randomUUID();
    const logoFileId = randomUUID();
    const coverFileId = randomUUID();

    return {
      ...definition,
      id: companyId,
      logoFileId,
      coverFileId,
      taxCode: `${SEED_TAX_CODE_PREFIX}${definition.key.toUpperCase()}`,
      email: `${definition.key}@seed-home-test.upnext.dev`,
      website: `https://${definition.key}.seed-home-test.upnext.dev`,
    };
  });

  await prisma.fileAsset.createMany({
    data: companies.flatMap((company) => [
      {
        id: company.logoFileId,
        ownerType: 'company',
        ownerId: company.id,
        purpose: FilePurpose.COMPANY_LOGO,
        visibility: FileVisibility.PUBLIC,
        storageKey: `${SEED_STORAGE_PREFIX}companies/${company.key}/logo.png`,
        originalName: `${company.key}-logo.png`,
        mimeType: 'image/png',
        sizeBytes: BigInt(2048),
        publicUrl: `https://cdn.seed-home-test.local/${company.key}/logo.png`,
      },
      {
        id: company.coverFileId,
        ownerType: 'company_cover',
        ownerId: company.id,
        purpose: FilePurpose.OTHER,
        visibility: FileVisibility.PUBLIC,
        storageKey: `${SEED_STORAGE_PREFIX}companies/${company.key}/cover.png`,
        originalName: `${company.key}-cover.png`,
        mimeType: 'image/png',
        sizeBytes: BigInt(4096),
        publicUrl: `https://cdn.seed-home-test.local/${company.key}/cover.png`,
      },
    ]),
  });

  await prisma.company.createMany({
    data: companies.map((company, index) => ({
      id: company.id,
      logoFileId: company.logoFileId,
      type: company.type,
      name: company.name,
      taxCode: company.taxCode,
      address: `${company.city}, Vietnam`,
      email: company.email,
      phone: `09000000${index + 1}`,
      website: company.website,
      description: company.description,
      companySize: company.companySize,
      verificationStatus: CompanyVerificationStatus.VERIFIED,
      status: CompanyStatus.ACTIVE,
      createdAt: addDays(lastMonthStart, index),
      updatedAt: addDays(lastMonthStart, index),
    })),
  });

  const recruiters = companies.map((company) => ({
    id: randomUUID(),
    profileId: randomUUID(),
    companyId: company.id,
    email: `${SEED_EMAIL_PREFIX}recruiter.${company.key}@upnext.dev`,
    fullName: `${company.name} Recruiter`,
    createdAt: addDays(lastMonthStart, 1),
  }));

  await prisma.recruiterAccount.createMany({
    data: recruiters.map((recruiter) => ({
      id: recruiter.id,
      companyId: recruiter.companyId,
      recruiterRoleId: recruiterRole.id,
      email: recruiter.email,
      passwordHash,
      createdAt: recruiter.createdAt,
      updatedAt: recruiter.createdAt,
    })),
  });

  await prisma.recruiterProfile.createMany({
    data: recruiters.map((recruiter) => ({
      id: recruiter.profileId,
      recruiterAccountId: recruiter.id,
      fullName: recruiter.fullName,
      avatarUrl: `https://cdn.seed-home-test.local/recruiters/${toSlug(recruiter.fullName)}.png`,
      createdAt: recruiter.createdAt,
      updatedAt: recruiter.createdAt,
    })),
  });

  await prisma.companyMember.createMany({
    data: recruiters.map((recruiter) => ({
      recruiterAccountId: recruiter.id,
      companyId: recruiter.companyId,
      roleId: recruiterRole.id,
      createdAt: recruiter.createdAt,
      updatedAt: recruiter.createdAt,
    })),
  });

  const candidates = Array.from({ length: 12 }, (_, index) => {
    const n = index + 1;
    const accountId = randomUUID();
    const profileId = randomUUID();
    const cvId = randomUUID();
    const cvVersionId = randomUUID();

    return {
      index,
      accountId,
      profileId,
      cvId,
      cvVersionId,
      email: `${SEED_EMAIL_PREFIX}candidate.${n}@upnext.dev`,
      fullName: `Seed Candidate ${n}`,
      createdAt: addDays(lastMonthStart, n),
    };
  });

  await prisma.candidateAccount.createMany({
    data: candidates.map((candidate) => ({
      id: candidate.accountId,
      fullName: candidate.fullName,
      email: candidate.email,
      passwordHash,
      emailVerifiedAt: candidate.createdAt,
      createdAt: candidate.createdAt,
      updatedAt: candidate.createdAt,
    })),
  });

  await prisma.candidateProfile.createMany({
    data: candidates.map((candidate) => ({
      id: candidate.profileId,
      candidateAccountId: candidate.accountId,
      address: 'Ho Chi Minh City, Vietnam',
      description: `Candidate profile for ${candidate.fullName}`,
      createdAt: candidate.createdAt,
      updatedAt: candidate.createdAt,
    })),
  });

  await prisma.cV.createMany({
    data: candidates.map((candidate) => ({
      id: candidate.cvId,
      candidateProfileId: candidate.profileId,
      title: `${candidate.fullName} CV`,
      source: CvSource.BUILDER,
      status: CvStatus.ACTIVE,
      isDefault: true,
      createdAt: candidate.createdAt,
      updatedAt: candidate.createdAt,
    })),
  });

  await prisma.cVVersion.createMany({
    data: candidates.map((candidate) => ({
      id: candidate.cvVersionId,
      cvId: candidate.cvId,
      versionNo: 1,
      parsedText: `${candidate.fullName} seeded CV version`,
      createdAt: candidate.createdAt,
    })),
  });

  const companyByKey = Object.fromEntries(companies.map((company) => [company.key, company]));
  const recruiterByCompanyId = Object.fromEntries(recruiters.map((recruiter) => [recruiter.companyId, recruiter]));

  const jobDefinitions = [
    {
      title: 'Backend Platform Engineer',
      companyKey: 'alpha',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'backend',
      workMode: WorkingModel.REMOTE,
      city: 'Ho Chi Minh City',
      district: 'District 1',
      salaryMin: 18000000,
      salaryMax: 32000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 4),
      applications: [0, 1, 2, 3, 4],
      skills: ['TypeScript', 'NestJS', 'Prisma'],
    },
    {
      title: 'Data Engineer',
      companyKey: 'alpha',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'senior',
      jobCategoryKey: 'data',
      workMode: WorkingModel.ONSITE,
      city: 'Ho Chi Minh City',
      district: 'District 3',
      salaryMin: 30000000,
      salaryMax: 45000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 6),
      applications: [1, 2],
      skills: ['TypeScript', 'AWS', 'AI'],
    },
    {
      title: 'Cloud QA Specialist',
      companyKey: 'alpha',
      employmentTypeKey: 'partTime',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.REMOTE,
      city: 'Ho Chi Minh City',
      district: 'Phu Nhuan',
      salaryMin: 9000000,
      salaryMax: 15000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 8),
      applications: [3],
      skills: ['QA', 'AWS'],
    },
    {
      title: 'Integration Engineer',
      companyKey: 'alpha',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'junior',
      jobCategoryKey: 'backend',
      workMode: WorkingModel.HYBRID,
      city: 'Ho Chi Minh City',
      district: 'Binh Thanh',
      salaryMin: 12000000,
      salaryMax: 20000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 10),
      applications: [5],
      skills: ['TypeScript', 'Prisma'],
    },
    {
      title: 'Frontend React Engineer',
      companyKey: 'beta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'frontend',
      workMode: WorkingModel.REMOTE,
      city: 'Da Nang',
      district: 'Hai Chau',
      salaryMin: 16000000,
      salaryMax: 26000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 12),
      applications: [0, 4, 5, 6],
      skills: ['React', 'TypeScript'],
    },
    {
      title: 'Product Designer',
      companyKey: 'beta',
      employmentTypeKey: 'partTime',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'design',
      workMode: WorkingModel.REMOTE,
      city: 'Da Nang',
      district: 'Thanh Khe',
      salaryMin: 10000000,
      salaryMax: 18000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 14),
      applications: [2, 7],
      skills: ['Figma', 'React'],
    },
    {
      title: 'DevOps Engineer',
      companyKey: 'beta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'senior',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.ONSITE,
      city: 'Da Nang',
      district: 'Son Tra',
      salaryMin: 28000000,
      salaryMax: 40000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 16),
      applications: [8, 9],
      skills: ['AWS', 'TypeScript'],
    },
    {
      title: 'Growth Engineer',
      companyKey: 'beta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'junior',
      jobCategoryKey: 'backend',
      workMode: WorkingModel.REMOTE,
      city: 'Da Nang',
      district: 'Ngu Hanh Son',
      salaryMin: null,
      salaryMax: null,
      salaryIsNegotiable: true,
      createdAt: addDays(currentMonthStart, 3),
      applications: [],
      skills: ['TypeScript', 'React'],
    },
    {
      title: 'AI Engineer',
      companyKey: 'gamma',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'senior',
      jobCategoryKey: 'data',
      workMode: WorkingModel.HYBRID,
      city: 'Ha Noi',
      district: 'Cau Giay',
      salaryMin: 35000000,
      salaryMax: 55000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 18),
      applications: [1, 6],
      skills: ['AI', 'Python', 'AWS'].filter((name) => name in skills),
    },
    {
      title: 'Mobile Engineer',
      companyKey: 'gamma',
      employmentTypeKey: 'partTime',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'frontend',
      workMode: WorkingModel.REMOTE,
      city: 'Ha Noi',
      district: 'Dong Da',
      salaryMin: 14000000,
      salaryMax: 22000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 20),
      applications: [7],
      skills: ['React', 'TypeScript'],
    },
    {
      title: 'Support Analyst',
      companyKey: 'gamma',
      employmentTypeKey: 'partTime',
      experienceLevelKey: 'junior',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.ONSITE,
      city: 'Ha Noi',
      district: 'Ba Dinh',
      salaryMin: 7000000,
      salaryMax: 9000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 22),
      applications: [10],
      skills: ['QA'],
    },
    {
      title: 'UX Researcher',
      companyKey: 'gamma',
      employmentTypeKey: 'partTime',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'design',
      workMode: WorkingModel.REMOTE,
      city: 'Ha Noi',
      district: 'Hoan Kiem',
      salaryMin: null,
      salaryMax: null,
      salaryIsNegotiable: true,
      createdAt: addDays(currentMonthStart, 5),
      applications: [4],
      skills: ['Figma'],
    },
    {
      title: 'Security Engineer',
      companyKey: 'delta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'senior',
      jobCategoryKey: 'security',
      workMode: WorkingModel.REMOTE,
      city: 'Can Tho',
      district: 'Ninh Kieu',
      salaryMin: 32000000,
      salaryMax: 50000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 24),
      applications: [9, 10, 11],
      skills: ['AWS', 'TypeScript'],
    },
    {
      title: 'Technical Writer',
      companyKey: 'delta',
      employmentTypeKey: 'partTime',
      experienceLevelKey: 'junior',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.HYBRID,
      city: 'Can Tho',
      district: 'Binh Thuy',
      salaryMin: 10000000,
      salaryMax: 14000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 26),
      applications: [],
      skills: ['QA'],
    },
    {
      title: 'CRM Specialist',
      companyKey: 'delta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.ONSITE,
      city: 'Can Tho',
      district: 'Cai Rang',
      salaryMin: 15000000,
      salaryMax: 21000000,
      salaryIsNegotiable: false,
      createdAt: addDays(currentMonthStart, 7),
      applications: [],
      skills: ['TypeScript'],
    },
    {
      title: 'Platform Reliability Engineer',
      companyKey: 'alpha',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.REMOTE,
      city: 'Ho Chi Minh City',
      district: 'District 7',
      salaryMin: 25000000,
      salaryMax: 36000000,
      salaryIsNegotiable: false,
      createdAt: addDays(currentMonthStart, 1),
      applications: [8, 11],
      skills: ['AWS', 'Prisma'],
    },
  ] as const;

  const jobs = jobDefinitions.map((definition) => {
    const company = companyByKey[definition.companyKey];
    const recruiter = recruiterByCompanyId[company.id];
    const employmentType =
      definition.employmentTypeKey === 'fullTime' ? employmentTypes.fullTime : employmentTypes.partTime;
    const experienceLevel =
      definition.experienceLevelKey === 'junior'
        ? experienceLevels.junior
        : definition.experienceLevelKey === 'mid'
          ? experienceLevels.mid
          : experienceLevels.senior;
    const jobCategory = jobCategories[definition.jobCategoryKey];

    return {
      ...definition,
      id: randomUUID(),
      slug: `${SEED_KEY}-${toSlug(definition.title)}`,
      companyId: company.id,
      recruiterId: recruiter.id,
      employmentTypeId: employmentType.id,
      experienceLevelId: experienceLevel.id,
      jobCategoryId: jobCategory.id,
      publishedAt: addDays(definition.createdAt, 1),
      expiredAt: futureDeadline,
    };
  });

  await prisma.jobPost.createMany({
    data: jobs.map((job) => ({
      id: job.id,
      createdByRecruiterId: job.recruiterId,
      companyId: job.companyId,
      jobCategoryId: job.jobCategoryId,
      experienceLevelId: job.experienceLevelId,
      employmentTypeId: job.employmentTypeId,
      title: job.title,
      slug: job.slug,
      description: `${job.title} role seeded for Home API verification.`,
      requirements: 'Seeded requirements for Home API testing.',
      benefits: 'Remote-friendly setup, strong product culture, and learning budget.',
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: 'VND',
      salaryPeriod: SalaryPeriod.MONTH,
      salaryIsNegotiable: job.salaryIsNegotiable,
      salaryIsVisible: true,
      vacanciesCount: 1,
      status: JobStatus.PUBLISHED,
      moderationStatus: 'APPROVED',
      publishedAt: job.publishedAt,
      expiredAt: job.expiredAt,
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
    })),
  });

  const jobLocations = jobs.map((job) => ({
    id: randomUUID(),
    jobPostId: job.id,
    country: 'Vietnam',
    city: job.city,
    district: job.district,
    address: `${SEED_ADDRESS_PREFIX} ${job.title} Hub`,
    workingModel: job.workMode,
    createdAt: job.createdAt,
  }));

  await prisma.jobLocation.createMany({
    data: jobLocations.map((location) => ({
      id: location.id,
      country: location.country,
      city: location.city,
      district: location.district,
      address: location.address,
      workingModel: location.workingModel,
      createdAt: location.createdAt,
      updatedAt: location.createdAt,
    })),
  });

  await prisma.jobPostLocation.createMany({
    data: jobLocations.map((location) => ({
      jobPostId: location.jobPostId,
      jobLocationId: location.id,
    })),
  });

  await prisma.jobPostSkill.createMany({
    data: jobs.flatMap((job) =>
      job.skills
        .filter((skillName) => skillName in skills)
        .map((skillName) => ({
          jobPostId: job.id,
          skillId: skills[skillName as keyof typeof skills].id,
          priority: SkillPriority.REQUIRED,
        })),
    ),
  });

  const applications = jobs.flatMap((job) =>
    job.applications.map((candidateIndex, index) => {
      const candidate = candidates[candidateIndex];

      return {
        id: randomUUID(),
        jobPostId: job.id,
        candidateProfileId: candidate.profileId,
        cvVersionId: candidate.cvVersionId,
        coverLetter: `${candidate.fullName} applied for ${job.title}`,
        status: ApplicationStatus.SUBMITTED,
        submittedAt: addDays(job.createdAt, index + 1),
        createdAt: addDays(job.createdAt, index + 1),
      };
    }),
  );

  if (applications.length > 0) {
    await prisma.application.createMany({
      data: applications.map((application) => ({
        id: application.id,
        jobPostId: application.jobPostId,
        candidateProfileId: application.candidateProfileId,
        cvVersionId: application.cvVersionId,
        coverLetter: application.coverLetter,
        status: application.status,
        submittedAt: application.submittedAt,
        createdAt: application.createdAt,
        updatedAt: application.createdAt,
      })),
    });
  }

  const savedJobs = [
    [0, 0],
    [1, 0],
    [2, 4],
    [3, 4],
    [4, 8],
    [5, 12],
    [6, 14],
  ].map(([candidateIndex, jobIndex]) => ({
    candidateProfileId: candidates[candidateIndex].profileId,
    jobPostId: jobs[jobIndex].id,
    createdAt: addDays(jobs[jobIndex].createdAt, 2),
  }));

  await prisma.savedJob.createMany({
    data: savedJobs,
  });

  const jobViews = jobs.flatMap((job, jobIndex) =>
    Array.from({ length: Math.max(2, 8 - Math.floor(jobIndex / 2)) }, (_, index) => ({
      id: randomUUID(),
      candidateProfileId: index < candidates.length && index % 2 === 0 ? candidates[index].profileId : null,
      jobPostId: job.id,
      visitorKey: `${SEED_KEY}-visitor-${jobIndex}-${index}`,
      ipAddress: `10.0.${jobIndex}.${index + 1}`,
      userAgent: 'SeedHomeTestAgent/1.0',
      viewedAt: addDays(job.createdAt, index + 1),
    })),
  );

  await prisma.jobView.createMany({
    data: jobViews,
  });

  console.log(`Home seed complete: ${companies.length} companies, ${jobs.length} jobs, ${applications.length} applications.`);
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
