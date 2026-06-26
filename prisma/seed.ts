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

type ImportedItviecSkill = {
  name?: string;
  minYearsExperience?: number | null;
};

type ImportedItviecJob = {
  skills?: ImportedItviecSkill[];
  [key: string]: any;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run Prisma seed.');
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
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

function toAsciiUrl(str: string) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const jobDetailsMap: Record<string, { description: string; requirements: string; benefits: string }> = {
  'Backend Platform Engineer': {
    description: 'We are seeking a Backend Platform Engineer to build and optimize our high-performance core engine services. You will design scale-out APIs, optimize DB queries, and implement asynchronous event workflows.',
    requirements: '- 3+ years experience with Node.js/TypeScript or Java.\n- Strong database knowledge (PostgreSQL, Redis).\n- Experience with microservices architecture and Docker.',
    benefits: '- Competitive salary & performance bonus.\n- Premium health care package.\n- Latest Macbook Pro provided.'
  },
  'Data Engineer': {
    description: 'Join us as a Data Engineer to design, construct, and maintain reliable data pipelines (ETL/ELT). You will help establish our data lakehouse to power analytics and LLM matching engines.',
    requirements: '- 3+ years of experience in data engineering.\n- Proficient in Python, SQL, and big data technologies (Spark/Hadoop).\n- Experience with AWS services (S3, Redshift, Glue).',
    benefits: '- Continuous learning sponsorship.\n- Hybrid working mode.\n- 15 days of annual leave.'
  },
  'Cloud QA Specialist': {
    description: 'We are looking for a QA Specialist with a cloud/infrastructure focus. You will build end-to-end automation test suites, integration tests, and performance load tests on AWS environments.',
    requirements: '- 3+ years in software quality assurance.\n- Strong automation experience with Cypress, Selenium, or Playwright.\n- Solid understanding of CI/CD pipelines & basic cloud networking.',
    benefits: '- Professional certification support (AWS/ISTQB).\n- Remote-friendly environment.\n- Competitive daily/monthly rates.'
  },
  'Integration Engineer': {
    description: 'As an Integration Engineer, you will connect third-party platforms, design sync workflows, and create custom SDKs for our platform partners.',
    requirements: '- 2+ years experience in software development (TypeScript/Node.js).\n- Deep understanding of RESTful APIs, OAuth2, and webhook behaviors.\n- Good communication skills to coordinate with partners.',
    benefits: '- Annual health checks.\n- Dynamic and young team culture.\n- 13th-month salary.'
  },
  'Frontend React Engineer': {
    description: 'We are hiring a Frontend React Engineer to build beautiful, responsive dashboard consoles. You will focus on component reusability, chart rendering, and optimal page load speeds.',
    requirements: '- 3+ years production experience with React and TypeScript.\n- Proficiency in CSS layout systems (Tailwind CSS, CSS modules).\n- Familiarity with modern bundlers like Vite/Webpack.',
    benefits: '- Modern office with snacks & drinks.\n- High-performance laptop of choice.\n- Regular team building activities.'
  },
  'Fresher Product Designer': {
    description: 'Looking for a passionate Fresher Product Designer to collaborate with PMs and engineering to craft outstanding UI designs and candidate experiences.',
    requirements: '- Strong portfolio demonstrating UI design skills (Figma/Sketch).\n- Understanding of user-centered design principles and wireframing.\n- Basic knowledge of frontend limitations and components.',
    benefits: '- Structured mentorship program by senior designers.\n- Fun and creative working space.\n- Performance review every 6 months.'
  },
  'Lead DevOps Engineer': {
    description: 'Lead our infrastructure operations, optimize cloud spend, maintain Kubernetes clusters, and champion security policies across the engineering organization.',
    requirements: '- 6+ years experience in DevOps/SysOps roles.\n- Hands-on expertise in AWS (EKS, VPC, IAM, RDS) and Terraform.\n- Strong leadership and team mentoring experience.',
    benefits: '- Top-tier compensation pack.\n- Flexible working hours.\n- Executive wellness program.'
  },
  'Fresher Growth Engineer': {
    description: 'Join our growth hack team to design A/B testing, user onboarding paths, email trigger funnels, and search engine optimizations.',
    requirements: '- Fresh graduate or <1 year experience in software engineering.\n- Proficient in JavaScript/TypeScript (React/Node).\n- High curiosity, data-driven mind, and growth mindset.',
    benefits: '- Fast track career progression.\n- Mentoring by Chief Product Officer.\n- Monthly team lunches.'
  },
  'AI Engineer': {
    description: 'Design and deploy AI features into our core product. You will tune open-source LLMs, build RAG pipelines for resume matching, and optimize model inference times.',
    requirements: '- 4+ years of experience in ML/AI systems.\n- Expertise in Python, PyTorch/TensorFlow, and Hugging Face ecosystems.\n- Experience with vector databases (Pinecone, PGVector, Qdrant).',
    benefits: '- Tech conference sponsorship.\n- Stock options (ESOP) for key contributors.\n- Highly flexible remote workspace.'
  },
  'Mobile Engineer': {
    description: 'Develop and maintain our cross-platform mobile application (React Native) for job seekers and recruiters on Android and iOS.',
    requirements: '- 2+ years developing mobile apps with React Native.\n- Understanding of native bridge, app store publishing, and push notifications.\n- Good UI sense and smooth animations.',
    benefits: '- Flexible part-time hours.\n- Tech hardware allowance.\n- Performance bonus.'
  },
  'Support Analyst Intern': {
    description: 'Learn tech support operations by assisting customers, triaging bugs, translating system issues into Jira tasks, and verifying fixes.',
    requirements: '- Final year student in IT or related fields.\n- Basic understanding of web applications, APIs, and databases.\n- Good English communication skills.',
    benefits: '- Monthly internship allowance.\n- Clear pathway to full-time junior roles.\n- Training on professional tools (Jira, Postman).'
  },
  'UX Researcher': {
    description: 'Conduct user research, design surveys, perform usability testing sessions, and present actionable insights to product teams.',
    requirements: '- 2+ years of experience in UX Research/Design.\n- Experience with qualitative and quantitative research methods.\n- Excellent empathy, listening, and analytical skills.',
    benefits: '- Competitive contract rates.\n- Remote work options.\n- Multi-national team collaboration.'
  },
  'Security Engineering Manager': {
    description: 'Oversee and lead the security initiatives. You will define security benchmarks, orchestrate pen-testing, audit identity systems, and manage security incidents.',
    requirements: '- 7+ years in cyber security and application security.\n- Certified CISSP, CISM, or equivalent security certifications.\n- Strong manager background with team coordination skills.',
    benefits: '- Premium package with health + wellness insurance.\n- Share options.\n- Annual overseas retreat.'
  },
  'Technical Writer Intern': {
    description: 'Write developer guides, API documentations, user FAQs, and internal architecture documentations.',
    requirements: '- Excellent written English skills.\n- Basic knowledge of HTML, Markdown, and Git.\n- Passion for technical documentation and teaching.',
    benefits: '- Mentorship in technical communication.\n- Flexible hours to match university schedule.\n- Internship certificate.'
  },
  'CRM Specialist': {
    description: 'Configure and optimize our CRM workflows, sales funnels, and marketing emails to engage enterprise clients.',
    requirements: '- 2+ years in CRM management (HubSpot, Salesforce, or Zoho).\n- Solid data analysis skills and experience with SQL queries.\n- Excellent communication and marketing sense.',
    benefits: '- Product sales commissions.\n- Health insurance.\n- Dynamic working team.'
  },
  'Platform Reliability Engineer': {
    description: 'Ensure the reliability and performance of our core platform. You will build observability dashboards, set SLOs/SLIs, and automate recovery procedures.',
    requirements: '- 4+ years in SRE or Backend roles.\n- Proficient in AWS infrastructure, Prometheus, Grafana, and ELK stack.\n- Strong scripting skills (Python, Bash, or Go).',
    benefits: '- On-call compensation allowance.\n- Premium medical coverage.\n- Hybrid work flexibility.'
  }
};

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
  await prisma.adminAuditLog.deleteMany({});
  await prisma.appeal.deleteMany({});
  await prisma.report.deleteMany({});

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
        email: {
          endsWith: '@upnext.dev',
        },
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

  await prisma.adminRolePermission.deleteMany({});
  await prisma.adminUser.deleteMany({
    where: {
      email: {
        endsWith: '@upnext.dev',
      },
    },
  });
  await prisma.adminRole.deleteMany({});
  await prisma.adminPermission.deleteMany({});
}

async function main() {
  await cleanHomeSeedData();
  await cleanImportedData();

  const passwordHash = await hash('Password123!', 12);

  const adminPermissionsDefinitions = [
    // jobs
    { name: 'Moderate Jobs', code: 'jobs:moderate', module: 'jobs', description: 'Duyệt hoặc từ chối tin tuyển dụng.' },
    { name: 'View Jobs', code: 'jobs:view', module: 'jobs', description: 'Xem tất cả tin tuyển dụng.' },
    // companies
    { name: 'Verify Companies', code: 'companies:verify', module: 'companies', description: 'Xác thực giấy phép kinh doanh của doanh nghiệp.' },
    { name: 'Lock Companies', code: 'companies:lock', module: 'companies', description: 'Khóa hoặc mở khóa tài khoản doanh nghiệp.' },
    { name: 'View Companies', code: 'companies:view', module: 'companies', description: 'Xem tất cả thông tin doanh nghiệp.' },
    // users
    { name: 'Moderate Users', code: 'users:moderate', module: 'users', description: 'Khóa hoặc mở khóa tài khoản ứng viên/nhà tuyển dụng.' },
    { name: 'View Users', code: 'users:view', module: 'users', description: 'Xem thông tin chi tiết tài khoản người dùng.' },
    // billing
    { name: 'Manage Plans', code: 'billing:plans', module: 'billing', description: 'Quản lý các gói dịch vụ và giá cả.' },
    { name: 'View Invoices', code: 'billing:invoices', module: 'billing', description: 'Tra cứu và kiểm tra hóa đơn thanh toán.' },
    // moderation
    { name: 'Handle Reports', code: 'reports:handle', module: 'moderation', description: 'Xử lý các báo cáo vi phạm từ người dùng.' },
    { name: 'Handle Appeals', code: 'appeals:handle', module: 'moderation', description: 'Xử lý các khiếu nại khóa tài khoản/tin đăng.' },
    // content
    { name: 'Manage Posts', code: 'posts:manage', module: 'content', description: 'Tạo, sửa, xóa và xuất bản bài viết blog/tin tức.' },
    { name: 'Moderate Reviews', code: 'reviews:moderate', module: 'content', description: 'Kiểm duyệt, ẩn hoặc phê duyệt đánh giá công ty.' },
    // system
    { name: 'Manage Config', code: 'system:config', module: 'system', description: 'Quản trị cấu hình toàn hệ thống.' },
    { name: 'View Audit Logs', code: 'system:audit', module: 'system', description: 'Xem nhật ký hoạt động hệ thống của Admin.' },
  ];

  const seededAdminPermissions: Record<string, string> = {};
  for (const perm of adminPermissionsDefinitions) {
    const record = await prisma.adminPermission.upsert({
      where: { permissionCode: perm.code },
      update: {
        permissionName: perm.name,
        module: perm.module,
        description: perm.description,
      },
      create: {
        permissionName: perm.name,
        permissionCode: perm.code,
        module: perm.module,
        description: perm.description,
      },
    });
    seededAdminPermissions[perm.code] = record.id;
  }

  const adminRolesDefinitions = [
    {
      code: 'SUPER_ADMIN',
      name: 'Super Admin',
      description: 'Toàn quyền quản trị hệ thống UpNext.',
      permissionCodes: adminPermissionsDefinitions.map(p => p.code),
    },
    {
      code: 'MODERATOR',
      name: 'Content Moderator',
      description: 'Kiểm duyệt tin tuyển dụng, bài viết và đánh giá công ty.',
      permissionCodes: ['jobs:moderate', 'jobs:view', 'reviews:moderate', 'posts:manage'],
    },
    {
      code: 'COMPLIANCE',
      name: 'Compliance Officer',
      description: 'Xác thực doanh nghiệp, xử lý báo cáo vi phạm và khiếu nại.',
      permissionCodes: ['companies:verify', 'companies:lock', 'companies:view', 'reports:handle', 'appeals:handle', 'users:moderate', 'users:view'],
    },
    {
      code: 'FINANCE',
      name: 'Finance & Billing',
      description: 'Quản lý gói dịch vụ và kiểm tra hóa đơn thanh toán.',
      permissionCodes: ['billing:plans', 'billing:invoices', 'companies:view'],
    },
    {
      code: 'SUPPORT',
      name: 'Support Specialist',
      description: 'Hỗ trợ khách hàng, xem log hệ thống và thông tin cơ bản.',
      permissionCodes: ['jobs:view', 'companies:view', 'users:view', 'system:audit'],
    },
  ];

  const seededAdminRoles: Record<string, any> = {};
  for (const roleDef of adminRolesDefinitions) {
    const role = await prisma.adminRole.upsert({
      where: { roleName: roleDef.name },
      update: {
        description: roleDef.description,
      },
      create: {
        roleName: roleDef.name,
        description: roleDef.description,
      },
    });
    seededAdminRoles[roleDef.code] = role;

    await prisma.adminRolePermission.deleteMany({
      where: { roleId: role.id },
    });

    await prisma.adminRolePermission.createMany({
      data: roleDef.permissionCodes.map((code) => ({
        roleId: role.id,
        permissionId: seededAdminPermissions[code],
      })),
    });
  }

  const adminUsersDefinitions = [
    {
      roleCode: 'SUPER_ADMIN',
      email: 'admin.super@upnext.dev',
      fullName: 'Nguyễn Minh Quốc',
      phone: '0912345678',
    },
    {
      roleCode: 'MODERATOR',
      email: 'admin.moderator@upnext.dev',
      fullName: 'Trần Thị Tuyết',
      phone: '0987654321',
    },
    {
      roleCode: 'COMPLIANCE',
      email: 'admin.compliance@upnext.dev',
      fullName: 'Lê Văn Hoàng',
      phone: '0901234567',
    },
    {
      roleCode: 'FINANCE',
      email: 'admin.finance@upnext.dev',
      fullName: 'Phạm Kim Anh',
      phone: '0934567890',
    },
    {
      roleCode: 'SUPPORT',
      email: 'admin.support@upnext.dev',
      fullName: 'Đặng Quốc Huy',
      phone: '0978901234',
    },
  ];

  const seededAdmins: Record<string, any> = {};
  for (const adminDef of adminUsersDefinitions) {
    const role = seededAdminRoles[adminDef.roleCode];
    const user = await prisma.adminUser.upsert({
      where: { email: adminDef.email },
      update: {
        fullName: adminDef.fullName,
        phone: adminDef.phone,
        roleId: role.id,
      },
      create: {
        email: adminDef.email,
        fullName: adminDef.fullName,
        phone: adminDef.phone,
        passwordHash,
        roleId: role.id,
      },
    });
    seededAdmins[adminDef.roleCode] = user;
  }

  const adminUser = seededAdmins['SUPER_ADMIN'];

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
      code: 'HR',
      name: 'HR',
      description: 'Manage recruiting operations, jobs, and candidates',
      permissionCodes: [
        'jobs:manage',
        'applications:manage',
        'applications:review_assigned',
        'interviews:manage',
        'interviews:review_assigned',
        'company:manage',
        'members:manage',
      ],
    },
    {
      code: 'INTERVIEW',
      name: 'Interview',
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

  // Clean up and migrate deprecated roles (like ADMIN, RECRUITER, INTERVIEWER, HR_MANAGER)
  const validRoleCodes = ['OWNER', 'HR', 'INTERVIEW'];
  const invalidRoles = await prisma.recruiterRole.findMany({
    where: {
      code: {
        notIn: validRoleCodes,
      },
    },
  });

  for (const role of invalidRoles) {
    // Map deprecated roles to new roles
    let targetCode = 'HR';
    if (role.code === 'INTERVIEWER') {
      targetCode = 'INTERVIEW';
    } else if (role.code === 'OWNER') {
      targetCode = 'OWNER'; // Safety check
    }

    const targetRole = seededRoles[targetCode];
    if (targetRole) {
      await prisma.recruiterAccount.updateMany({
        where: { recruiterRoleId: role.id },
        data: { recruiterRoleId: targetRole.id },
      });
      await prisma.companyMember.updateMany({
        where: { roleId: role.id },
        data: { roleId: targetRole.id },
      });
    }
    await prisma.recruiterRole.delete({ where: { id: role.id } });
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
      [
        'TypeScript', 'NestJS', 'Prisma', 'React', 'AWS', 'AI', 'QA', 'Figma',
        'Node.js', 'Express', 'JavaScript', 'Java', 'Spring Boot', 'Python', 'Django',
        'FastAPI', 'Go', 'Rust', 'C#', '.NET', 'PHP', 'Laravel', 'HTML', 'CSS', 'Vue.js',
        'Angular', 'Next.js', 'Tailwind CSS', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB',
        'Redis', 'Elasticsearch', 'Docker', 'Kubernetes', 'GCP', 'Azure', 'CI/CD', 'Git',
        'QA Automation', 'Manual Testing', 'Cypress', 'Jest', 'Machine Learning', 'Deep Learning',
        'NLP', 'PyTorch', 'TensorFlow', 'LLM', 'LangChain', 'Agile/Scrum', 'Project Management'
      ].map(async (name) => {
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
      email: definition.key === 'alpha' ? 'hr@northstar.dev' : definition.key === 'beta' ? 'contact@bluewave.com' : definition.key === 'gamma' ? 'jobs@orbitai.vn' : 'support@vertex.tech',
      website: definition.key === 'alpha' ? 'https://northstar.dev' : definition.key === 'beta' ? 'https://bluewave.com' : definition.key === 'gamma' ? 'https://orbitai.vn' : 'https://vertex.tech',
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
        phone: company.key === 'alpha' ? '02839251001' : company.key === 'beta' ? '02363888202' : company.key === 'gamma' ? '02437933003' : '02923838404',
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
      email: `${SEED_EMAIL_PREFIX}recruiter.nhan.nguyen@northstar.dev`,
      fullName: `Nguyễn Hữu Nhân`,
    },
    {
      companyIndex: 0,
      roleCode: 'HR',
      email: `${SEED_EMAIL_PREFIX}recruiter.hoai.le@northstar.dev`,
      fullName: `Lê Thị Hoài`,
    },
    {
      companyIndex: 0,
      roleCode: 'INTERVIEW',
      email: `${SEED_EMAIL_PREFIX}recruiter.son.tran@northstar.dev`,
      fullName: `Trần Văn Sơn`,
    },
    {
      companyIndex: 1,
      roleCode: 'OWNER',
      email: `${SEED_EMAIL_PREFIX}recruiter.tri.pham@bluewave.com`,
      fullName: `Phạm Minh Trí`,
    },
    {
      companyIndex: 2,
      roleCode: 'OWNER',
      email: `${SEED_EMAIL_PREFIX}recruiter.mai.do@orbitai.vn`,
      fullName: `Đỗ Thị Mai`,
    },
    {
      companyIndex: 3,
      roleCode: 'OWNER',
      email: `${SEED_EMAIL_PREFIX}recruiter.khang.hoang@vertex.tech`,
      fullName: `Hoàng Văn Khang`,
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

  const vietnameseNames = [
    'Nguyễn Minh Triết', 'Trần Thị Mai', 'Lê Hoàng Nam', 'Phạm Thanh Bình', 'Hoàng Kim Oanh',
    'Phan Anh Tuấn', 'Vũ Thị Hồng', 'Đỗ Minh Khang', 'Ngô Bích Thủy', 'Bùi Tiến Dũng',
    'Đặng Ngọc Huyền', 'Lý Huy Hoàng', 'Dương Quốc Bảo', 'Lâm Gia Hưng', 'Võ Thị Hà',
    'Trịnh Duy Anh', 'Mai Phương Thảo', 'Đinh Gia Bảo', 'Cao Minh Quân', 'Lương Thu Trang',
    'Nguyễn Hoàng Long', 'Trần Thanh Hải', 'Lê Cẩm Tú', 'Phạm Hữu Phước', 'Hoàng Thùy Linh',
    'Phan Minh Trí', 'Vũ Quang Huy', 'Đỗ Hồng Nhung', 'Ngô Minh Đức', 'Bùi Ngọc Trâm',
    'Đặng Tuấn Kiệt', 'Lý Thu Thảo', 'Dương Hồng Quân', 'Lâm Hoài Nam', 'Võ Hải Đăng',
    'Trịnh Minh Thư', 'Mai Quốc Anh', 'Đinh Thị Lan', 'Cao Tuấn Anh', 'Lương Minh Triết',
    'Nguyễn Mai Chi', 'Trần Quốc Khánh', 'Lê Thanh Sơn', 'Phạm Tiến Đạt', 'Hoàng Yến Vy',
    'Phan Bảo Ngọc', 'Vũ Văn Thanh', 'Đỗ Duy Mạnh', 'Ngô Thanh Hằng', 'Bùi Hoàng Nam',
    'Đặng Khánh Linh', 'Lý Quốc Tuấn', 'Dương Hoài An', 'Lâm Thị Ngọc', 'Võ Văn Quyết',
    'Trịnh Nhật Minh', 'Mai Xuân Trường', 'Đinh Hữu Thắng', 'Cao Thanh Trúc', 'Lương Gia Khánh'
  ];

  const candidates = Array.from({ length: 60 }, (_, index) => {
    const n = index + 1;
    const accountId = randomUUID();
    const profileId = randomUUID();
    const cvId = randomUUID();
    const cvVersionId = randomUUID();
    const fullName = vietnameseNames[index % vietnameseNames.length];

    return {
      index,
      accountId,
      profileId,
      cvId,
      cvVersionId,
      email: `${SEED_EMAIL_PREFIX}${toAsciiUrl(fullName)}@gmail.com`,
      fullName,
      createdAt: addDays(lastMonthStart, n % 25),
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
      const roleIdx = idx % 8;
      let description = "Software Engineer";
      if (roleIdx === 0) {
        description = "Sinh viên năm cuối chuyên ngành Khoa học Máy tính, có kiến thức tốt về cấu trúc dữ liệu, giải thuật và lập trình backend (Node.js/Express). Đang tìm kiếm cơ hội thực tập để phát triển kỹ năng.";
      } else if (roleIdx === 1) {
        description = "Frontend Developer mới tốt nghiệp. Đam mê thiết kế giao diện tinh tế, phản hồi nhanh và tối ưu hóa trải nghiệm người dùng. Thành thạo HTML, CSS, JavaScript và React.";
      } else if (roleIdx === 2) {
        description = "Junior Fullstack Developer với hơn 1.5 năm kinh nghiệm thực tế phát triển các ứng dụng web bằng React và Node.js. Tư duy giải quyết vấn đề tốt và khả năng làm việc độc lập.";
      } else if (roleIdx === 3) {
        description = "DevOps Engineer giàu kinh nghiệm trong thiết lập hạ tầng Cloud (AWS), tự động hóa quy trình CI/CD và triển khai ứng dụng bằng Docker/Kubernetes.";
      } else if (roleIdx === 4) {
        description = "Senior AI & Data Engineer với hơn 5 năm kinh nghiệm. Chuyên sâu về Machine Learning, NLP và tích hợp các công nghệ Generative AI/LLMs vào sản phẩm thực tế.";
      } else if (roleIdx === 5) {
        description = "Technical Lead với hơn 7 năm kinh nghiệm thiết kế kiến trúc hệ thống và dẫn dắt đội ngũ phát triển sản phẩm. Thế mạnh về Microservices, Cloud Computing và bảo mật.";
      } else if (roleIdx === 6) {
        description = "Engineering Manager có kinh nghiệm quản lý và phát triển các đội nhóm kỹ thuật. Tối ưu hóa quy trình Agile/Scrum, kết nối các mục tiêu kinh doanh và công nghệ.";
      } else if (roleIdx === 7) {
        description = "Chuyên viên QA/QC kiểm thử phần mềm, thành thạo lập kế hoạch test, viết test case, thực hiện cả Manual Testing và Automation Testing (Selenium, Cypress).";
      }

      return {
        id: candidate.profileId,
        candidateAccountId: candidate.accountId,
        address: idx % 2 === 0 ? 'Ho Chi Minh City, Vietnam' : 'Hanoi, Vietnam',
        description,
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
    data: candidates.map((candidate) => {
      const idx = candidate.index;
      const roleIdx = idx % 8;
      const cvTexts = [
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Thực tập sinh Backend Developer\nĐịa chỉ: TP. Hồ Chí Minh\n\nTÓM TẮT CHUYÊN MÔN:\nSinh viên năm cuối ngành CNTT đam mê phát triển hệ thống backend. Ham học hỏi, kiên trì và chịu được áp lực tốt.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Ngôn ngữ: JavaScript, TypeScript, Java\n- Framework: Node.js, ExpressJS\n- Cơ sở dữ liệu: MySQL, PostgreSQL\n- Công cụ: Git, Postman\n\nDỰ ÁN NỔI BẬT:\n1. Task Manager API (Express, MongoDB)\n- Thiết kế RESTful API cho ứng dụng quản lý công việc cá nhân.\n- Tích hợp xác thực người dùng bằng JWT.`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Fresher Frontend Developer\nĐịa chỉ: TP. Hồ Chí Minh\n\nTÓM TẮT CHUYÊN MÔN:\nLập trình viên Frontend mới tốt nghiệp, yêu thích thiết kế UI/UX đẹp mắt và mượt mà.\n\nKỸ NĂNG CÔNG NGHỆ:\n- HTML5, CSS3, JavaScript (ES6+), TypeScript\n- Frameworks: React, Next.js, Tailwind CSS\n- Công cụ thiết kế: Figma, Adobe XD\n\nDỰ ÁN NỔI BẬT:\n1. Personal Portfolio Website (React, Tailwind CSS)\n- Website giới thiệu bản thân với giao diện đáp ứng (responsive).\n- Triển khai hosting lên Vercel.`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Junior Fullstack Developer\nĐịa chỉ: TP. Hồ Chí Minh\n\nKINH NGHIỆM LÀM VIỆC:\n- ABC Tech (06/2024 - Hiện tại): Lập trình viên Fullstack\n  + Phát triển các tính năng mới cho ứng dụng e-commerce nội bộ.\n  + Tối ưu các câu lệnh truy vấn database.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Backend: Node.js, Express, NestJS, Prisma ORM\n- Frontend: ReactJS, Redux Toolkit\n- Databases: PostgreSQL, MongoDB\n\nDỰ ÁN NỔI BẬT:\n1. Internal Sales Management System\n- Tham gia xây dựng hệ thống quản lý doanh số từ đầu.`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: DevOps Engineer\nĐịa chỉ: Hà Nội\n\nKINH NGHIỆM LÀM VIỆC:\n- KMS Technology (2023 - Hiện tại): DevOps Engineer\n  + Xây dựng và duy trì đường ống dẫn CI/CD bằng Jenkins và GitLab CI.\n  + Quản lý hạ tầng AWS cho 3 dự án lớn.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Cloud: AWS (EC2, VPC, EKS, RDS, CloudWatch)\n- Containerization: Docker, Kubernetes\n- Infrastructure as Code: Terraform\n- CI/CD: Jenkins, Github Actions`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Senior AI & Data Engineer\nĐịa chỉ: Hà Nội\n\nKINH NGHIỆM LÀM VIỆC:\n- VinAI Research (2021 - Hiện tại): Senior Data Scientist / AI Engineer\n  + Nghiên cứu và tối ưu hóa các mô hình Machine Learning / Deep Learning.\n  + Triển khai hệ thống RAG (Retrieval-Augmented Generation) cho trợ lý ảo doanh nghiệp.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Programming: Python, R, SQL\n- ML/DL Frameworks: PyTorch, TensorFlow, Scikit-learn\n- AI tools: LangChain, LlamaIndex, OpenAI API\n- Big Data: Spark, Hadoop`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Technical Lead (Backend & Cloud)\nĐịa chỉ: TP. Hồ Chí Minh\n\nKINH NGHIỆM LÀM VIỆC:\n- VNG Corporation (2020 - Hiện tại): Technical Lead / Senior Backend Engineer\n  + Thiết kế kiến trúc microservices xử lý lưu lượng truy cập lớn (hơn 10k CCU).\n  + Dẫn dắt và cố vấn (mentor) cho 8 lập trình viên.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Languages & Frameworks: Java (Spring Boot), TypeScript (NestJS), Golang\n- Architecture: Microservices, RESTful API, gRPC, Message Broker (Kafka)\n- Cloud: AWS, GCP`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Engineering Manager\nĐịa chỉ: TP. Hồ Chí Minh\n\nKINH NGHIỆM LÀM VIỆC:\n- Axon Active (2018 - Hiện tại): Engineering Manager / Scrum Master\n  + Quản lý 3 đội nhóm Agile (tổng cộng 25 thành viên).\n  + Lập kế hoạch tài nguyên, đánh giá hiệu quả công việc và định hướng phát triển nghề nghiệp cho nhân sự.\n\nKỸ NĂNG QUẢN LÝ:\n- Agile/Scrum, Project Planning, Risk Management, People Management, Budgeting`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: QA / Automation Engineer\nĐịa chỉ: Hà Nội\n\nKINH NGHIỆM LÀM VIỆC:\n- FPT Software (2022 - Hiện tại): QA Automation Engineer\n  + Viết kịch bản kiểm thử tự động cho hệ thống web và mobile.\n  + Thực hiện kiểm thử hiệu năng và bảo mật cơ bản.\n\nKỸ NĂNG CHUYÊN MÔN:\n- Testing tools: Selenium WebDriver, Cypress, Postman, JMeter\n- Programming: Java, JavaScript\n- Methodologies: Agile/Scrum, Waterfall`
      ];
      return {
        id: candidate.cvVersionId,
        cvId: candidate.cvId,
        versionNo: 1,
        parsedText: cvTexts[roleIdx],
        createdAt: candidate.createdAt,
      };
    }),
  });

  await prisma.candidateJobPreference.createMany({
    data: candidates.map((candidate) => {
      let desiredLevelId: string | null = null;
      let desiredPosition = 'Software Engineer';
      let minSalary = 10000000;
      let maxSalary = 20000000;
      let workingModel: WorkingModel = WorkingModel.HYBRID;

      const idx = candidate.index;
      const roleIdx = idx % 8;
      if (roleIdx === 0) {
        desiredLevelId = experienceLevels.intern.id;
        desiredPosition = 'Intern Backend Engineer';
        minSalary = 3000000;
        maxSalary = 6000000;
        workingModel = WorkingModel.ONSITE;
      } else if (roleIdx === 1) {
        desiredLevelId = experienceLevels.fresher.id;
        desiredPosition = 'Fresher Frontend Developer';
        minSalary = 8000000;
        maxSalary = 12000000;
        workingModel = WorkingModel.ONSITE;
      } else if (roleIdx === 2) {
        desiredLevelId = experienceLevels.junior.id;
        desiredPosition = 'Junior Fullstack Developer';
        minSalary = 12000000;
        maxSalary = 18000000;
        workingModel = WorkingModel.HYBRID;
      } else if (roleIdx === 3) {
        desiredLevelId = experienceLevels.mid.id;
        desiredPosition = 'Mid-level DevOps Engineer';
        minSalary = 20000000;
        maxSalary = 32000000;
        workingModel = WorkingModel.REMOTE;
      } else if (roleIdx === 4) {
        desiredLevelId = experienceLevels.senior.id;
        desiredPosition = 'Senior AI & Data Engineer';
        minSalary = 35000000;
        maxSalary = 55000000;
        workingModel = WorkingModel.HYBRID;
      } else if (roleIdx === 5) {
        desiredLevelId = experienceLevels.lead.id;
        desiredPosition = 'Technical Lead (Java/AWS)';
        minSalary = 45000000;
        maxSalary = 70000000;
        workingModel = WorkingModel.REMOTE;
      } else if (roleIdx === 6) {
        desiredLevelId = experienceLevels.manager.id;
        desiredPosition = 'Engineering Manager';
        minSalary = 60000000;
        maxSalary = 90000000;
        workingModel = WorkingModel.HYBRID;
      } else if (roleIdx === 7) {
        desiredLevelId = experienceLevels.mid.id;
        desiredPosition = 'QA Engineer';
        minSalary = 15000000;
        maxSalary = 22000000;
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
    const roleIdx = idx % 8;

    // 1. Languages
    languagesToCreate.push({
      id: randomUUID(),
      candidateProfileId: profileId,
      language: 'Vietnamese',
      proficiency: 'Native',
      createdAt: baseDate,
      updatedAt: baseDate,
    });

    if (roleIdx !== 7 && roleIdx !== 1) {
      languagesToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        language: 'English',
        proficiency: roleIdx === 5 || roleIdx === 6 ? 'Fluent' : roleIdx === 4 ? 'IELTS 7.5' : 'Intermediate',
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }
    if (roleIdx === 3) {
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
    const asciiName = toAsciiUrl(candidate.fullName);
    linksToCreate.push({
      id: randomUUID(),
      candidateProfileId: profileId,
      type: 'LinkedIn',
      url: `https://linkedin.com/in/${asciiName}`,
      createdAt: baseDate,
      updatedAt: baseDate,
    });
    if (roleIdx !== 6) {
      linksToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        type: 'GitHub',
        url: `https://github.com/${asciiName}`,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }
    if (roleIdx === 1) {
      linksToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        type: 'Portfolio',
        url: `https://${asciiName}.dev`,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    }

    // 3. Education
    if (roleIdx === 0) {
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
    } else if (roleIdx === 1) {
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
      if (roleIdx === 4) {
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
    if (roleIdx === 0) {
      candidateSkills.push('TypeScript', 'NestJS', 'Node.js', 'Express', 'JavaScript', 'SQL', 'PostgreSQL', 'Git', 'HTML', 'CSS');
    } else if (roleIdx === 1) {
      candidateSkills.push('React', 'TypeScript', 'Figma', 'JavaScript', 'HTML', 'CSS', 'Tailwind CSS', 'Git');
    } else if (roleIdx === 2) {
      candidateSkills.push('TypeScript', 'React', 'Prisma', 'Node.js', 'Express', 'JavaScript', 'SQL', 'PostgreSQL', 'Tailwind CSS', 'Git', 'Docker');
    } else if (roleIdx === 3) {
      candidateSkills.push('AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Python', 'GCP', 'Azure');
    } else if (roleIdx === 4) {
      candidateSkills.push('AI', 'AWS', 'Python', 'Machine Learning', 'Deep Learning', 'NLP', 'PyTorch', 'TensorFlow', 'LLM', 'LangChain', 'SQL', 'PostgreSQL');
    } else if (roleIdx === 5) {
      candidateSkills.push('TypeScript', 'React', 'NestJS', 'AWS', 'Prisma', 'Node.js', 'SQL', 'PostgreSQL', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Java', 'Spring Boot');
    } else if (roleIdx === 6) {
      candidateSkills.push('Git', 'TypeScript', 'React', 'NestJS', 'AWS', 'Docker', 'Project Management', 'Agile/Scrum');
    } else if (roleIdx === 7) {
      candidateSkills.push('QA', 'QA Automation', 'Manual Testing', 'Cypress', 'Jest', 'TypeScript', 'JavaScript', 'Git');
    }

    candidateSkills.forEach((skillName, sIdx) => {
      const skillRecord = skills[skillName as keyof typeof skills];
      if (skillRecord) {
        skillsToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          skillId: skillRecord.id,
          proficiencyLevel: roleIdx >= 5 ? 'EXPERT' : roleIdx >= 4 ? 'ADVANCED' : 'INTERMEDIATE',
          yearsOfExperience: new Prisma.Decimal(roleIdx === 0 ? 0.5 : roleIdx === 1 ? 1 : roleIdx * 1.5),
          sortOrder: sIdx,
          createdAt: baseDate,
          updatedAt: baseDate,
        });
      }
    });

    if (roleIdx !== 0 && roleIdx !== 1) {
      const expId = randomUUID();
      const companyName = roleIdx === 6 ? 'Axon Active' : roleIdx === 5 ? 'VNG Corporation' : roleIdx === 4 ? 'VinAI' : 'ABC Tech';
      const positionTitle = roleIdx === 6 ? 'Engineering Manager' : roleIdx === 5 ? 'Technical Lead' : roleIdx === 4 ? 'Senior AI Engineer' : 'Junior Developer';
      
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

      if (roleIdx >= 5) {
        const oldExpId = randomUUID();
        const oldCompanyName = roleIdx === 6 ? 'KMS Technology' : 'Viettel Group';
        const oldPositionTitle = roleIdx === 6 ? 'Technical Lead' : 'Senior Software Engineer';
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
    if (roleIdx === 0) {
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
    } else if (roleIdx === 1) {
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
    if (roleIdx === 3) {
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
    } else if (roleIdx === 4) {
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
    } else if (roleIdx === 5) {
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
    } else if (roleIdx === 6) {
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
    
    const employmentType = employmentTypes[definition.employmentTypeKey];
    if (!employmentType) {
      throw new Error(`Employment type key "${definition.employmentTypeKey}" not found in seeded employmentTypes.`);
    }
    
    const experienceLevel = experienceLevels[definition.experienceLevelKey];
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
      description: jobDetailsMap[job.title]?.description || `${job.title} role. Join our team to build the future of hiring products.`,
      requirements: jobDetailsMap[job.title]?.requirements || 'Requirements matching the position profile.',
      benefits: jobDetailsMap[job.title]?.benefits || 'Competitive benefits, learning budget, and remote-friendly work.',
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

  console.log('Seeding views, applications, status logs, saved jobs dynamically...');

  // 1. Get all jobs in database (both hardcoded and imported)
  const allDbJobs = await prisma.jobPost.findMany({
    include: {
      createdByRecruiter: true
    }
  });

  const viewsToCreate: Prisma.JobViewCreateManyInput[] = [];
  const applicationsToCreate: any[] = [];
  const savedJobsToCreate: Prisma.SavedJobCreateManyInput[] = [];

  const candidateProfiles = candidates.map(c => ({
    profileId: c.profileId,
    accountId: c.accountId,
    fullName: c.fullName
  }));

  // Helper for random choices
  const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const pickMultipleRandom = <T>(arr: T[], count: number): T[] => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  };

  const statusList = [
    ApplicationStatus.SUBMITTED,    
    ApplicationStatus.VIEWED,       
    ApplicationStatus.SHORTLISTED,  
    ApplicationStatus.INTERVIEWING, 
    ApplicationStatus.OFFERED,      
    ApplicationStatus.HIRED,        
    ApplicationStatus.REJECTED,     
    ApplicationStatus.WITHDRAWN,    
  ];

  for (const job of allDbJobs) {
    const jobCreatedAt = job.createdAt;
    
    // Seed views
    const viewsCount = randomBetween(80, 250);
    const jobViewsForCurrentJob: Prisma.JobViewCreateManyInput[] = [];

    for (let i = 0; i < viewsCount; i++) {
      const isCandidate = Math.random() < 0.35; // 35% viewed by logged-in candidates
      const candidateProfile = isCandidate ? pickRandom(candidateProfiles) : null;
      const viewedAt = addDays(jobCreatedAt, randomBetween(1, 20) + Math.random());

      jobViewsForCurrentJob.push({
        id: randomUUID(),
        candidateProfileId: candidateProfile ? candidateProfile.profileId : null,
        jobPostId: job.id,
        visitorKey: `${SEED_KEY}-visitor-${job.id.substring(0, 8)}-${i}`,
        ipAddress: `192.168.${randomBetween(1, 254)}.${randomBetween(1, 254)}`,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewedAt: viewedAt < now ? viewedAt : now,
      });
    }
    viewsToCreate.push(...jobViewsForCurrentJob);

    // Seed applications
    // Conversion rate: 6% to 15% of views convert to applications
    const appsCount = Math.round(viewsCount * (randomBetween(6, 15) / 100));
    const appCandidates = pickMultipleRandom(candidateProfiles, appsCount);

    appCandidates.forEach((candidate, index) => {
      const rand = Math.random();
      let status: ApplicationStatus = ApplicationStatus.SUBMITTED;
      if (rand < 0.40) status = ApplicationStatus.SUBMITTED;
      else if (rand < 0.65) status = ApplicationStatus.VIEWED;
      else if (rand < 0.80) status = ApplicationStatus.SHORTLISTED;
      else if (rand < 0.90) status = ApplicationStatus.INTERVIEWING;
      else if (rand < 0.94) status = ApplicationStatus.OFFERED;
      else if (rand < 0.96) status = ApplicationStatus.HIRED;
      else if (rand < 0.98) status = ApplicationStatus.REJECTED;
      else status = ApplicationStatus.WITHDRAWN;

      const submittedAt = addDays(jobCreatedAt, randomBetween(1, 10) + Math.random());

      const coverLetters = [
        `Kính gửi Bộ phận Tuyển dụng,\nTôi xin ứng tuyển vào vị trí ${job.title} tại Quý công ty. Với kiến thức và kinh nghiệm hiện tại, tôi mong muốn được đồng hành và phát triển cùng công ty.\n\nTrân trọng,\n${candidate.fullName}`,
        `Dear Hiring Team,\nI am writing to apply for the ${job.title} position. Given my technical background and background in the field, I am confident I will be a great fit for your team.\n\nBest regards,\n${candidate.fullName}`,
        `Chào anh/chị tuyển dụng,\nTôi muốn gửi hồ sơ ứng tuyển cho công ty mình vị trí ${job.title}. Tôi tin mình có thể đáp ứng tốt các yêu cầu của công việc.\n\nCảm ơn anh/chị,\n${candidate.fullName}`
      ];
      const coverLetter = coverLetters[index % coverLetters.length];

      applicationsToCreate.push({
        id: randomUUID(),
        jobPostId: job.id,
        candidateProfileId: candidate.profileId,
        candidateAccountId: candidate.accountId,
        recruiterAccountId: job.createdByRecruiterId,
        cvVersionId: pickRandom(candidates).cvVersionId,
        coverLetter,
        status,
        submittedAt: submittedAt < now ? submittedAt : now,
        createdAt: submittedAt < now ? submittedAt : now,
        updatedAt: submittedAt < now ? submittedAt : now,
      });
    });

    // Seed saved jobs
    const savesCount = randomBetween(5, 20);
    const saveCandidates = pickMultipleRandom(candidateProfiles, savesCount);
    saveCandidates.forEach((candidate) => {
      savedJobsToCreate.push({
        candidateProfileId: candidate.profileId,
        jobPostId: job.id,
        createdAt: addDays(jobCreatedAt, randomBetween(1, 5)),
      });
    });
  }

  if (viewsToCreate.length > 0) {
    await prisma.jobView.createMany({ data: viewsToCreate });
  }

  if (applicationsToCreate.length > 0) {
    await prisma.application.createMany({
      data: applicationsToCreate.map(app => ({
        id: app.id,
        jobPostId: app.jobPostId,
        candidateProfileId: app.candidateProfileId,
        cvVersionId: app.cvVersionId,
        coverLetter: app.coverLetter,
        status: app.status,
        submittedAt: app.submittedAt,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      }))
    });
  }

  if (savedJobsToCreate.length > 0) {
    await prisma.savedJob.createMany({ data: savedJobsToCreate });
  }

  // 2. Seed Application Status Logs & Interviews
  const statusLogsData: any[] = [];
  const interviewsData: any[] = [];
  const interviewLogsData: any[] = [];

  const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 60 * 60 * 1000);

  for (const app of applicationsToCreate) {
    const baseTime = app.submittedAt;
    const targetStatus = app.status;
    const candidateAccountId = app.candidateAccountId;
    const recruiterAccountId = app.recruiterAccountId;

    const recruiter = recruiters.find(r => r.id === recruiterAccountId);
    const recruiterProfileId = recruiter ? recruiter.profileId : null;

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

    if (targetStatus === ApplicationStatus.SUBMITTED) continue;

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

    if (targetStatus === ApplicationStatus.VIEWED) continue;

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
      continue;
    }

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

    if (targetStatus === ApplicationStatus.SHORTLISTED) continue;

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
      continue;
    }

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

    if (recruiterProfileId) {
      const interviewId = randomUUID();
      const interviewDate = addDays(baseTime, 4);
      const startAt = new Date(interviewDate.setHours(10, 0, 0, 0));
      const endAt = new Date(interviewDate.setHours(11, 0, 0, 0));

      const isCompleted = [ApplicationStatus.OFFERED, ApplicationStatus.HIRED].includes(targetStatus) || (targetStatus === ApplicationStatus.INTERVIEWING && Math.random() < 0.5);

      interviewsData.push({
        id: interviewId,
        recruiterProfileId,
        applicationId: app.id,
        interviewRound: 1,
        type: 'ONLINE',
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        meetingUrl: 'https://zoom.us/j/upnext-mock-meeting',
        location: null,
        status: isCompleted ? InterviewStatus.COMPLETED : InterviewStatus.SCHEDULED,
        result: isCompleted ? InterviewResult.PASSED : InterviewResult.PENDING,
        recruiterNote: 'Candidate showed good communications and technical depth.',
        rescheduleCount: 0,
      });

      interviewLogsData.push({
        id: randomUUID(),
        interviewId,
        oldStatus: null,
        newStatus: InterviewStatus.SCHEDULED,
        actorType: ActorType.RECRUITER,
        actorId: recruiterAccountId,
        note: 'Recruiter scheduled the interview',
        createdAt: addDays(baseTime, 2),
      });

      if (isCompleted) {
        interviewLogsData.push({
          id: randomUUID(),
          interviewId,
          oldStatus: InterviewStatus.SCHEDULED,
          newStatus: InterviewStatus.COMPLETED,
          actorType: ActorType.RECRUITER,
          actorId: recruiterAccountId,
          note: 'Interview status changed to COMPLETED',
          createdAt: endAt,
        });
      }
    }

    if (targetStatus === ApplicationStatus.INTERVIEWING) continue;

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

    if (targetStatus === ApplicationStatus.OFFERED) continue;

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
  }

  if (statusLogsData.length > 0) {
    await prisma.applicationStatusLog.createMany({ data: statusLogsData });
  }
  if (interviewsData.length > 0) {
    await prisma.interview.createMany({ data: interviewsData });
  }
  if (interviewLogsData.length > 0) {
    await prisma.interviewLog.createMany({ data: interviewLogsData });
  }

  const alphaCompany = companies[0];
  const betaCompany = companies[1];
  const gammaCompany = companies[2];
  const deltaCompany = companies[3];

  const allInsertedApps = await prisma.application.findMany({
    include: {
      jobPost: true
    }
  });

  const hiredAlphaApp = allInsertedApps.find(
    (app) => app.status === ApplicationStatus.HIRED && app.jobPost.companyId === alphaCompany.id
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

  const pendingBetaApp = allInsertedApps.find(
    (app) => app.status === ApplicationStatus.SHORTLISTED && app.jobPost.companyId === betaCompany.id
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

  const approvedGammaApp = allInsertedApps.find(
    (app) => app.status === ApplicationStatus.INTERVIEWING && app.jobPost.companyId === gammaCompany.id
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

  const hiredDeltaApp = allInsertedApps.find(
    (app) => app.status === ApplicationStatus.HIRED && app.jobPost.companyId === deltaCompany.id
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

  const submittedDeltaApp = allInsertedApps.find(
    (app) => app.status === ApplicationStatus.SUBMITTED && app.jobPost.companyId === deltaCompany.id
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

  const rejectedAlphaApp = allInsertedApps.find(
    (app) => app.status === ApplicationStatus.REJECTED && app.jobPost.companyId === alphaCompany.id
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

  console.log('Seeding admin audit logs and appeals...');

  const betaRecruiter = recruiters[3];
  const deltaRecruiter = recruiters[5];
  const complianceAdmin = seededAdmins['COMPLIANCE'];
  const superAdminObj = seededAdmins['SUPER_ADMIN'];
  const moderatorAdmin = seededAdmins['MODERATOR'];
  const financeAdmin = seededAdmins['FINANCE'];
  const supportAdmin = seededAdmins['SUPPORT'];

  // Seed Appeals
  await prisma.appeal.createMany({
    data: [
      {
        id: randomUUID(),
        recruiterAccountId: betaRecruiter.id,
        targetType: 'COMPANY',
        targetId: companies[1].id, // Beta Company
        content: 'Kính gửi Ban quản trị UpNext, tôi đã gửi lại giấy phép đăng ký kinh doanh được cập nhật mới nhất của công ty Bluewave Outsourcing. Mong ban quản trị hỗ trợ xác thực lại trạng thái doanh nghiệp để chúng tôi có thể bắt đầu đăng tin tuyển dụng. Xin cảm ơn.',
        status: 'PENDING',
        createdAt: addDays(now, -5),
        updatedAt: addDays(now, -5),
      },
      {
        id: randomUUID(),
        recruiterAccountId: deltaRecruiter.id,
        targetType: 'COMPANY',
        targetId: companies[3].id, // Delta Company
        content: 'Chúng tôi đã cập nhật mã số thuế chính xác và đính kèm bản quét giấy phép kinh doanh có công chứng của Vertex Commerce Tech. Đề nghị kiểm tra và mở khóa tài khoản để chúng tôi tiếp tục tuyển dụng.',
        status: 'REJECTED',
        handledByAdminId: complianceAdmin.id,
        createdAt: addDays(now, -10),
        updatedAt: addDays(now, -8),
      }
    ]
  });

  // Seed Admin Audit Logs
  await prisma.adminAuditLog.createMany({
    data: [
      {
        id: randomUUID(),
        adminId: superAdminObj.id,
        action: 'UPDATE_SYSTEM_CONFIG',
        targetType: 'SYSTEM',
        targetId: null,
        ipAddress: '192.168.1.50',
        oldValue: JSON.stringify({ maintenance_mode: false }),
        newValue: JSON.stringify({ maintenance_mode: true }),
        createdAt: addDays(now, -12),
      },
      {
        id: randomUUID(),
        adminId: complianceAdmin.id,
        action: 'REJECT_COMPANY_VERIFICATION',
        targetType: 'COMPANY',
        targetId: companies[3].id,
        ipAddress: '192.168.1.102',
        oldValue: JSON.stringify({ verificationStatus: 'PENDING' }),
        newValue: JSON.stringify({ verificationStatus: 'REJECTED', reason: 'Giấy phép đăng ký kinh doanh không hợp lệ hoặc đã quá hạn hiệu lực.' }),
        createdAt: addDays(now, -8),
      },
      {
        id: randomUUID(),
        adminId: moderatorAdmin.id,
        action: 'APPROVE_JOB_POST',
        targetType: 'JOB_POST',
        targetId: alphaJobs[0].id,
        ipAddress: '192.168.1.105',
        oldValue: JSON.stringify({ moderationStatus: 'PENDING' }),
        newValue: JSON.stringify({ moderationStatus: 'APPROVED' }),
        createdAt: addDays(now, -6),
      },
      {
        id: randomUUID(),
        adminId: financeAdmin.id,
        action: 'CREATE_SUBSCRIPTION_PLAN',
        targetType: 'SUBSCRIPTION_PLAN',
        targetId: plans.premium.id,
        ipAddress: '192.168.1.88',
        oldValue: null,
        newValue: JSON.stringify({ subscriptionName: 'Premium Plan', price: 1490000 }),
        createdAt: addDays(now, -15),
      },
      {
        id: randomUUID(),
        adminId: supportAdmin.id,
        action: 'VIEW_USER_AUDIT',
        targetType: 'USER',
        targetId: candidates[0].accountId,
        ipAddress: '192.168.1.120',
        oldValue: null,
        newValue: JSON.stringify({ viewed: true }),
        createdAt: addDays(now, -1),
      }
    ]
  });

  // Seed Reports
  await prisma.report.createMany({
    data: [
      {
        id: randomUUID(),
        reporterCandidateId: candidates[0].profileId,
        targetType: 'COMPANY',
        targetId: companies[3].id, // Delta Company
        reason: 'Công ty yêu cầu ứng viên đóng tiền cọc trước khi phỏng vấn, có dấu hiệu lừa đảo và không minh bạch.',
        status: 'RESOLVED',
        handledByAdminId: complianceAdmin.id,
        createdAt: addDays(now, -4),
        updatedAt: addDays(now, -2),
      },
      {
        id: randomUUID(),
        reporterCandidateId: candidates[1].profileId,
        targetType: 'JOB_POST',
        targetId: jobs[4].id, // Frontend React Engineer at Bluewave
        reason: 'Nội dung tuyển dụng yêu cầu phân biệt giới tính và tuổi tác một cách phi lý, không tuân thủ chính sách lao động.',
        status: 'PENDING',
        createdAt: addDays(now, -1),
        updatedAt: addDays(now, -1),
      }
    ]
  });

  await importItviecData(passwordHash, recruiterRole as { id: string }, employmentTypes, experienceLevels, categories, specializations);
  console.log(`Home seed complete: ${companies.length} companies, ${jobs.length} jobs, ${applicationsToCreate.length} applications.`);
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

  const jobsData = JSON.parse(fs.readFileSync(jobsPath, 'utf-8')) as { jobs: ImportedItviecJob[] };
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
