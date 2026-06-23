import {
  ActorType,
  ApplicationStatus,
  CompanyStatus,
  CompanyType,
  CompanyVerificationStatus,
  CvSource,
  CvStatus,
  FilePurpose,
  FileVisibility,
  InterviewResult,
  InterviewStatus,
  JobStatus,
  Prisma,
  PrismaClient,
  SalaryPeriod,
  SkillPriority,
  WorkingModel,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID, createHash } from 'node:crypto';
import { hash } from 'bcryptjs';
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

const categoryDefinitions = [
  { name: 'Programming Languages', description: 'Ngôn ngữ lập trình' },
  { name: 'Frameworks & Libraries', description: 'Framework và thư viện phần mềm' },
  { name: 'Databases & Storage', description: 'Hệ quản trị cơ sở dữ liệu và lưu trữ' },
  { name: 'Cloud & DevOps', description: 'Điện toán đám mây và công cụ DevOps' },
  { name: 'Design & Product', description: 'Thiết kế giao diện và quản lý sản phẩm' },
  { name: 'Testing & QA', description: 'Đảm bảo chất lượng và kiểm thử phần mềm' },
  { name: 'Data & AI', description: 'Khoa học dữ liệu, học máy và trí tuệ nhân tạo' },
  { name: 'Others', description: 'Các công cụ và kỹ năng bổ trợ khác' },
];

function getCategoryForSkill(name: string, categories: Record<string, { id: string }>) {
  const lowerName = name.toLowerCase();

  // Databases & Storage
  if (
    /postgres|mysql|mongo|redis|prisma|database|db|sql|nosql|oracle|cassandra|mariadb|sqlite|dynamodb/i.test(
      lowerName
    )
  ) {
    return categories['Databases & Storage'].id;
  }

  // Cloud & DevOps
  if (
    /aws|azure|gcp|docker|kubernetes|devops|ci\/cd|jenkins|terraform|ansible|cloud|k8s|argocd/i.test(
      lowerName
    )
  ) {
    return categories['Cloud & DevOps'].id;
  }

  // Artificial Intelligence & Data Science (using word boundaries for short names like ai, ml)
  if (
    /data science|deep learning|machine learning|nlp|spark|hadoop|tableau|power bi|llm|gpt|openai|tensorflow|pytorch|blockchain/i.test(
      lowerName
    ) ||
    /\b(ai|ml)\b/i.test(lowerName)
  ) {
    return categories['Data & AI'].id;
  }

  // Frameworks & Libraries
  if (
    /react|next|vue|angular|nest|django|spring|express|laravel|symfony|asp\.net|\.net|winforms|jquery|flask|fastapi|nuxt|svelte/i.test(
      lowerName
    )
  ) {
    return categories['Frameworks & Libraries'].id;
  }

  // Programming Languages (with word boundaries for short names like go, c, r, js, ts)
  if (
    /typescript|javascript|python|java|c\+\+|ruby|php|c#|kotlin|swift|rust|html|css|golang/i.test(
      lowerName
    ) ||
    /\b(go|c|r|js|ts)\b/i.test(lowerName)
  ) {
    return categories['Programming Languages'].id;
  }

  // Design & Product
  if (
    /figma|sketch|xd|photoshop|illustrator|ui\/ux|design|product management|product owner/i.test(
      lowerName
    )
  ) {
    return categories['Design & Product'].id;
  }

  // Testing & QA
  if (/qa|test|jest|cypress|selenium|manual|automation|junit|mocha/i.test(lowerName)) {
    return categories['Testing & QA'].id;
  }

  return categories['Others'].id;
}

async function cleanHomeSeedData() {
  // Clean up content module seed data
  await prisma.postTag.deleteMany({
    where: {
      post: {
        slug: {
          startsWith: SEED_KEY,
        },
      },
    },
  });

  await prisma.post.deleteMany({
    where: {
      slug: {
        startsWith: SEED_KEY,
      },
    },
  });

  await prisma.postCategory.deleteMany({
    where: {
      slug: {
        startsWith: SEED_KEY,
      },
    },
  });

  await prisma.tag.deleteMany({
    where: {
      slug: {
        startsWith: SEED_KEY,
      },
    },
  });

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
      OR: [
        {
          slug: {
            startsWith: SEED_KEY,
          },
        },
        {
          createdByRecruiterId: {
            in: recruiterIds,
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  const jobIds = jobPosts.map((job) => job.id);

  if (jobIds.length > 0) {
    await prisma.jobBoostMetric.deleteMany({
      where: {
        jobPostId: {
          in: jobIds,
        },
      },
    });

    await prisma.jobBoost.deleteMany({
      where: {
        jobPostId: {
          in: jobIds,
        },
      },
    });

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
      await prisma.companyReview.deleteMany({
        where: {
          applicationId: {
            in: applicationIds,
          },
        },
      });

      await prisma.interviewLog.deleteMany({
        where: {
          interview: {
            applicationId: {
              in: applicationIds,
            },
          },
        },
      });

      await prisma.interview.deleteMany({
        where: {
          applicationId: {
            in: applicationIds,
          },
        },
      });

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

  await prisma.invoice.deleteMany({
    where: {
      company: {
        taxCode: {
          startsWith: SEED_TAX_CODE_PREFIX,
        },
      },
    },
  });

  await prisma.companySubscription.deleteMany({
    where: {
      company: {
        taxCode: {
          startsWith: SEED_TAX_CODE_PREFIX,
        },
      },
    },
  });

  await prisma.subscriptionPlan.deleteMany({
    where: {
      createdByAdmin: {
        email: 'admin@upnext.dev',
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
  await cleanImportedData();

  const passwordHash = await hash('Password123!', 12);

  const adminRole = await prisma.adminRole.upsert({
    where: { roleName: 'Platform Admin' },
    update: {},
    create: {
      roleName: 'Platform Admin',
      description: 'Default administrator role for local development.',
    },
  });

  const adminUser = await prisma.adminUser.upsert({
    where: { email: 'admin@upnext.dev' },
    update: {},
    create: {
      email: 'admin@upnext.dev',
      fullName: 'UpNext Admin',
      passwordHash,
      roleId: adminRole.id,
    },
  });

  const plans = {
    basic: await prisma.subscriptionPlan.create({
      data: {
        subscriptionName: 'Basic Trial',
        price: new Prisma.Decimal(0),
        description: 'Gói dùng thử miễn phí dành cho nhà tuyển dụng mới.',
        durationDays: 14,
        boostCreditLimit: 0,
        jobPostLimit: 3,
        status: 'ACTIVE',
        createdByAdminId: adminUser.id,
      },
    }),
    standard: await prisma.subscriptionPlan.create({
      data: {
        subscriptionName: 'Standard Plan',
        price: new Prisma.Decimal(490000),
        description: 'Gói tiêu chuẩn phù hợp cho doanh nghiệp vừa và nhỏ.',
        durationDays: 30,
        boostCreditLimit: 3,
        jobPostLimit: 10,
        status: 'ACTIVE',
        createdByAdminId: adminUser.id,
      },
    }),
    premium: await prisma.subscriptionPlan.create({
      data: {
        subscriptionName: 'Premium Plan',
        price: new Prisma.Decimal(1490000),
        description: 'Gói nâng cao không giới hạn cho các tập đoàn lớn.',
        durationDays: 30,
        boostCreditLimit: 10,
        jobPostLimit: 30,
        status: 'ACTIVE',
        createdByAdminId: adminUser.id,
      },
    }),
    customInactive: await prisma.subscriptionPlan.create({
      data: {
        subscriptionName: 'Legacy Plan',
        price: new Prisma.Decimal(99000),
        description: 'Gói dịch vụ cũ đã ngưng cung cấp.',
        durationDays: 7,
        boostCreditLimit: 0,
        jobPostLimit: 1,
        status: 'INACTIVE',
        createdByAdminId: adminUser.id,
      },
    }),
  };

  const permissionsList = [
    {
      code: 'jobs:manage',
      module: 'jobs',
      action: 'manage',
      description: 'Manage job posts',
    },
    {
      code: 'applications:manage',
      module: 'applications',
      action: 'manage',
      description: 'Manage applications and candidate pipeline',
    },
    {
      code: 'applications:review_assigned',
      module: 'applications',
      action: 'review_assigned',
      description: 'Review assigned candidate applications',
    },
    {
      code: 'interviews:manage',
      module: 'interviews',
      action: 'manage',
      description: 'Manage interviews',
    },
    {
      code: 'interviews:review_assigned',
      module: 'interviews',
      action: 'review_assigned',
      description: 'Review assigned interviews',
    },
    {
      code: 'company:manage',
      module: 'company',
      action: 'manage',
      description: 'Manage company profile and settings',
    },
    {
      code: 'members:manage',
      module: 'members',
      action: 'manage',
      description: 'Manage company members and roles',
    },
    {
      code: 'billing:manage',
      module: 'billing',
      action: 'manage',
      description: 'Manage subscription and resources',
    },
  ];

  // Clean up obsolete permissions that are no longer part of permissionsList
  const currentPermissionCodes = permissionsList.map(p => p.code);
  await prisma.recruiterPermission.deleteMany({
    where: {
      code: {
        notIn: currentPermissionCodes,
      },
    },
  });

  // Clean up deprecated HR_MANAGER role if it exists
  const hrManagerRole = await prisma.recruiterRole.findUnique({
    where: { code: 'HR_MANAGER' },
  });

  if (hrManagerRole) {
    let adminRoleRecord = await prisma.recruiterRole.findUnique({
      where: { code: 'ADMIN' },
    });
    if (!adminRoleRecord) {
      adminRoleRecord = await prisma.recruiterRole.create({
        data: {
          code: 'ADMIN',
          name: 'Admin',
          description: 'Manage recruiting operations',
        },
      });
    }

    await prisma.recruiterAccount.updateMany({
      where: { recruiterRoleId: hrManagerRole.id },
      data: { recruiterRoleId: adminRoleRecord.id },
    });

    await prisma.companyMember.updateMany({
      where: { roleId: hrManagerRole.id },
      data: { roleId: adminRoleRecord.id },
    });

    await prisma.recruiterRole.delete({
      where: { id: hrManagerRole.id },
    });
  }

  // Also clean up any other roles that are not part of OWNER, ADMIN, RECRUITER, INTERVIEWER
  const validRoleCodes = ['OWNER', 'ADMIN', 'RECRUITER', 'INTERVIEWER'];
  const invalidRoles = await prisma.recruiterRole.findMany({
    where: {
      code: {
        notIn: validRoleCodes,
      },
    },
  });

  for (const role of invalidRoles) {
    const ownerRole = await prisma.recruiterRole.findUnique({ where: { code: 'OWNER' } });
    const fallbackRoleId = ownerRole?.id;
    if (fallbackRoleId) {
      await prisma.recruiterAccount.updateMany({
        where: { recruiterRoleId: role.id },
        data: { recruiterRoleId: fallbackRoleId },
      });
      await prisma.companyMember.updateMany({
        where: { roleId: role.id },
        data: { roleId: fallbackRoleId },
      });
    }
    await prisma.recruiterRole.delete({ where: { id: role.id } });
  }

  const seededPermissions: Record<string, string> = {};
  for (const perm of permissionsList) {
    const record = await prisma.recruiterPermission.upsert({
      where: { code: perm.code },
      update: {
        module: perm.module,
        action: perm.action,
        description: perm.description,
      },
      create: perm,
    });
    seededPermissions[perm.code] = record.id;
  }

  const rolesDefinitions = [
    {
      code: 'OWNER',
      name: 'Owner',
      description: 'Full company workspace access',
      permissionCodes: permissionsList.map((p) => p.code),
    },
    {
      code: 'ADMIN',
      name: 'Admin',
      description: 'Manage recruiting operations',
      permissionCodes: [
        'jobs:manage',
        'applications:manage',
        'applications:review_assigned',
        'interviews:manage',
        'interviews:review_assigned',
        'company:manage',
      ],
    },
    {
      code: 'RECRUITER',
      name: 'Recruiter',
      description: 'Manage jobs, candidates, and interviews',
      permissionCodes: [
        'jobs:manage',
        'applications:manage',
        'applications:review_assigned',
        'interviews:manage',
        'interviews:review_assigned',
      ],
    },
    {
      code: 'INTERVIEWER',
      name: 'Interviewer',
      description: 'Review assigned interviews and candidates',
      permissionCodes: ['applications:review_assigned', 'interviews:review_assigned'],
    },
  ];

  const seededRoles: Record<string, any> = {};
  for (const roleDef of rolesDefinitions) {
    const role = await prisma.recruiterRole.upsert({
      where: { code: roleDef.code },
      update: {
        name: roleDef.name,
        description: roleDef.description,
      },
      create: {
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
      },
    });
    seededRoles[roleDef.code] = role;

    await prisma.recruiterRolePermission.deleteMany({
      where: { recruiterRoleId: role.id },
    });

    await prisma.recruiterRolePermission.createMany({
      data: roleDef.permissionCodes.map((code) => ({
        recruiterRoleId: role.id,
        recruiterPermissionId: seededPermissions[code],
      })),
    });
  }

  const recruiterRole = seededRoles['OWNER'];

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
    contract: await prisma.employmentType.upsert({
      where: { name: 'Contract / Freelance' },
      update: {},
      create: { name: 'Contract / Freelance' },
    }),
    internship: await prisma.employmentType.upsert({
      where: { name: 'Internship' },
      update: {},
      create: { name: 'Internship' },
    }),
  };

  const experienceLevels = {
    intern: await prisma.experienceLevel.upsert({
      where: { code: 'intern' },
      update: { name: 'Intern' },
      create: { code: 'intern', name: 'Intern' },
    }),
    fresher: await prisma.experienceLevel.upsert({
      where: { code: 'fresher' },
      update: { name: 'Fresher' },
      create: { code: 'fresher', name: 'Fresher' },
    }),
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
    lead: await prisma.experienceLevel.upsert({
      where: { code: 'lead' },
      update: { name: 'Lead / Principal' },
      create: { code: 'lead', name: 'Lead / Principal' },
    }),
    manager: await prisma.experienceLevel.upsert({
      where: { code: 'manager' },
      update: { name: 'Manager / Director' },
      create: { code: 'manager', name: 'Manager / Director' },
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

  // Seed SkillCategories
  const categories: Record<string, { id: string; name: string }> = {};
  for (const catDef of categoryDefinitions) {
    categories[catDef.name] = await prisma.skillCategory.upsert({
      where: { name: catDef.name },
      update: { description: catDef.description },
      create: { name: catDef.name, description: catDef.description },
    });
  }

  const skills = Object.fromEntries(
    await Promise.all(
      ['TypeScript', 'NestJS', 'Prisma', 'React', 'AWS', 'AI', 'QA', 'Figma'].map(async (name) => {
        const categoryId = getCategoryForSkill(name, categories);
        const skill = await prisma.skill.upsert({
          where: { name },
          update: { categoryId },
          create: { name, categoryId },
        });

        return [name, skill] as const;
      }),
    ),
  );

  const masterSpecializations = [
    { name: 'Backend', slug: 'backend' },
    { name: 'Data', slug: 'data' },
    { name: 'Business Analysis', slug: 'business-analysis' },
    { name: 'AI', slug: 'ai' },
    { name: 'Cloud', slug: 'cloud' },
    { name: 'Frontend', slug: 'frontend' },
    { name: 'Product', slug: 'product' },
    { name: 'DevOps', slug: 'devops' },
    { name: 'Project Management', slug: 'project-management' },
    { name: 'QA', slug: 'qa' },
    { name: 'Fullstack', slug: 'fullstack' },
    { name: 'Mobile', slug: 'mobile' },
    { name: 'Security', slug: 'security' },
    { name: 'Embedded', slug: 'embedded' },
  ];

  const specializations = Object.fromEntries(
    await Promise.all(
      masterSpecializations.map(async (specDef) => {
        const spec = await prisma.specialization.upsert({
          where: { slug: specDef.slug },
          update: { name: specDef.name },
          create: { name: specDef.name, slug: specDef.slug },
        });
        return [specDef.slug, spec] as const;
      })
    )
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
    const businessLicenseFileId = definition.key !== 'beta' ? randomUUID() : null;

    return {
      ...definition,
      id: companyId,
      logoFileId,
      coverFileId,
      businessLicenseFileId,
      taxCode: `${SEED_TAX_CODE_PREFIX}${definition.key.toUpperCase()}`,
      email: `${definition.key}@seed-home-test.upnext.dev`,
      website: `https://${definition.key}.seed-home-test.upnext.dev`,
    };
  });

  const fileAssetsData = companies.flatMap((company) => {
    const assets: Prisma.FileAssetCreateManyInput[] = [
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
    ];

    if (company.businessLicenseFileId) {
      assets.push({
        id: company.businessLicenseFileId,
        ownerType: 'company',
        ownerId: company.id,
        purpose: FilePurpose.BUSINESS_LICENSE,
        visibility: FileVisibility.PRIVATE,
        storageKey: `${SEED_STORAGE_PREFIX}companies/${company.key}/business_license.pdf`,
        originalName: `${company.key}-business-license.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(1024 * 150),
        publicUrl: `https://cdn.seed-home-test.local/${company.key}/business_license.pdf`,
      });
    }

    return assets;
  });

  await prisma.fileAsset.createMany({
    data: fileAssetsData,
  });

  await prisma.company.createMany({
    data: companies.map((company, index) => {
      let verificationStatus: CompanyVerificationStatus = CompanyVerificationStatus.VERIFIED;
      let reputationScore: Prisma.Decimal = new Prisma.Decimal(95.00);
      let lockedReason: string | null = null;

      if (company.key === 'beta') {
        verificationStatus = CompanyVerificationStatus.UNVERIFIED;
        reputationScore = new Prisma.Decimal(15.00);
      } else if (company.key === 'gamma') {
        verificationStatus = CompanyVerificationStatus.PENDING;
        reputationScore = new Prisma.Decimal(35.00);
      } else if (company.key === 'delta') {
        verificationStatus = CompanyVerificationStatus.REJECTED;
        reputationScore = new Prisma.Decimal(10.00);
        lockedReason = 'Giấy phép đăng ký kinh doanh không hợp lệ hoặc đã quá hạn hiệu lực.';
      }

      return {
        id: company.id,
        logoFileId: company.logoFileId,
        businessLicenseFileId: company.businessLicenseFileId,
        type: company.type,
        name: company.name,
        taxCode: company.taxCode,
        address: `${company.city}, Vietnam`,
        email: company.email,
        phone: `09000000${index + 1}`,
        website: company.website,
        description: company.description,
        companySize: company.companySize,
        verificationStatus,
        reputationScore,
        lockedReason,
        status: CompanyStatus.ACTIVE,
        createdAt: addDays(lastMonthStart, index),
        updatedAt: addDays(lastMonthStart, index),
      };
    }),
  });

  await prisma.companyReputationActivity.createMany({
    data: [
      // Alpha - 95.00
      {
        companyId: companies[0].id,
        actionType: 'PROFILE_COMPLETED',
        score: new Prisma.Decimal(15.00),
        reason: 'Hoàn thiện đầy đủ thông tin hồ sơ doanh nghiệp',
        byAdminId: null,
      },
      {
        companyId: companies[0].id,
        actionType: 'BUSINESS_LICENSE_VERIFIED',
        score: new Prisma.Decimal(50.00),
        reason: 'Giấy phép đăng ký kinh doanh được phê duyệt',
        byAdminId: adminUser.id,
      },
      {
        companyId: companies[0].id,
        actionType: 'POSITIVE_REVIEW_RECEIVED',
        score: new Prisma.Decimal(30.00),
        reason: 'Nhận đánh giá tích cực từ ứng viên đã tham gia phỏng vấn',
        byAdminId: null,
      },
      
      // Beta - 15.00
      {
        companyId: companies[1].id,
        actionType: 'PROFILE_COMPLETED',
        score: new Prisma.Decimal(15.00),
        reason: 'Hoàn thiện đầy đủ thông tin hồ sơ doanh nghiệp',
        byAdminId: null,
      },

      // Gamma - 35.00
      {
        companyId: companies[2].id,
        actionType: 'PROFILE_COMPLETED',
        score: new Prisma.Decimal(15.00),
        reason: 'Hoàn thiện đầy đủ thông tin hồ sơ doanh nghiệp',
        byAdminId: null,
      },
      {
        companyId: companies[2].id,
        actionType: 'EMAIL_VERIFIED',
        score: new Prisma.Decimal(20.00),
        reason: 'Xác thực tên miền email doanh nghiệp thành công',
        byAdminId: null,
      },

      // Delta - 10.00
      {
        companyId: companies[3].id,
        actionType: 'PROFILE_COMPLETED',
        score: new Prisma.Decimal(15.00),
        reason: 'Hoàn thiện đầy đủ thông tin hồ sơ doanh nghiệp',
        byAdminId: null,
      },
      {
        companyId: companies[3].id,
        actionType: 'REJECTED_VERIFICATION',
        score: new Prisma.Decimal(-5.00),
        reason: 'Yêu cầu xác thực doanh nghiệp bị từ chối do hồ sơ không khớp',
        byAdminId: adminUser.id,
      },
    ],
  });

  const recruiterDefinitions = [
    {
      companyIndex: 0,
      roleCode: 'OWNER',
      email: `${SEED_EMAIL_PREFIX}recruiter.alpha.owner@upnext.dev`,
      fullName: `Alpha Owner`,
    },
    {
      companyIndex: 0,
      roleCode: 'ADMIN',
      email: `${SEED_EMAIL_PREFIX}recruiter.alpha.admin@upnext.dev`,
      fullName: `Alpha Admin`,
    },
    {
      companyIndex: 0,
      roleCode: 'RECRUITER',
      email: `${SEED_EMAIL_PREFIX}recruiter.alpha.recruiter@upnext.dev`,
      fullName: `Alpha Recruiter`,
    },
    {
      companyIndex: 0,
      roleCode: 'INTERVIEWER',
      email: `${SEED_EMAIL_PREFIX}recruiter.alpha.interviewer@upnext.dev`,
      fullName: `Alpha Interviewer`,
    },
    {
      companyIndex: 1,
      roleCode: 'OWNER',
      email: `${SEED_EMAIL_PREFIX}recruiter.beta@upnext.dev`,
      fullName: `Beta Owner`,
    },
    {
      companyIndex: 2,
      roleCode: 'OWNER',
      email: `${SEED_EMAIL_PREFIX}recruiter.gamma@upnext.dev`,
      fullName: `Gamma Owner`,
    },
    {
      companyIndex: 3,
      roleCode: 'OWNER',
      email: `${SEED_EMAIL_PREFIX}recruiter.delta@upnext.dev`,
      fullName: `Delta Owner`,
    },
  ];

  const recruiters = recruiterDefinitions.map((def) => {
    const company = companies[def.companyIndex];
    return {
      id: randomUUID(),
      profileId: randomUUID(),
      companyId: company.id,
      email: def.email,
      fullName: def.fullName,
      roleCode: def.roleCode,
      createdAt: addDays(lastMonthStart, 1),
    };
  });

  await prisma.recruiterAccount.createMany({
    data: recruiters.map((recruiter) => ({
      id: recruiter.id,
      companyId: recruiter.companyId,
      recruiterRoleId: seededRoles[recruiter.roleCode].id,
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
      roleId: seededRoles[recruiter.roleCode].id,
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
    data: candidates.map((candidate) => {
      const idx = candidate.index;
      let roleDesc = "Software Engineer";
      if (idx === 0 || idx === 11) roleDesc = "Intern Backend Developer eager to learn Node.js and Databases";
      else if (idx === 1 || idx === 10) roleDesc = "Fresher Frontend Developer skilled in React and UI/UX design";
      else if (idx === 2 || idx === 7) roleDesc = "Junior Fullstack Developer with hands-on experience in TypeScript and React";
      else if (idx === 3 || idx === 8) roleDesc = "Mid-level DevOps Engineer experienced in AWS, Docker, and CI/CD";
      else if (idx === 4 || idx === 9) roleDesc = "Senior AI & Data Engineer specializing in LLMs, Machine Learning, and Python";
      else if (idx === 5) roleDesc = "Technical Lead with strong leadership skills and cloud infrastructure design experience";
      else if (idx === 6) roleDesc = "Engineering Manager with 8+ years of experience leading agile product engineering teams";

      return {
        id: candidate.profileId,
        candidateAccountId: candidate.accountId,
        address: 'Ho Chi Minh City, Vietnam',
        description: `Seeded Profile: ${roleDesc}`,
        createdAt: candidate.createdAt,
        updatedAt: candidate.createdAt,
      };
    }),
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

  await prisma.candidateJobPreference.createMany({
    data: candidates.map((candidate) => {
      let desiredLevelId: string | null = null;
      let desiredPosition = 'Software Engineer';
      let minSalary = 10000000;
      let maxSalary = 20000000;
      let workingModel: WorkingModel = WorkingModel.HYBRID;

      const idx = candidate.index;
      if (idx === 0 || idx === 11) {
        desiredLevelId = experienceLevels.intern.id;
        desiredPosition = 'Intern Backend Engineer';
        minSalary = 3000000;
        maxSalary = 6000000;
        workingModel = WorkingModel.ONSITE;
      } else if (idx === 1 || idx === 10) {
        desiredLevelId = experienceLevels.fresher.id;
        desiredPosition = 'Fresher Frontend Developer';
        minSalary = 8000000;
        maxSalary = 12000000;
        workingModel = WorkingModel.ONSITE;
      } else if (idx === 2 || idx === 7) {
        desiredLevelId = experienceLevels.junior.id;
        desiredPosition = 'Junior Fullstack Developer';
        minSalary = 12000000;
        maxSalary = 18000000;
        workingModel = WorkingModel.HYBRID;
      } else if (idx === 3 || idx === 8) {
        desiredLevelId = experienceLevels.mid.id;
        desiredPosition = 'Mid-level DevOps Engineer';
        minSalary = 20000000;
        maxSalary = 32000000;
        workingModel = WorkingModel.REMOTE;
      } else if (idx === 4 || idx === 9) {
        desiredLevelId = experienceLevels.senior.id;
        desiredPosition = 'Senior AI & Data Engineer';
        minSalary = 35000000;
        maxSalary = 55000000;
        workingModel = WorkingModel.HYBRID;
      } else if (idx === 5) {
        desiredLevelId = experienceLevels.lead.id;
        desiredPosition = 'Technical Lead (Java/AWS)';
        minSalary = 45000000;
        maxSalary = 70000000;
        workingModel = WorkingModel.REMOTE;
      } else if (idx === 6) {
        desiredLevelId = experienceLevels.manager.id;
        desiredPosition = 'Engineering Manager';
        minSalary = 60000000;
        maxSalary = 90000000;
        workingModel = WorkingModel.HYBRID;
      }

      return {
        id: randomUUID(),
        candidateProfileId: candidate.profileId,
        desiredPosition,
        desiredSalaryMin: new Prisma.Decimal(minSalary),
        desiredSalaryMax: new Prisma.Decimal(maxSalary),
        salaryCurrency: 'VND',
        workingModel,
        desiredLevelId,
        noticePeriodDays: 30,
        isRelocate: idx % 3 === 0,
        createdAt: candidate.createdAt,
        updatedAt: candidate.createdAt,
      };
    }),
  });

  const educationsToCreate: any[] = [];
  const experiencesToCreate: any[] = [];
  const skillsToCreate: any[] = [];
  const experienceSkillsToCreate: any[] = [];
  const projectsToCreate: any[] = [];
  const certificationsToCreate: any[] = [];
  const languagesToCreate: any[] = [];
  const linksToCreate: any[] = [];

  candidates.forEach((candidate) => {
    const idx = candidate.index;
    const profileId = candidate.profileId;
    const baseDate = candidate.createdAt;

    // 1. Languages
    languagesToCreate.push({
      id: randomUUID(),
      candidateProfileId: profileId,
      language: 'Vietnamese',
      proficiency: 'Native',
      createdAt: baseDate,
      updatedAt: baseDate,
    });

    if (idx !== 7 && idx !== 11) {
      languagesToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        language: 'English',
        proficiency: idx === 5 || idx === 6 ? 'Fluent' : idx === 4 || idx === 9 ? 'IELTS 7.5' : 'Intermediate',
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }
    if (idx === 3 || idx === 8) {
      languagesToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        language: 'Japanese',
        proficiency: 'N3',
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }

    // 2. Links
    linksToCreate.push({
      id: randomUUID(),
      candidateProfileId: profileId,
      type: 'LinkedIn',
      url: `https://linkedin.com/in/seed-candidate-${idx + 1}`,
      createdAt: baseDate,
      updatedAt: baseDate,
    });
    if (idx !== 6) {
      linksToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        type: 'GitHub',
        url: `https://github.com/seed-candidate-${idx + 1}`,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }
    if (idx === 1 || idx === 10) {
      linksToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        type: 'Portfolio',
        url: `https://portfolio.seed-candidate-${idx + 1}.dev`,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }

    // 3. Education
    if (idx === 0 || idx === 11) {
      educationsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        schoolName: 'University of Science',
        degree: 'Bachelor of IT',
        major: 'Software Engineering',
        startDate: addDays(baseDate, -365),
        endDate: null,
        isCurrent: true,
        gpa: new Prisma.Decimal(3.20),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else if (idx === 1 || idx === 10) {
      educationsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        schoolName: 'HCMC University of Technology',
        degree: 'Bachelor of Computer Science',
        major: 'Computer Science',
        startDate: addDays(baseDate, -1460),
        endDate: addDays(baseDate, -30),
        isCurrent: false,
        gpa: new Prisma.Decimal(3.40),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else {
      educationsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        schoolName: idx % 2 === 0 ? 'FPT University' : 'Hanoi University of Science and Technology',
        degree: 'Bachelor of Software Engineering',
        major: 'Software Engineering',
        startDate: addDays(baseDate, -1825),
        endDate: addDays(baseDate, -365),
        isCurrent: false,
        gpa: new Prisma.Decimal(3.10),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
      if (idx === 4 || idx === 9) {
        educationsToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          schoolName: 'VNU University of Engineering and Technology',
          degree: 'Master of Science',
          major: 'Data Science & Artificial Intelligence',
          startDate: addDays(baseDate, -360),
          endDate: baseDate,
          isCurrent: false,
          gpa: new Prisma.Decimal(3.75),
          sortOrder: 1,
          createdAt: baseDate,
          updatedAt: baseDate,
        });
      }
    }

    // 4. Skills & Experiences & Projects
    const candidateSkills: string[] = [];
    if (idx === 0 || idx === 11) {
      candidateSkills.push('TypeScript', 'NestJS');
    } else if (idx === 1 || idx === 10) {
      candidateSkills.push('React', 'TypeScript', 'Figma');
    } else if (idx === 2 || idx === 7) {
      candidateSkills.push('TypeScript', 'React', 'Prisma');
    } else if (idx === 3 || idx === 8) {
      candidateSkills.push('AWS', 'QA', 'TypeScript');
    } else if (idx === 4 || idx === 9) {
      candidateSkills.push('AI', 'AWS', 'TypeScript');
    } else {
      candidateSkills.push('TypeScript', 'React', 'NestJS', 'AWS', 'Prisma', 'QA');
    }

    candidateSkills.forEach((skillName, sIdx) => {
      const skillRecord = skills[skillName as keyof typeof skills];
      if (skillRecord) {
        skillsToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          skillId: skillRecord.id,
          proficiencyLevel: idx >= 5 ? 'EXPERT' : idx >= 4 ? 'ADVANCED' : 'INTERMEDIATE',
          yearsOfExperience: new Prisma.Decimal(idx === 0 || idx === 11 ? 0.5 : idx === 1 || idx === 10 ? 1 : idx * 1.5),
          sortOrder: sIdx,
          createdAt: baseDate,
          updatedAt: baseDate,
        });
      }
    });

    if (idx !== 0 && idx !== 1 && idx !== 10 && idx !== 11) {
      const expId = randomUUID();
      const companyName = idx === 6 ? 'Axon Active' : idx === 5 ? 'VNG Corporation' : idx === 4 || idx === 9 ? 'VinAI' : 'ABC Tech';
      const positionTitle = idx === 6 ? 'Engineering Manager' : idx === 5 ? 'Technical Lead' : idx === 4 || idx === 9 ? 'Senior AI Engineer' : 'Junior Developer';
      
      experiencesToCreate.push({
        id: expId,
        candidateProfileId: profileId,
        companyName,
        positionTitle,
        employmentType: 'Full-time',
        startDate: addDays(baseDate, -365 * 2),
        endDate: null,
        isCurrent: true,
        description: `Working as a ${positionTitle} contributing to core services, managing sprint deliverables, and optimizing backend databases.`,
        technologies: candidateSkills.join(', '),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });

      candidateSkills.forEach((skillName) => {
        const skillRecord = skills[skillName as keyof typeof skills];
        if (skillRecord) {
          experienceSkillsToCreate.push({
            id: randomUUID(),
            candidateExperienceId: expId,
            skillId: skillRecord.id,
          });
        }
      });

      if (idx >= 5) {
        const oldExpId = randomUUID();
        const oldCompanyName = idx === 6 ? 'KMS Technology' : 'Viettel Group';
        const oldPositionTitle = idx === 6 ? 'Technical Lead' : 'Senior Software Engineer';
        experiencesToCreate.push({
          id: oldExpId,
          candidateProfileId: profileId,
          companyName: oldCompanyName,
          positionTitle: oldPositionTitle,
          employmentType: 'Full-time',
          startDate: addDays(baseDate, -365 * 5),
          endDate: addDays(baseDate, -365 * 2 - 10),
          isCurrent: false,
          description: `Designed microservices architectures, mentored junior developers, and streamlined CI/CD pipelines.`,
          technologies: 'TypeScript, React, AWS, Docker',
          sortOrder: 1,
          createdAt: baseDate,
          updatedAt: baseDate,
        });

        ['TypeScript', 'React', 'AWS'].forEach((skillName) => {
          const skillRecord = skills[skillName as keyof typeof skills];
          if (skillRecord) {
            experienceSkillsToCreate.push({
              id: randomUUID(),
              candidateExperienceId: oldExpId,
              skillId: skillRecord.id,
            });
          }
        });
      }
    }

    // 5. Projects
    if (idx === 0 || idx === 11) {
      projectsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: 'Task Manager API',
        role: 'Solo Developer',
        description: 'A RESTful API built to manage daily tasks, supporting CRUD operations and JWT authentication.',
        projectUrl: 'https://github.com/seed/task-manager-api',
        technologies: 'Node.js, Express, MongoDB',
        deployUrl: null,
        startDate: addDays(baseDate, -60),
        endDate: addDays(baseDate, -30),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else if (idx === 1 || idx === 10) {
      projectsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: 'Personal Portfolio Website',
        role: 'UI Designer & Developer',
        description: 'A modern, responsive portfolio website featuring glassmorphism design and smooth page transitions.',
        projectUrl: 'https://github.com/seed/portfolio',
        technologies: 'React, TailwindCSS, Framer Motion',
        deployUrl: 'https://myportfolio.dev',
        startDate: addDays(baseDate, -45),
        endDate: addDays(baseDate, -15),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else {
      projectsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: 'E-commerce Platform Microservices',
        role: 'Core Backend Engineer',
        description: 'Developed the checkout and inventory service handling 10k concurrent users during flash sales.',
        projectUrl: 'https://github.com/seed/ecommerce-microservices',
        technologies: 'NestJS, TypeScript, Docker, Kafka',
        deployUrl: null,
        startDate: addDays(baseDate, -180),
        endDate: addDays(baseDate, -90),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }

    // 6. Certifications
    if (idx === 3 || idx === 8) {
      certificationsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: 'AWS Certified Solutions Architect - Associate',
        organization: 'Amazon Web Services (AWS)',
        issuedDate: addDays(baseDate, -180),
        expiredDate: addDays(baseDate, 365 * 2.5),
        credentialUrl: 'https://aws.amazon.com/verification',
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else if (idx === 4 || idx === 9) {
      certificationsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: 'TensorFlow Developer Certificate',
        organization: 'Google',
        issuedDate: addDays(baseDate, -300),
        expiredDate: addDays(baseDate, 365 * 2),
        credentialUrl: 'https://google.com/verify-tf',
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else if (idx === 5) {
      certificationsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: 'AWS Certified Solutions Architect - Professional',
        organization: 'Amazon Web Services (AWS)',
        issuedDate: addDays(baseDate, -500),
        expiredDate: addDays(baseDate, 500),
        credentialUrl: 'https://aws.amazon.com/verification-pro',
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else if (idx === 6) {
      certificationsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: 'Certified ScrumMaster (CSM)',
        organization: 'Scrum Alliance',
        issuedDate: addDays(baseDate, -400),
        expiredDate: addDays(baseDate, 365 * 2),
        credentialUrl: 'https://scrumalliance.org/cert',
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }
  });

  if (languagesToCreate.length > 0) {
    await prisma.candidateLanguage.createMany({ data: languagesToCreate });
  }
  if (linksToCreate.length > 0) {
    await prisma.candidateLink.createMany({ data: linksToCreate });
  }
  if (educationsToCreate.length > 0) {
    await prisma.candidateEducation.createMany({ data: educationsToCreate });
  }
  if (skillsToCreate.length > 0) {
    await prisma.candidateSkill.createMany({ data: skillsToCreate });
  }
  if (experiencesToCreate.length > 0) {
    await prisma.candidateExperience.createMany({ data: experiencesToCreate });
  }
  if (experienceSkillsToCreate.length > 0) {
    await prisma.candidateExperienceSkill.createMany({ data: experienceSkillsToCreate });
  }
  if (projectsToCreate.length > 0) {
    await prisma.candidateProject.createMany({ data: projectsToCreate });
  }
  if (certificationsToCreate.length > 0) {
    await prisma.candidateCertification.createMany({ data: certificationsToCreate });
  }

  const companyByKey = Object.fromEntries(companies.map((company) => [company.key, company]));
  const recruiterByCompanyId = Object.fromEntries(
    recruiters
      .filter((r) => r.roleCode === 'OWNER')
      .map((recruiter) => [recruiter.companyId, recruiter])
  );

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
      specializations: ['backend', 'cloud'],
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
      specializations: ['data', 'backend'],
    },
    {
      title: 'Cloud QA Specialist',
      companyKey: 'alpha',
      employmentTypeKey: 'contract',
      experienceLevelKey: 'mid',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.REMOTE,
      city: 'Ho Chi Minh City',
      district: 'Phu Nhuan',
      salaryMin: 15000000,
      salaryMax: 22000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 8),
      applications: [3],
      skills: ['QA', 'AWS'],
      specializations: ['qa', 'cloud'],
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
      specializations: ['backend'],
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
      specializations: ['frontend'],
    },
    {
      title: 'Fresher Product Designer',
      companyKey: 'beta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'fresher',
      jobCategoryKey: 'design',
      workMode: WorkingModel.REMOTE,
      city: 'Da Nang',
      district: 'Thanh Khe',
      salaryMin: 12000000,
      salaryMax: 16000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 14),
      applications: [2, 7],
      skills: ['Figma', 'React'],
      specializations: ['product'],
    },
    {
      title: 'Lead DevOps Engineer',
      companyKey: 'beta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'lead',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.ONSITE,
      city: 'Da Nang',
      district: 'Son Tra',
      salaryMin: 45000000,
      salaryMax: 65000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 16),
      applications: [8, 9],
      skills: ['AWS', 'TypeScript'],
      specializations: ['devops', 'cloud'],
    },
    {
      title: 'Fresher Growth Engineer',
      companyKey: 'beta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'fresher',
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
      specializations: ['fullstack'],
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
      specializations: ['ai', 'data'],
    },
    {
      title: 'Mobile Engineer',
      companyKey: 'gamma',
      employmentTypeKey: 'partTime',
      experienceLevelKey: 'junior',
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
      specializations: ['mobile'],
    },
    {
      title: 'Support Analyst Intern',
      companyKey: 'gamma',
      employmentTypeKey: 'internship',
      experienceLevelKey: 'intern',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.ONSITE,
      city: 'Ha Noi',
      district: 'Ba Dinh',
      salaryMin: 3000000,
      salaryMax: 5000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 22),
      applications: [10],
      skills: ['QA'],
      specializations: ['qa'],
    },
    {
      title: 'UX Researcher',
      companyKey: 'gamma',
      employmentTypeKey: 'contract',
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
      specializations: ['product'],
    },
    {
      title: 'Security Engineering Manager',
      companyKey: 'delta',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'manager',
      jobCategoryKey: 'security',
      workMode: WorkingModel.REMOTE,
      city: 'Can Tho',
      district: 'Ninh Kieu',
      salaryMin: 55000000,
      salaryMax: 80000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 24),
      applications: [9, 10, 11],
      skills: ['AWS', 'TypeScript'],
      specializations: ['security', 'cloud'],
    },
    {
      title: 'Technical Writer Intern',
      companyKey: 'delta',
      employmentTypeKey: 'internship',
      experienceLevelKey: 'intern',
      jobCategoryKey: 'operations',
      workMode: WorkingModel.HYBRID,
      city: 'Can Tho',
      district: 'Binh Thuy',
      salaryMin: 4000000,
      salaryMax: 6000000,
      salaryIsNegotiable: false,
      createdAt: addDays(lastMonthStart, 26),
      applications: [],
      skills: ['QA'],
      specializations: ['qa'],
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
      specializations: ['product'],
    },
    {
      title: 'Platform Reliability Engineer',
      companyKey: 'alpha',
      employmentTypeKey: 'fullTime',
      experienceLevelKey: 'senior',
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
      specializations: ['devops', 'cloud', 'backend'],
    },
  ] as const;

  const jobs = jobDefinitions.map((definition) => {
    const company = companyByKey[definition.companyKey];
    const recruiter = recruiterByCompanyId[company.id];
    
    const employmentType = employmentTypes[definition.employmentTypeKey as keyof typeof employmentTypes];
    if (!employmentType) {
      throw new Error(`Employment type key "${definition.employmentTypeKey}" not found in seeded employmentTypes.`);
    }
    
    const experienceLevel = experienceLevels[definition.experienceLevelKey as keyof typeof experienceLevels];
    if (!experienceLevel) {
      throw new Error(`Experience level key "${definition.experienceLevelKey}" not found in seeded experienceLevels.`);
    }

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

  await prisma.jobPostSpecialization.createMany({
    data: jobs.flatMap((job) =>
      job.specializations
        .filter((slug) => slug in specializations)
        .map((slug) => ({
          jobPostId: job.id,
          specializationId: specializations[slug as keyof typeof specializations].id,
          isRequired: true,
        })),
    ),
  });

  const statusDistribution = [
    ApplicationStatus.SUBMITTED,    // 0
    ApplicationStatus.VIEWED,       // 1
    ApplicationStatus.SHORTLISTED,  // 2
    ApplicationStatus.INTERVIEWING, // 3
    ApplicationStatus.OFFERED,      // 4
    ApplicationStatus.HIRED,        // 5
    ApplicationStatus.REJECTED,     // 6
    ApplicationStatus.WITHDRAWN,    // 7
    ApplicationStatus.SUBMITTED,    // 8
    ApplicationStatus.VIEWED,       // 9
    ApplicationStatus.SHORTLISTED,  // 10
    ApplicationStatus.INTERVIEWING, // 11
    ApplicationStatus.SUBMITTED,    // 12
    ApplicationStatus.VIEWED,       // 13
    ApplicationStatus.SHORTLISTED,  // 14
    ApplicationStatus.INTERVIEWING, // 15
    ApplicationStatus.SUBMITTED,    // 16
    ApplicationStatus.VIEWED,       // 17
    ApplicationStatus.SHORTLISTED,  // 18
    ApplicationStatus.INTERVIEWING, // 19
    ApplicationStatus.SUBMITTED,    // 20
    ApplicationStatus.VIEWED,       // 21
    ApplicationStatus.OFFERED,      // 22
    ApplicationStatus.HIRED,        // 23
    ApplicationStatus.SUBMITTED,    // 24
    ApplicationStatus.SUBMITTED,    // 25
    ApplicationStatus.SUBMITTED,    // 26
  ];

  const applications = jobs.flatMap((job) =>
    job.applications.map((candidateIndex, index) => {
      const candidate = candidates[candidateIndex];

      return {
        id: randomUUID(),
        jobPostId: job.id,
        candidateProfileId: candidate.profileId,
        candidateAccountId: candidate.accountId,
        recruiterAccountId: job.recruiterId,
        cvVersionId: candidate.cvVersionId,
        coverLetter: `${candidate.fullName} applied for ${job.title}`,
        submittedAt: addDays(job.createdAt, index + 1),
        createdAt: addDays(job.createdAt, index + 1),
      };
    }),
  );

  if (applications.length > 0) {
    await prisma.application.createMany({
      data: applications.map((application, idx) => ({
        id: application.id,
        jobPostId: application.jobPostId,
        candidateProfileId: application.candidateProfileId,
        cvVersionId: application.cvVersionId,
        coverLetter: application.coverLetter,
        status: statusDistribution[idx] ?? ApplicationStatus.SUBMITTED,
        submittedAt: application.submittedAt,
        createdAt: application.createdAt,
        updatedAt: application.createdAt,
      })),
    });

    const statusLogsData: any[] = [];
    applications.forEach((app, idx) => {
      const targetStatus = statusDistribution[idx] ?? ApplicationStatus.SUBMITTED;
      const baseTime = app.submittedAt;
      const candidateAccountId = app.candidateAccountId;
      const recruiterAccountId = app.recruiterAccountId;

      const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 60 * 60 * 1000);

      // 1. Initial submission log
      statusLogsData.push({
        id: randomUUID(),
        applicationId: app.id,
        actorType: ActorType.CANDIDATE,
        actorId: candidateAccountId,
        oldStatus: null,
        newStatus: ApplicationStatus.SUBMITTED,
        note: 'Candidate submitted application',
        changedAt: baseTime,
      });

      if (targetStatus === ApplicationStatus.SUBMITTED) return;

      // 2. Viewed log
      if (targetStatus !== ApplicationStatus.WITHDRAWN) {
        statusLogsData.push({
          id: randomUUID(),
          applicationId: app.id,
          actorType: ActorType.RECRUITER,
          actorId: recruiterAccountId,
          oldStatus: ApplicationStatus.SUBMITTED,
          newStatus: ApplicationStatus.VIEWED,
          note: 'Recruiter viewed application details',
          changedAt: addHours(baseTime, 2),
        });
      }

      if (targetStatus === ApplicationStatus.VIEWED) return;

      // 3. Withdrawn log
      if (targetStatus === ApplicationStatus.WITHDRAWN) {
        statusLogsData.push({
          id: randomUUID(),
          applicationId: app.id,
          actorType: ActorType.CANDIDATE,
          actorId: candidateAccountId,
          oldStatus: ApplicationStatus.SUBMITTED,
          newStatus: ApplicationStatus.WITHDRAWN,
          reason: 'Found another job opportunity',
          note: 'Candidate withdrew application',
          changedAt: addDays(baseTime, 1),
        });
        return;
      }

      // 4. Shortlisted log
      statusLogsData.push({
        id: randomUUID(),
        applicationId: app.id,
        actorType: ActorType.RECRUITER,
        actorId: recruiterAccountId,
        oldStatus: ApplicationStatus.VIEWED,
        newStatus: ApplicationStatus.SHORTLISTED,
        note: 'Candidate added to shortlist',
        changedAt: addDays(baseTime, 1),
      });

      if (targetStatus === ApplicationStatus.SHORTLISTED) return;

      // 5. Rejected log
      if (targetStatus === ApplicationStatus.REJECTED) {
        statusLogsData.push({
          id: randomUUID(),
          applicationId: app.id,
          actorType: ActorType.RECRUITER,
          actorId: recruiterAccountId,
          oldStatus: ApplicationStatus.SHORTLISTED,
          newStatus: ApplicationStatus.REJECTED,
          reason: 'Qualifications do not match position requirements',
          note: 'Application rejected by recruiter',
          changedAt: addDays(baseTime, 2),
        });
        return;
      }

      // 6. Interviewing log
      statusLogsData.push({
        id: randomUUID(),
        applicationId: app.id,
        actorType: ActorType.RECRUITER,
        actorId: recruiterAccountId,
        oldStatus: ApplicationStatus.SHORTLISTED,
        newStatus: ApplicationStatus.INTERVIEWING,
        note: 'Interview round scheduled with recruiter',
        changedAt: addDays(baseTime, 2),
      });

      if (targetStatus === ApplicationStatus.INTERVIEWING) return;

      // 7. Offered log
      statusLogsData.push({
        id: randomUUID(),
        applicationId: app.id,
        actorType: ActorType.RECRUITER,
        actorId: recruiterAccountId,
        oldStatus: ApplicationStatus.INTERVIEWING,
        newStatus: ApplicationStatus.OFFERED,
        note: 'Salary & benefits offer sent to candidate',
        changedAt: addDays(baseTime, 5),
      });

      if (targetStatus === ApplicationStatus.OFFERED) return;

      // 8. Hired log
      statusLogsData.push({
        id: randomUUID(),
        applicationId: app.id,
        actorType: ActorType.RECRUITER,
        actorId: recruiterAccountId,
        oldStatus: ApplicationStatus.OFFERED,
        newStatus: ApplicationStatus.HIRED,
        note: 'Candidate accepted offer. Hiring processed.',
        changedAt: addDays(baseTime, 7),
      });
    });

    if (statusLogsData.length > 0) {
      await prisma.applicationStatusLog.createMany({
        data: statusLogsData,
      });
    }

    // Lọc các hồ sơ đủ điều kiện phỏng vấn (SHORTLISTED, INTERVIEWING, OFFERED)
    const allowedStatuses: ApplicationStatus[] = [
      ApplicationStatus.SHORTLISTED,
      ApplicationStatus.INTERVIEWING,
      ApplicationStatus.OFFERED,
    ];
    const interviewableApps = applications.filter((app, idx) => {
      const status = statusDistribution[idx] ?? ApplicationStatus.SUBMITTED;
      return allowedStatuses.includes(status);
    });

    const interviewsData: any[] = [];
    const interviewLogsData: any[] = [];

    const interviewScenarios = [
      // App 0 (SHORTLISTED)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PASSED, daysOffset: -3 },
      { round: 2, type: 'ONSITE' as const, status: InterviewStatus.SCHEDULED, result: InterviewResult.PENDING, daysOffset: 2 }, // Upcoming
      // App 1 (INTERVIEWING)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PENDING, daysOffset: -1 }, // Needs Review (past, pending result)
      // App 2 (OFFERED)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PASSED, daysOffset: -5 },
      { round: 2, type: 'ONSITE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PASSED, daysOffset: -2 },
      // App 3 (SHORTLISTED)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.CANCELLED, result: InterviewResult.PENDING, daysOffset: -4 },
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.SCHEDULED, result: InterviewResult.PENDING, daysOffset: 3 }, // Rescheduled / New scheduled
      // App 4 (INTERVIEWING)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PASSED, daysOffset: -6 },
      { round: 2, type: 'ONLINE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PENDING, daysOffset: -0.1 }, // Needs Review (today)
      // App 5 (SHORTLISTED)
      { round: 1, type: 'ONSITE' as const, status: InterviewStatus.NO_SHOW, result: InterviewResult.PENDING, daysOffset: -1 },
      // App 6 (INTERVIEWING)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.SCHEDULED, result: InterviewResult.PENDING, daysOffset: 1 }, // Upcoming
      // App 7 (SHORTLISTED)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.SCHEDULED, result: InterviewResult.PENDING, daysOffset: 4 }, // Upcoming
      // App 8 (INTERVIEWING)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PASSED, daysOffset: -5 },
      { round: 2, type: 'ONSITE' as const, status: InterviewStatus.SCHEDULED, result: InterviewResult.PENDING, daysOffset: 3 }, // Upcoming
      // App 9 (OFFERED)
      { round: 1, type: 'ONLINE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PASSED, daysOffset: -8 },
      { round: 2, type: 'ONSITE' as const, status: InterviewStatus.COMPLETED, result: InterviewResult.PASSED, daysOffset: -5 },
    ];

    let scenarioIdx = 0;
    for (let i = 0; i < interviewableApps.length; i++) {
      const app = interviewableApps[i];
      const recruiter = recruiters.find((r) => r.id === app.recruiterAccountId);
      if (!recruiter) continue;
      const recruiterProfileId = recruiter.profileId;

      const appScenarios: typeof interviewScenarios = [];
      if (scenarioIdx < interviewScenarios.length) {
        appScenarios.push(interviewScenarios[scenarioIdx++]);
      }
      // Gán thêm vòng 2 cho một số app để đạt đủ số lượng
      if ([0, 2, 3, 4, 8, 9].includes(i) && scenarioIdx < interviewScenarios.length) {
        appScenarios.push(interviewScenarios[scenarioIdx++]);
      }

      for (const sc of appScenarios) {
        const interviewId = randomUUID();
        const baseDate = new Date(now.getTime() + sc.daysOffset * 24 * 60 * 60 * 1000);
        const startAt = new Date(baseDate.setHours(10, 0, 0, 0));
        const endAt = new Date(baseDate.setHours(11, 0, 0, 0));

        interviewsData.push({
          id: interviewId,
          recruiterProfileId: recruiterProfileId,
          applicationId: app.id,
          interviewRound: sc.round,
          type: sc.type,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
          meetingUrl: sc.type === 'ONLINE' ? 'https://zoom.us/j/upnext-mock-meeting' : null,
          location: sc.type === 'ONSITE' ? 'UpNext Office, Landmark 81' : null,
          status: sc.status,
          result: sc.result,
          recruiterNote: `Seeded note for Round ${sc.round} interview.`,
          rescheduleCount: 0,
        });

        // Sinh logs tương ứng
        // Log 1: Khởi tạo SCHEDULED
        interviewLogsData.push({
          id: randomUUID(),
          interviewId: interviewId,
          oldStatus: null,
          newStatus: InterviewStatus.SCHEDULED,
          actorType: ActorType.RECRUITER,
          actorId: app.recruiterAccountId,
          note: 'Recruiter scheduled the interview',
          createdAt: new Date(startAt.getTime() - 2 * 24 * 60 * 60 * 1000), // Lên lịch trước đó 2 ngày
        });

        // Log 2: Nếu trạng thái kết thúc không phải là SCHEDULED
        if (sc.status !== InterviewStatus.SCHEDULED) {
          interviewLogsData.push({
            id: randomUUID(),
            interviewId: interviewId,
            oldStatus: InterviewStatus.SCHEDULED,
            newStatus: sc.status,
            actorType: ActorType.RECRUITER,
            actorId: app.recruiterAccountId,
            note: `Interview status changed to ${sc.status}`,
            createdAt: endAt,
          });
        }
      }
    }

    if (interviewsData.length > 0) {
      await prisma.interview.createMany({ data: interviewsData });
    }
    if (interviewLogsData.length > 0) {
      await prisma.interviewLog.createMany({ data: interviewLogsData });
    }
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

  const alphaCompany = companies[0];
  const betaCompany = companies[1];
  const gammaCompany = companies[2];
  const deltaCompany = companies[3];

  // Seed CompanyReview to match the reputation activity log and cover diverse business scenarios
  const hiredAlphaApp = applications.find(
    (app, idx) =>
      statusDistribution[idx] === ApplicationStatus.HIRED &&
      jobs.find((j) => j.id === app.jobPostId)?.companyId === alphaCompany.id
  );

  if (hiredAlphaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        applicationId: hiredAlphaApp.id,
        companyId: alphaCompany.id,
        overallRating: 5,
        summary: 'Môi trường làm việc tuyệt vời, quy trình tuyển dụng chuyên nghiệp và nhanh chóng.',
        overtimeSatisfaction: 5,
        overtimeReason: 'OT có đầy đủ lương thưởng và được tự nguyện.',
        whatILove: 'Đồng nghiệp thân thiện, sếp tâm lý, nhiều hoạt động team building.',
        improvementSuggestion: 'Nên mở rộng thêm văn phòng làm việc.',
        salaryBenefitsRating: 5,
        trainingLearningRating: 5,
        managementCareRating: 5,
        cultureFunRating: 5,
        officeWorkspaceRating: 5,
        status: 'APPROVED',
        createdAt: addDays(hiredAlphaApp.submittedAt, 8),
        updatedAt: addDays(hiredAlphaApp.submittedAt, 8),
      },
    });
  }

  // 2. Pending Review for Beta
  const pendingBetaApp = applications.find(
    (app, idx) =>
      statusDistribution[idx] === ApplicationStatus.SHORTLISTED &&
      jobs.find((j) => j.id === app.jobPostId)?.companyId === betaCompany.id
  );
  if (pendingBetaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        applicationId: pendingBetaApp.id,
        companyId: betaCompany.id,
        overallRating: 4,
        summary: 'Quy trình tuyển dụng chuyên nghiệp, bài test lập trình thực tế.',
        overtimeSatisfaction: 4,
        overtimeReason: 'OT không nhiều, có quy trình đăng ký rõ ràng.',
        whatILove: 'Công nghệ mới, quy trình bài bản, dự án quy mô lớn.',
        improvementSuggestion: 'Cần phản hồi kết quả nhanh hơn cho ứng viên.',
        salaryBenefitsRating: 4,
        trainingLearningRating: 4,
        managementCareRating: 4,
        cultureFunRating: 5,
        officeWorkspaceRating: 4,
        status: 'PENDING',
        createdAt: addDays(pendingBetaApp.submittedAt, 5),
        updatedAt: addDays(pendingBetaApp.submittedAt, 5),
      },
    });
  }

  // 3. Approved Review for Gamma (Average)
  const approvedGammaApp = applications.find(
    (app, idx) =>
      statusDistribution[idx] === ApplicationStatus.INTERVIEWING &&
      jobs.find((j) => j.id === app.jobPostId)?.companyId === gammaCompany.id
  );
  if (approvedGammaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        applicationId: approvedGammaApp.id,
        companyId: gammaCompany.id,
        overallRating: 3,
        summary: 'Môi trường làm việc bình thường, văn phòng đẹp nhưng quy trình rườm rà.',
        overtimeSatisfaction: 3,
        overtimeReason: 'Thỉnh thoảng có OT đột xuất vào cuối tuần.',
        whatILove: 'Không gian làm việc sáng tạo, đồ uống miễn phí.',
        improvementSuggestion: 'Nên tinh giản bớt các bước phỏng vấn và thủ tục.',
        salaryBenefitsRating: 3,
        trainingLearningRating: 3,
        managementCareRating: 3,
        cultureFunRating: 4,
        officeWorkspaceRating: 5,
        status: 'APPROVED',
        createdAt: addDays(approvedGammaApp.submittedAt, 7),
        updatedAt: addDays(approvedGammaApp.submittedAt, 7),
      },
    });
  }

  // 4. Approved Review for Delta (Low Rating)
  const hiredDeltaApp = applications.find(
    (app, idx) =>
      statusDistribution[idx] === ApplicationStatus.HIRED &&
      jobs.find((j) => j.id === app.jobPostId)?.companyId === deltaCompany.id
  );
  if (hiredDeltaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        applicationId: hiredDeltaApp.id,
        companyId: deltaCompany.id,
        overallRating: 2,
        summary: 'Văn phòng nhỏ, OT nhiều nhưng không có chế độ đãi ngộ xứng đáng.',
        overtimeSatisfaction: 1,
        overtimeReason: 'Thường xuyên bắt OT ngoài giờ mà không có phụ cấp rõ ràng.',
        whatILove: 'Đồng nghiệp cùng team rất đoàn kết và hỗ trợ lẫn nhau.',
        improvementSuggestion: 'Ban giám đốc cần xem lại chính sách OT và phúc lợi cho nhân viên.',
        salaryBenefitsRating: 2,
        trainingLearningRating: 2,
        managementCareRating: 1,
        cultureFunRating: 2,
        officeWorkspaceRating: 2,
        status: 'APPROVED',
        createdAt: addDays(hiredDeltaApp.submittedAt, 10),
        updatedAt: addDays(hiredDeltaApp.submittedAt, 10),
      },
    });
  }

  // 5. Rejected Review for Delta (Spam / Guideline Violation)
  const submittedDeltaApp = applications.find(
    (app, idx) =>
      statusDistribution[idx] === ApplicationStatus.SUBMITTED &&
      jobs.find((j) => j.id === app.jobPostId)?.companyId === deltaCompany.id
  );
  if (submittedDeltaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        applicationId: submittedDeltaApp.id,
        companyId: deltaCompany.id,
        overallRating: 1,
        summary: 'CÔNG TY TỆ HẠI!!! TRÁNH XA NGAY LẬP TỨC!!!',
        overtimeSatisfaction: 1,
        overtimeReason: 'Lừa đảo ứng viên, bóc lột sức lao động dã man.',
        whatILove: 'Không có điểm gì để thích.',
        improvementSuggestion: 'Đóng cửa công ty đi.',
        salaryBenefitsRating: 1,
        trainingLearningRating: 1,
        managementCareRating: 1,
        cultureFunRating: 1,
        officeWorkspaceRating: 1,
        status: 'REJECTED',
        createdAt: addDays(submittedDeltaApp.submittedAt, 4),
        updatedAt: addDays(submittedDeltaApp.submittedAt, 4),
      },
    });
  }

  // 6. Hidden Review for Alpha
  const rejectedAlphaApp = applications.find(
    (app, idx) =>
      statusDistribution[idx] === ApplicationStatus.REJECTED &&
      jobs.find((j) => j.id === app.jobPostId)?.companyId === alphaCompany.id
  );
  if (rejectedAlphaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        applicationId: rejectedAlphaApp.id,
        companyId: alphaCompany.id,
        overallRating: 3,
        summary: 'Quy trình nhanh gọn nhưng kết quả phản hồi không chi tiết.',
        overtimeSatisfaction: 3,
        overtimeReason: 'Không rõ vì chưa vào làm.',
        whatILove: 'Thời gian phản hồi phỏng vấn nhanh.',
        improvementSuggestion: 'Nên gửi feedback chi tiết hơn cho ứng viên bị loại.',
        salaryBenefitsRating: 3,
        trainingLearningRating: 3,
        managementCareRating: 3,
        cultureFunRating: 3,
        officeWorkspaceRating: 4,
        status: 'HIDDEN',
        createdAt: addDays(rejectedAlphaApp.submittedAt, 6),
        updatedAt: addDays(rejectedAlphaApp.submittedAt, 6),
      },
    });
  }

  // --- Công ty Alpha ---
  const alphaActiveSub = await prisma.companySubscription.create({
    data: {
      planId: plans.premium.id,
      companyId: alphaCompany.id,
      jobPostLimit: plans.premium.jobPostLimit,
      jobPostUsed: 5,
      boostCreditTotal: plans.premium.boostCreditLimit,
      boostCreditUsed: 2,
      startedAt: addDays(now, -15),
      expiredAt: addDays(now, 15),
      status: 'ACTIVE',
    },
  });
  await prisma.invoice.create({
    data: {
      subscriptionPlanId: plans.premium.id,
      companyId: alphaCompany.id,
      invoiceCode: 'INV-ALPHA-PREMIUM',
      amount: plans.premium.price,
      paymentMethod: 'STRIPE',
      paymentStatus: 'PAID',
      paidAt: addDays(now, -15),
    },
  });

  await prisma.companySubscription.create({
    data: {
      planId: plans.standard.id,
      companyId: alphaCompany.id,
      jobPostLimit: plans.standard.jobPostLimit,
      jobPostUsed: 3,
      boostCreditTotal: plans.standard.boostCreditLimit,
      boostCreditUsed: 3,
      startedAt: addDays(now, -45),
      expiredAt: addDays(now, -15),
      status: 'INACTIVE',
    },
  });
  await prisma.invoice.create({
    data: {
      subscriptionPlanId: plans.standard.id,
      companyId: alphaCompany.id,
      invoiceCode: 'INV-ALPHA-STANDARD-HIST',
      amount: plans.standard.price,
      paymentMethod: 'STRIPE',
      paymentStatus: 'PAID',
      paidAt: addDays(now, -45),
    },
  });

  // Seed JobBoosts for Alpha to match its boostCreditUsed = 2
  const alphaJobs = jobs.filter((j) => j.companyId === alphaCompany.id);
  if (alphaJobs.length >= 2) {
    const boost1Id = randomUUID();
    const boost2Id = randomUUID();

    // Boost 1: Job 0 (Backend Platform Engineer), ENDED, cost 1 credit
    await prisma.jobBoost.create({
      data: {
        id: boost1Id,
        createdByRecruiterId: alphaJobs[0].recruiterId,
        companySubscriptionId: alphaActiveSub.id,
        jobPostId: alphaJobs[0].id,
        companyId: alphaCompany.id,
        status: 'ENDED',
        creditCost: 1,
        startsAt: addDays(now, -10),
        endsAt: addDays(now, -3),
        createdAt: addDays(now, -11),
        updatedAt: addDays(now, -3),
      },
    });

    // Boost 2: Job 1 (Data Engineer), ACTIVE, cost 1 credit
    await prisma.jobBoost.create({
      data: {
        id: boost2Id,
        createdByRecruiterId: alphaJobs[1].recruiterId,
        companySubscriptionId: alphaActiveSub.id,
        jobPostId: alphaJobs[1].id,
        companyId: alphaCompany.id,
        status: 'ACTIVE',
        creditCost: 1,
        startsAt: addDays(now, -5),
        endsAt: addDays(now, 5),
        createdAt: addDays(now, -6),
        updatedAt: addDays(now, -5),
      },
    });

    // Seed Metrics for Boost 1 (from 10 days ago to 3 days ago - 8 days of data)
    const metricsBoost1 = Array.from({ length: 8 }, (_, idx) => {
      const date = addDays(now, -10 + idx);
      return {
        id: randomUUID(),
        jobBoostId: boost1Id,
        jobPostId: alphaJobs[0].id,
        impressions: 120 + idx * 15 + Math.floor(Math.random() * 20),
        clicks: 15 + idx * 2 + Math.floor(Math.random() * 5),
        applicationsCount: idx % 2 === 0 ? 1 : 0,
        savedCount: idx % 3 === 0 ? 2 : 1,
        date,
      };
    });

    // Seed Metrics for Boost 2 (from 5 days ago to today - 6 days of data)
    const metricsBoost2 = Array.from({ length: 6 }, (_, idx) => {
      const date = addDays(now, -5 + idx);
      return {
        id: randomUUID(),
        jobBoostId: boost2Id,
        jobPostId: alphaJobs[1].id,
        impressions: 200 + idx * 25 + Math.floor(Math.random() * 30),
        clicks: 30 + idx * 4 + Math.floor(Math.random() * 10),
        applicationsCount: idx % 2 === 0 ? 2 : 0,
        savedCount: idx % 2 === 0 ? 3 : 1,
        date,
      };
    });

    await prisma.jobBoostMetric.createMany({
      data: [...metricsBoost1, ...metricsBoost2],
    });
  }

  // --- Công ty Beta ---
  await prisma.companySubscription.create({
    data: {
      planId: plans.standard.id,
      companyId: betaCompany.id,
      jobPostLimit: plans.standard.jobPostLimit,
      jobPostUsed: 4,
      boostCreditTotal: plans.standard.boostCreditLimit,
      boostCreditUsed: 1,
      startedAt: addDays(now, -10),
      expiredAt: addDays(now, 20),
      status: 'ACTIVE',
    },
  });
  await prisma.invoice.create({
    data: {
      subscriptionPlanId: plans.standard.id,
      companyId: betaCompany.id,
      invoiceCode: 'INV-BETA-STANDARD',
      amount: plans.standard.price,
      paymentMethod: 'MOMO',
      paymentStatus: 'PAID',
      paidAt: addDays(now, -10),
    },
  });
  await prisma.invoice.create({
    data: {
      subscriptionPlanId: plans.premium.id,
      companyId: betaCompany.id,
      invoiceCode: 'INV-BETA-PENDING-PREMIUM',
      amount: plans.premium.price,
      paymentStatus: 'PENDING',
    },
  });

  // --- Công ty Gamma ---
  await prisma.companySubscription.create({
    data: {
      planId: plans.basic.id,
      companyId: gammaCompany.id,
      jobPostLimit: plans.basic.jobPostLimit,
      jobPostUsed: 3,
      boostCreditTotal: plans.basic.boostCreditLimit,
      boostCreditUsed: 0,
      startedAt: addDays(now, -30),
      expiredAt: addDays(now, -16),
      status: 'EXPIRED',
    },
  });
  await prisma.invoice.create({
    data: {
      subscriptionPlanId: plans.basic.id,
      companyId: gammaCompany.id,
      invoiceCode: 'INV-GAMMA-BASIC-EXP',
      amount: plans.basic.price,
      paymentMethod: 'SEPAY',
      paymentStatus: 'PAID',
      paidAt: addDays(now, -30),
    },
  });

  // --- Công ty Delta ---
  await prisma.companySubscription.create({
    data: {
      planId: plans.basic.id,
      companyId: deltaCompany.id,
      jobPostLimit: plans.basic.jobPostLimit,
      jobPostUsed: 3,
      boostCreditTotal: plans.basic.boostCreditLimit,
      boostCreditUsed: 0,
      startedAt: addDays(now, -5),
      expiredAt: addDays(now, 9),
      status: 'ACTIVE',
    },
  });
  await prisma.invoice.create({
    data: {
      subscriptionPlanId: plans.basic.id,
      companyId: deltaCompany.id,
      invoiceCode: 'INV-DELTA-BASIC',
      amount: plans.basic.price,
      paymentMethod: 'SEPAY',
      paymentStatus: 'PAID',
      paidAt: addDays(now, -5),
    },
  });
  await prisma.invoice.create({
    data: {
      subscriptionPlanId: plans.standard.id,
      companyId: deltaCompany.id,
      invoiceCode: 'INV-DELTA-FAILED-STANDARD',
      amount: plans.standard.price,
      paymentMethod: 'MOMO',
      paymentStatus: 'FAILED',
    },
  });
  // --- Seed Blog/Content data ---
  const careerCategory = await prisma.postCategory.create({
    data: {
      name: 'Career Advice',
      slug: `${SEED_KEY}-career-advice`,
    },
  });

  const hiringCategory = await prisma.postCategory.create({
    data: {
      name: 'Hiring & Recruitment',
      slug: `${SEED_KEY}-hiring-recruitment`,
    },
  });

  const techCategory = await prisma.postCategory.create({
    data: {
      name: 'Tech Trends',
      slug: `${SEED_KEY}-tech-trends`,
    },
  });

  const cvTag = await prisma.tag.create({
    data: {
      name: 'CV Writing',
      slug: `${SEED_KEY}-cv-writing`,
    },
  });

  const interviewTag = await prisma.tag.create({
    data: {
      name: 'Interview Tips',
      slug: `${SEED_KEY}-interview-tips`,
    },
  });

  const salaryTag = await prisma.tag.create({
    data: {
      name: 'Salary Negotiation',
      slug: `${SEED_KEY}-salary-negotiation`,
    },
  });

  const aiTag = await prisma.tag.create({
    data: {
      name: 'AI & Technology',
      slug: `${SEED_KEY}-ai-technology`,
    },
  });

  const brandingTag = await prisma.tag.create({
    data: {
      name: 'Employer Branding',
      slug: `${SEED_KEY}-employer-branding`,
    },
  });

  // Create Posts
  const post1 = await prisma.post.create({
    data: {
      title: 'Top 5 CV Writing Tips for IT Candidates',
      slug: `${SEED_KEY}-top-5-cv-writing-tips`,
      content: '<p>Writing a great CV is the first step in landing your dream tech job. Focus on impact, highlight your tech stack, and keep it concise.</p>',
      status: 'PUBLISHED',
      type: 'BLOG',
      categoryId: careerCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Top 5 CV Writing Tips for IT Candidates | UpNext',
      metaDescription: 'Learn how to write a standout resume for software engineering roles with our top 5 CV writing tips.',
      metaKeywords: 'cv writing, resume tips, software engineer resume, it resume',
    },
  });

  const post2 = await prisma.post.create({
    data: {
      title: 'How AI is Revolutionizing Developer Hiring',
      slug: `${SEED_KEY}-how-ai-revolutionizing-hiring`,
      content: '<p>AI matching and mock interviews are transforming the recruitment pipeline, enabling companies to identify top technical talent more efficiently.</p>',
      status: 'PUBLISHED',
      type: 'NEWS',
      categoryId: hiringCategory.id,
      adminId: adminUser.id,
      metaTitle: 'How AI is Revolutionizing Developer Hiring | UpNext News',
      metaDescription: 'Discover the latest trends in tech recruitment and how AI is helping recruiters find top developer talent.',
      metaKeywords: 'ai recruiting, developer hiring, recruitment automation',
    },
  });

  const post3 = await prisma.post.create({
    data: {
      title: 'Salary Negotiation: A Guide for Developers',
      slug: `${SEED_KEY}-salary-negotiation-guide`,
      content: '<p>Negotiating your salary can be daunting. Research market rates, highlight your unique skills, and be ready to discuss total compensation packages.</p>',
      status: 'PUBLISHED',
      type: 'BLOG',
      categoryId: careerCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Salary Negotiation Guide for Software Developers | UpNext',
      metaDescription: 'A step-by-step guide to help software developers negotiate salary, benefits, and equity packages.',
      metaKeywords: 'salary negotiation, developer salary, compensation package',
    },
  });

  const post4 = await prisma.post.create({
    data: {
      title: 'Why NestJS is the Best Node.js Framework in 2026',
      slug: `${SEED_KEY}-why-nestjs-best-framework`,
      content: '<p>NestJS provides an out-of-the-box architecture that makes building scalable, maintainable, and enterprise-grade backend systems a breeze.</p>',
      status: 'PUBLISHED',
      type: 'BLOG',
      categoryId: techCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Why NestJS is the Best Node.js Framework | UpNext',
      metaDescription: 'Explore the key features of NestJS that make it the industry standard for backend development.',
      metaKeywords: 'nestjs, nodejs, backend framework, web architecture',
    },
  });

  // Link Posts to Tags (PostTag)
  await prisma.postTag.createMany({
    data: [
      { postId: post1.id, tagId: cvTag.id },
      { postId: post1.id, tagId: interviewTag.id },
      { postId: post2.id, tagId: aiTag.id },
      { postId: post2.id, tagId: brandingTag.id },
      { postId: post3.id, tagId: salaryTag.id },
      { postId: post3.id, tagId: interviewTag.id },
      { postId: post4.id, tagId: aiTag.id },
    ],
  });

  await importItviecData(passwordHash, recruiterRole as { id: string }, employmentTypes, experienceLevels, categories, specializations);
  console.log(`Home seed complete: ${companies.length} companies, ${jobs.length} jobs, ${applications.length} applications.`);
}

async function cleanImportedData() {
  console.log('Cleaning up previously imported ITviec seed data...');

  await prisma.company.deleteMany({
    where: {
      taxCode: {
        startsWith: 'IMPORT_',
      },
    },
  });

  await prisma.recruiterAccount.deleteMany({
    where: {
      email: {
        endsWith: '@imported.upnext.dev',
      },
    },
  });

  await prisma.jobLocation.deleteMany({
    where: {
      address: {
        startsWith: '[IMPORTED_ITVIEC]',
      },
    },
  });

  await prisma.fileAsset.deleteMany({
    where: {
      storageKey: {
        startsWith: 'imported/',
      },
    },
  });

  await prisma.specialization.deleteMany({});
}

async function importItviecData(
  passwordHash: string,
  recruiterRole: { id: string },
  employmentTypes: any,
  experienceLevels: any,
  categories: Record<string, { id: string }>,
  specializations: Record<string, { id: string }>
) {
  console.log('Loading ITviec data files...');
  const jobsPath = path.join(__dirname, 'data/itviec-jobs-backend.json');
  const companiesPath = path.join(__dirname, 'data/companies_detailed.json');

  if (!fs.existsSync(jobsPath) || !fs.existsSync(companiesPath)) {
    console.warn('ITviec data files not found. Skipping import.');
    return;
  }

  const jobsData = JSON.parse(fs.readFileSync(jobsPath, 'utf-8')) as { jobs: any[] };
  const companiesData = JSON.parse(fs.readFileSync(companiesPath, 'utf-8')) as any[];

  console.log(`Loaded ${companiesData.length} companies and ${jobsData.jobs.length} jobs.`);

  const companyTypesBySlug = new Map<string, string>();
  const companySizesBySlug = new Map<string, string>();

  for (const job of jobsData.jobs) {
    if (job.company?.slug) {
      if (job.company.type) companyTypesBySlug.set(job.company.slug as string, job.company.type as string);
      if (job.company.companySize) companySizesBySlug.set(job.company.slug as string, job.company.companySize as string);
    }
  }

  console.log('Importing companies...');
  const companySlugToDetails = new Map<string, { companyId: string; recruiterId: string }>();

  for (const item of companiesData) {
    if (!item.Slug || !item.Name) continue;

    const logoFileId = randomUUID();
    await prisma.fileAsset.create({
      data: {
        id: logoFileId,
        ownerType: 'company',
        purpose: FilePurpose.COMPANY_LOGO,
        visibility: FileVisibility.PUBLIC,
        storageKey: `imported/logos/${item.Slug}`,
        originalName: `${item.Slug}-logo`,
        mimeType: 'image/png',
        sizeBytes: BigInt(0),
        publicUrl: item.Logo || null,
      },
    });

    // Map company type
    let companyType: CompanyType = CompanyType.OTHER;
    const jsonType = companyTypesBySlug.get(item.Slug as string) || (item.Type as string | undefined);
    if (jsonType) {
      const t = jsonType.toUpperCase();
      if (t.includes('PRODUCT')) companyType = CompanyType.PRODUCT;
      else if (t.includes('OUTSOURCING') || t.includes('SERVICE')) companyType = CompanyType.OUTSOURCING;
      else if (t.includes('STARTUP')) companyType = CompanyType.STARTUP;
      else if (t.includes('AGENCY')) companyType = CompanyType.AGENCY;
    }

    let companySize = companySizesBySlug.get(item.Slug as string) || (item['General Information'] as string | undefined) || null;
    if (companySize && companySize.length > 75) {
      companySize = companySize.substring(0, 72) + '...';
    }

    let address = item.Location || null;
    if (address && address.length > 250) {
      address = address.substring(0, 247) + '...';
    }

    const hashSlug = createHash('md5').update(item.Slug as string).digest('hex').substring(0, 30);

    const companyId = randomUUID();
    await prisma.company.create({
      data: {
        id: companyId,
        name: item.Name,
        logoFileId: logoFileId,
        type: companyType,
        taxCode: `IMPORT_${hashSlug.toUpperCase()}`,
        address: address,
        description: item.Description || item['Company Overview'] || null,
        companySize: companySize,
        verificationStatus: CompanyVerificationStatus.VERIFIED,
        status: CompanyStatus.ACTIVE,
      },
    });

    const recruiterId = randomUUID();
    const recruiterProfileId = randomUUID();
    let email = `recruiter.${item.Slug}@imported.upnext.dev`;
    if (item.Slug === 'mb-bank') {
      email = 'recruiter.max@imported.upnext.dev';
    }

    await prisma.recruiterAccount.create({
      data: {
        id: recruiterId,
        companyId: companyId,
        recruiterRoleId: recruiterRole.id,
        email: email,
        passwordHash: passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.recruiterProfile.create({
      data: {
        id: recruiterProfileId,
        recruiterAccountId: recruiterId,
        fullName: `${item.Name} Recruiter`,
        avatarUrl: (item.Logo as string | undefined) || null,
      },
    });

    await prisma.companyMember.create({
      data: {
        recruiterAccountId: recruiterId,
        companyId: companyId,
        roleId: recruiterRole.id,
        status: 'ACTIVE',
      },
    });

    companySlugToDetails.set(item.Slug as string, { companyId, recruiterId });
  }

  console.log(`Successfully imported ${companySlugToDetails.size} companies.`);

  console.log('Importing jobs...');
  let importedJobsCount = 0;
  const futureDeadline = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

  for (const job of jobsData.jobs) {
    if (!job.company?.slug || !job.jobPost?.title) continue;

    const details = companySlugToDetails.get(job.company.slug as string);
    if (!details) continue;

    let jobCategoryId: string | null = null;
    if (job.jobPost.jobCategoryName) {
      const category = await prisma.jobCategory.upsert({
        where: { name: job.jobPost.jobCategoryName },
        update: {},
        create: { name: job.jobPost.jobCategoryName },
      });
      jobCategoryId = category.id;
    }

    let experienceLevelId: string | null = null;
    const lvlCode = job.jobPost.experienceLevelCode;
    if (lvlCode === 'junior') experienceLevelId = experienceLevels.junior.id;
    else if (lvlCode === 'mid') experienceLevelId = experienceLevels.mid.id;
    else if (lvlCode === 'senior') experienceLevelId = experienceLevels.senior.id;
    else if (lvlCode === 'intern') experienceLevelId = experienceLevels.intern.id;
    else if (lvlCode === 'fresher') experienceLevelId = experienceLevels.fresher.id;
    else if (lvlCode === 'lead') experienceLevelId = experienceLevels.lead.id;
    else if (lvlCode === 'manager') experienceLevelId = experienceLevels.manager.id;

    let employmentTypeId = employmentTypes.fullTime.id;
    const empName = job.importHints?.employmentTypeLookup?.name;
    if (empName) {
      const lowerEmpName = empName.toLowerCase();
      if (lowerEmpName.includes('full-time') || lowerEmpName.includes('fulltime')) {
        employmentTypeId = employmentTypes.fullTime.id;
      } else if (lowerEmpName.includes('part-time') || lowerEmpName.includes('parttime')) {
        employmentTypeId = employmentTypes.partTime.id;
      } else if (lowerEmpName.includes('contract') || lowerEmpName.includes('freelance')) {
        employmentTypeId = employmentTypes.contract.id;
      } else if (lowerEmpName.includes('intern') || lowerEmpName.includes('thực tập')) {
        employmentTypeId = employmentTypes.internship.id;
      }
    }

    const urlParts = job.source.url.split('/');
    const jobSlug = urlParts[urlParts.length - 1];

    const jobPostId = randomUUID();
    await prisma.jobPost.create({
      data: {
        id: jobPostId,
        createdByRecruiterId: details.recruiterId,
        companyId: details.companyId,
        jobCategoryId: jobCategoryId,
        experienceLevelId: experienceLevelId,
        employmentTypeId: employmentTypeId,
        title: job.jobPost.title,
        slug: jobSlug,
        description: job.jobPost.description || '',
        requirements: job.jobPost.requirements || null,
        benefits: job.jobPost.benefits || null,
        salaryMin: job.jobPost.salaryMin != null ? job.jobPost.salaryMin : null,
        salaryMax: job.jobPost.salaryMax != null ? job.jobPost.salaryMax : null,
        salaryCurrency: job.jobPost.salaryCurrency || 'VND',
        salaryPeriod: SalaryPeriod.MONTH,
        salaryIsNegotiable: job.jobPost.salaryIsNegotiable || false,
        salaryIsVisible: job.jobPost.salaryIsVisible || true,
        vacanciesCount: job.jobPost.vacanciesCount || 1,
        status: JobStatus.PUBLISHED,
        moderationStatus: 'APPROVED',
        publishedAt: new Date(),
        expiredAt: futureDeadline,
      },
    });

    if (job.locations && Array.isArray(job.locations)) {
      for (const location of job.locations) {
        let workingModel: WorkingModel = WorkingModel.ONSITE;
        if (location.workingModel === 'REMOTE') workingModel = WorkingModel.REMOTE;
        else if (location.workingModel === 'HYBRID') workingModel = WorkingModel.HYBRID;

        const locationId = randomUUID();
        await prisma.jobLocation.create({
          data: {
            id: locationId,
            country: location.country || 'Vietnam',
            workingModel: workingModel,
            city: location.city || null,
            address: `[IMPORTED_ITVIEC] ${location.city || ''}`,
          },
        });

        await prisma.jobPostLocation.create({
          data: {
            jobPostId: jobPostId,
            jobLocationId: locationId,
          },
        });
      }
    }

    if (job.skills && Array.isArray(job.skills)) {
      const addedSkillIds = new Set<string>();
      for (const skillItem of job.skills) {
        if (!skillItem.name) continue;

        const categoryId = getCategoryForSkill(skillItem.name, categories);
        const skill = await prisma.skill.upsert({
          where: { name: skillItem.name },
          update: { categoryId },
          create: { name: skillItem.name, categoryId },
        });

        if (addedSkillIds.has(skill.id)) continue;
        addedSkillIds.add(skill.id);

        await prisma.jobPostSkill.create({
          data: {
            jobPostId: jobPostId,
            skillId: skill.id,
            minYearsExperience: skillItem.minYearsExperience != null ? skillItem.minYearsExperience : null,
            priority: SkillPriority.REQUIRED,
          },
        });
      }
    }

    if (job.specializations && Array.isArray(job.specializations)) {
      const addedSpecializationIds = new Set<string>();
      for (const specItem of job.specializations) {
        if (!specItem.name || !specItem.slug) continue;

        const specialization = await prisma.specialization.upsert({
          where: { slug: specItem.slug },
          update: { name: specItem.name },
          create: { name: specItem.name, slug: specItem.slug },
        });

        specializations[specItem.slug] = specialization;

        if (addedSpecializationIds.has(specialization.id)) continue;
        addedSpecializationIds.add(specialization.id);

        await prisma.jobPostSpecialization.create({
          data: {
            jobPostId: jobPostId,
            specializationId: specialization.id,
            isRequired: specItem.isRequired || false,
          },
        });
      }
    }

    importedJobsCount++;
  }

  console.log(`Successfully imported ${importedJobsCount} jobs.`);
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
