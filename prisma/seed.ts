/* eslint-disable */
import {
  ActorType,
  ApplicationStatus,
  AuthProvider,
  CompanyStatus,
  CompanyType,
  CompanyVerificationStatus,
  CvSource,
  CvStatus,
  EducationLevel,
  FilePurpose,
  FileVisibility,
  Gender,
  InterviewResult,
  InterviewStatus,
  InterviewType,
  JobSearchStatus,
  JobStatus,
  ModerationStatus,
  PostStatus,
  PostType,
  PlanAudience,
  Prisma,
  PrismaClient,
  ProfileVisibility,
  SalaryPeriod,
  SkillPriority,
  WorkingModel,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SubscriptionFeature } from '../src/modules/subscriptions/feature-registry';
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
const uploadRoot = path.resolve(process.env.UPLOAD_ROOT?.trim() || 'uploads');
const appBackendUrl = (process.env.APP_BACKEND_URL?.trim() || 'http://localhost:3001').replace(
  /\/+$/,
  '',
);

const SEED_KEY = 'seed-home-test';
const SEED_EMAIL_PREFIX = `${SEED_KEY}.`;
const SEED_TAX_CODE_PREFIX = 'SEED_HOME_TEST_';
const SEED_STORAGE_PREFIX = `${SEED_KEY}/`;
const SEED_ADDRESS_PREFIX = '[SEED_HOME_TEST]';
const DAY = 24 * 60 * 60 * 1000;
const POST_IMAGE_SEED_VERSION = 'v20260806';

type SeedPostPresentation = {
  daysAgo: number;
  viewCount: number;
  imageUrl: string;
};

const HOME_POST_PRESENTATION_BY_SLUG: Record<string, SeedPostPresentation> = {
  [`${SEED_KEY}-top-5-cv-writing-tips`]: {
    daysAgo: 87,
    viewCount: 5346,
    imageUrl:
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1600&q=85',
  },
  [`${SEED_KEY}-how-ai-revolutionizing-hiring`]: {
    daysAgo: 20,
    viewCount: 16950,
    imageUrl:
      'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=1600&q=85',
  },
  [`${SEED_KEY}-salary-negotiation-guide`]: {
    daysAgo: 157,
    viewCount: 10265,
    imageUrl:
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=85',
  },
  [`${SEED_KEY}-why-nestjs-best-framework`]: {
    daysAgo: 4,
    viewCount: 22417,
    imageUrl:
      'https://images.unsplash.com/photo-1607799279861-4dd421887fb3?auto=format&fit=crop&w=1600&q=85',
  },
  [`${SEED_KEY}-getting-started-typescript-5`]: {
    daysAgo: 37,
    viewCount: 388,
    imageUrl:
      'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=1600&q=85',
  },
  [`${SEED_KEY}-legacy-coding-standards-2024`]: {
    daysAgo: 801,
    viewCount: 7124,
    imageUrl:
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1600&q=85',
  },
  [`${SEED_KEY}-faq-how-to-apply`]: {
    daysAgo: 57,
    viewCount: 3184,
    imageUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85',
  },
  [`${SEED_KEY}-understanding-web3`]: {
    daysAgo: 114,
    viewCount: 762,
    imageUrl:
      'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=1600&q=85',
  },
};

// Mirrors UPLOAD_ROOT in src/common/config/env.validation.ts so seeded CV files
// land exactly where CvVersionsService.prepareDownload will look for them.
const SEED_UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_ROOT ?? path.resolve(process.cwd(), 'uploads'),
);

/** Strips diacritics so text stays inside the PDF's WinAnsi font encoding. */
function foldToAscii(value: string) {
  return value
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, '');
}

/**
 * Builds a minimal but standards-valid single-page PDF. Seeds cannot ship real
 * binaries (uploads/ is gitignored), so the file is generated instead -- that
 * keeps `pnpm prisma:seed` self-contained on a fresh clone and in CI.
 */
function buildSeedCvPdf(lines: string[]) {
  const escapePdfText = (value: string) =>
    foldToAscii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  const content = lines
    .slice(0, 40)
    .map((line, index) => `BT /F1 11 Tf 56 ${790 - index * 18} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const startXref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${startXref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * Writes a seeded CV to disk using the same storage-key convention as a real
 * upload (CvVersionsService.saveCvFile -> `uploads/cvs/<cvId>/<file>.pdf`), so
 * the recruiter CV stream endpoint can serve it without any special casing.
 */
function writeSeedCvPdf(cvId: string, lines: string[]) {
  const fileName = 'version-1.pdf';
  const storageKey = path.posix.join('uploads', 'cvs', cvId, fileName);
  const absolutePath = path.resolve(SEED_UPLOAD_ROOT, 'cvs', cvId, fileName);
  const buffer = buildSeedCvPdf(lines);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, buffer);

  return { storageKey, sizeBytes: buffer.length };
}

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

function uuidFromSeed(value: string) {
  const hash = createHash('md5').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function normalizeLogoDevCompanySeed(rawData: any) {
  const now = new Date('2026-07-12T00:00:00.000Z');
  const companies = (rawData.companies || []).map((item: any, index: number) => {
    const companyId = uuidFromSeed(`logo-dev-company:${item.slug}`);
    const logoFileId = uuidFromSeed(`logo-dev-logo:${item.slug}`);
    const businessLicenseFileId = null;
    const reputationScore =
      index === 0 ? '95' : index === 1 ? '15' : index === 2 ? '35' : index === 3 ? '10' : '60';

    return {
      id: companyId,
      logoFileId,
      businessLicenseFileId,
      type: item.type || 'OTHER',
      name: item.name,
      slug: item.slug,
      taxCode: item.taxCode,
      address: item.address,
      email: item.email,
      phone: item.phone,
      website: item.website,
      description: item.description,
      benefits: item.benefits,
      companySize: item.companySize,
      workingDays: item.workingDays || 'Monday - Friday',
      verificationStatus: item.verificationStatus || 'VERIFIED',
      reputationScore,
      status: item.status || 'ACTIVE',
      lockedReason: null,
      lockedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  });

  const fileAssets = (rawData.companies || []).flatMap((item: any) => {
    const companyId = uuidFromSeed(`logo-dev-company:${item.slug}`);
    const logoFileId = uuidFromSeed(`logo-dev-logo:${item.slug}`);
    const coverFileId = uuidFromSeed(`logo-dev-cover:${item.slug}`);
    const environmentImages = Array.isArray(item.environmentImages)
      ? item.environmentImages.filter(
          (imageUrl: unknown): imageUrl is string =>
            typeof imageUrl === 'string' && imageUrl.trim().length > 0,
        )
      : [];
    const coverUrl = environmentImages[0] ?? null;
    const photoAssets = environmentImages.map((imageUrl: string, index: number) => ({
      id: uuidFromSeed(`logo-dev-photo:${item.slug}:${index + 1}`),
      ownerType: 'company_photo',
      ownerId: companyId,
      purpose: 'OTHER',
      visibility: 'PUBLIC',
      storageKey: `upnext/seed/company-workplaces/${item.slug}/workplace-${index + 1}`,
      originalName: `${item.slug}-workplace-${index + 1}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: '0',
      publicUrl: imageUrl,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }));

    return [
      {
        id: logoFileId,
        ownerType: 'company',
        ownerId: companyId,
        purpose: 'COMPANY_LOGO',
        visibility: 'PUBLIC',
        storageKey: `companies/${item.slug}/logo-logo-dev.png`,
        originalName: `${item.slug}-logo.png`,
        mimeType: 'image/png',
        sizeBytes: '2048',
        publicUrl: item.logoUrl,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: coverFileId,
        ownerType: 'company_cover',
        ownerId: companyId,
        purpose: 'OTHER',
        visibility: 'PUBLIC',
        storageKey: `companies/${item.slug}/cover-logo-dev.jpg`,
        originalName: `${item.slug}-cover.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: '4096',
        publicUrl:
          coverUrl ||
          'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=700&fit=crop&q=80',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      ...photoAssets,
    ];
  });

  const recruiters = companies.map((company: any) => {
    const recruiterId = uuidFromSeed(`logo-dev-recruiter:${company.slug}`);
    return {
      id: recruiterId,
      companyId: company.id,
      recruiterRoleId: null,
      email: `${company.slug}@gmail.com`,
      passwordHash: null,
      authProvider: 'DEFAULT',
      providerUserId: null,
      status: 'ACTIVE',
      emailVerifiedAt: company.createdAt,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      profile: {
        id: uuidFromSeed(`logo-dev-recruiter-profile:${company.slug}`),
        recruiterAccountId: recruiterId,
        fullName: `${company.name} Recruitment Team`,
        phoneNumber: null,
        gender: null,
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=0f766e&color=fff&size=160&bold=true&format=png`,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
    };
  });

  return { companies, fileAssets, recruiters };
}

function readJsonFileIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadCompanySeedData() {
  const logoDevPath = path.join(__dirname, 'data/companies_50_real_logo_dev.json');
  const legacyPath = path.join(__dirname, 'data/companies_real.json');
  const logoDevData = readJsonFileIfExists(logoDevPath);

  if (logoDevData?.companies?.length) {
    return normalizeLogoDevCompanySeed(logoDevData);
  }

  const legacyData = readJsonFileIfExists(legacyPath);
  if (legacyData?.companies?.length) {
    return legacyData;
  }

  throw new Error(
    'prisma/data/companies_50_real_logo_dev.json is required for seeding real companies.',
  );
}

function loadCompanySeedCleanupData() {
  const seedData = loadCompanySeedData();
  const legacyPath = path.join(__dirname, 'data/companies_real.json');
  const legacyData = readJsonFileIfExists(legacyPath);

  if (!legacyData?.companies?.length) {
    return seedData;
  }

  return {
    companies: [...(seedData.companies || []), ...(legacyData.companies || [])],
    fileAssets: [...(seedData.fileAssets || []), ...(legacyData.fileAssets || [])],
    recruiters: [...(seedData.recruiters || []), ...(legacyData.recruiters || [])],
  };
}

function loadJobPostSeedData() {
  const jobPostsPath = path.join(__dirname, 'data/jobposts_100_companies.json');
  const jobPosts = readJsonFileIfExists(jobPostsPath);

  if (!Array.isArray(jobPosts) || jobPosts.length === 0) {
    throw new Error('prisma/data/jobposts_100_companies.json is required for seeding job posts.');
  }

  return jobPosts;
}

// The raw jobposts_100_companies.json bakes in two data-quality problems that make
// the seeded catalog look repetitive: (1) 40 jobs have their `employmentType` set to
// a working-model value ("Hybrid"/"Remote") instead of an actual employment type, and
// (2) every location is ONSITE/HYBRID — there is no REMOTE job at all. It also stores
// frozen absolute publishedAt/expiredAt timestamps, so most jobs pile up on the same
// handful of calendar days ("Còn 8 ngày" everywhere) instead of spreading naturally.
// This normalizes both issues and re-derives dates relative to the actual seed run,
// so re-seeding always produces a fresh, varied spread.
function diversifyJobPostSeedData(jobDefinitions: any[], now: Date) {
  const shuffledIndexes = <T>(pool: T[]): T[] => {
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const randomBetween = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  // --- Fix mislabeled employmentType values, spreading them across the types that
  // this dataset is currently missing (Internship has zero jobs) or under-using.
  const bogusEmploymentTypeIndexes = jobDefinitions
    .map((job, index) => ({ index, name: job.employmentType?.name }))
    .filter(({ name }) => name === 'Hybrid' || name === 'Remote')
    .map(({ index }) => index);

  const replacementEmploymentTypes = [
    ...Array(Math.round(bogusEmploymentTypeIndexes.length * 0.3)).fill({
      name: 'Internship',
      code: 'internship',
    }),
    ...Array(Math.round(bogusEmploymentTypeIndexes.length * 0.35)).fill({
      name: 'Contract / Freelance',
      code: 'contract',
    }),
    ...Array(bogusEmploymentTypeIndexes.length).fill({ name: 'Part-time', code: 'part-time' }),
  ].slice(0, bogusEmploymentTypeIndexes.length);
  const shuffledReplacements = shuffledIndexes(replacementEmploymentTypes);

  bogusEmploymentTypeIndexes.forEach((jobIndex, i) => {
    jobDefinitions[jobIndex].employmentType = { ...shuffledReplacements[i] };
  });
  // Normalize the legacy "Contract" label onto the canonical "Contract / Freelance"
  // name used everywhere else so we don't end up with two separate DB rows for it.
  for (const job of jobDefinitions) {
    if (job.employmentType?.name === 'Contract') {
      job.employmentType = { name: 'Contract / Freelance', code: 'contract' };
    }
  }

  // --- Rebuild the workingModel mix so REMOTE is meaningfully represented instead
  // of being completely absent (previously: ~65% Hybrid, ~35% Onsite, 0% Remote).
  const total = jobDefinitions.length;
  const workingModelPool = [
    ...Array(Math.round(total * 0.4)).fill('ONSITE'),
    ...Array(Math.round(total * 0.35)).fill('HYBRID'),
    ...Array(total).fill('REMOTE'),
  ].slice(0, total);
  const shuffledWorkingModels = shuffledIndexes(workingModelPool);

  jobDefinitions.forEach((job, index) => {
    const workingModel = shuffledWorkingModels[index];
    for (const location of job.locations || []) {
      location.workingModel = workingModel;
    }
  });

  // --- Re-derive publishedAt/expiredAt relative to "now" so they stay fresh every
  // time the seed runs, and spread with per-job hour/minute jitter across a wide
  // window so calendar-day clusters (and matching "Còn X ngày" badges) don't happen.
  for (const job of jobDefinitions) {
    const publishedDaysAgo = randomBetween(0, 60);
    const publishedAt = addDays(now, -publishedDaysAgo);
    publishedAt.setHours(randomBetween(7, 21), randomBetween(0, 59), randomBetween(0, 59), 0);

    const expiredInDays = randomBetween(2, 60);
    const expiredAt = addDays(now, expiredInDays);
    expiredAt.setHours(23, 59, 0, 0);

    job.publishedAt = publishedAt.toISOString();
    job.expiredAt = expiredAt.toISOString();
  }

  return jobDefinitions;
}

const jobDetailsMap: Record<
  string,
  { description: string; requirements: string; benefits: string }
> = {
  'Backend Platform Engineer': {
    description:
      'We are seeking a Backend Platform Engineer to build and optimize our high-performance core engine services. You will design scale-out APIs, optimize DB queries, and implement asynchronous event workflows.',
    requirements:
      '- 3+ years experience with Node.js/TypeScript or Java.\n- Strong database knowledge (PostgreSQL, Redis).\n- Experience with microservices architecture and Docker.',
    benefits:
      '- Competitive salary & performance bonus.\n- Premium health care package.\n- Latest Macbook Pro provided.',
  },
  'Data Engineer': {
    description:
      'Join us as a Data Engineer to design, construct, and maintain reliable data workflows (ETL/ELT). You will help establish our data lakehouse to power analytics and LLM matching engines.',
    requirements:
      '- 3+ years of experience in data engineering.\n- Proficient in Python, SQL, and big data technologies (Spark/Hadoop).\n- Experience with AWS services (S3, Redshift, Glue).',
    benefits:
      '- Continuous learning sponsorship.\n- Hybrid working mode.\n- 15 days of annual leave.',
  },
  'Cloud QA Specialist': {
    description:
      'We are looking for a QA Specialist with a cloud/infrastructure focus. You will build end-to-end automation test suites, integration tests, and performance load tests on AWS environments.',
    requirements:
      '- 3+ years in software quality assurance.\n- Strong automation experience with Cypress, Selenium, or Playwright.\n- Solid understanding of CI/CD workflows & basic cloud networking.',
    benefits:
      '- Professional certification support (AWS/ISTQB).\n- Remote-friendly environment.\n- Competitive daily/monthly rates.',
  },
  'Integration Engineer': {
    description:
      'As an Integration Engineer, you will connect third-party platforms, design sync workflows, and create custom SDKs for our platform partners.',
    requirements:
      '- 2+ years experience in software development (TypeScript/Node.js).\n- Deep understanding of RESTful APIs, OAuth2, and webhook behaviors.\n- Good communication skills to coordinate with partners.',
    benefits: '- Annual health checks.\n- Dynamic and young team culture.\n- 13th-month salary.',
  },
  'Frontend React Engineer': {
    description:
      'We are hiring a Frontend React Engineer to build beautiful, responsive dashboard consoles. You will focus on component reusability, chart rendering, and optimal page load speeds.',
    requirements:
      '- 3+ years production experience with React and TypeScript.\n- Proficiency in CSS layout systems (Tailwind CSS, CSS modules).\n- Familiarity with modern bundlers like Vite/Webpack.',
    benefits:
      '- Modern office with snacks & drinks.\n- High-performance laptop of choice.\n- Regular team building activities.',
  },
  'Fresher Product Designer': {
    description:
      'Looking for a passionate Fresher Product Designer to collaborate with PMs and engineering to craft outstanding UI designs and candidate experiences.',
    requirements:
      '- Strong portfolio demonstrating UI design skills (Figma/Sketch).\n- Understanding of user-centered design principles and wireframing.\n- Basic knowledge of frontend limitations and components.',
    benefits:
      '- Structured mentorship program by senior designers.\n- Fun and creative working space.\n- Performance review every 6 months.',
  },
  'Lead DevOps Engineer': {
    description:
      'Lead our infrastructure operations, optimize cloud spend, maintain Kubernetes clusters, and champion security policies across the engineering organization.',
    requirements:
      '- 6+ years experience in DevOps/SysOps roles.\n- Hands-on expertise in AWS (EKS, VPC, IAM, RDS) and Terraform.\n- Strong leadership and team mentoring experience.',
    benefits:
      '- Top-tier compensation pack.\n- Flexible working hours.\n- Executive wellness program.',
  },
  'Fresher Growth Engineer': {
    description:
      'Join our growth hack team to design A/B testing, user onboarding paths, email trigger funnels, and search engine optimizations.',
    requirements:
      '- Fresh graduate or <1 year experience in software engineering.\n- Proficient in JavaScript/TypeScript (React/Node).\n- High curiosity, data-driven mind, and growth mindset.',
    benefits:
      '- Fast track career progression.\n- Mentoring by Chief Product Officer.\n- Monthly team lunches.',
  },
  'AI Engineer': {
    description:
      'Design and deploy AI features into our core product. You will tune open-source LLMs, build RAG workflows for resume matching, and optimize model inference times.',
    requirements:
      '- 4+ years of experience in ML/AI systems.\n- Expertise in Python, PyTorch/TensorFlow, and Hugging Face ecosystems.\n- Experience with vector databases (Pinecone, PGVector, Qdrant).',
    benefits:
      '- Tech conference sponsorship.\n- Stock options (ESOP) for key contributors.\n- Highly flexible remote workspace.',
  },
  'Mobile Engineer': {
    description:
      'Develop and maintain our cross-platform mobile application (React Native) for job seekers and recruiters on Android and iOS.',
    requirements:
      '- 2+ years developing mobile apps with React Native.\n- Understanding of native bridge, app store publishing, and push notifications.\n- Good UI sense and smooth animations.',
    benefits: '- Flexible part-time hours.\n- Tech hardware allowance.\n- Performance bonus.',
  },
  'Support Analyst Intern': {
    description:
      'Learn tech support operations by assisting customers, triaging bugs, translating system issues into Jira tasks, and verifying fixes.',
    requirements:
      '- Final year student in IT or related fields.\n- Basic understanding of web applications, APIs, and databases.\n- Good English communication skills.',
    benefits:
      '- Monthly internship allowance.\n- Clear pathway to full-time junior roles.\n- Training on professional tools (Jira, Postman).',
  },
  'UX Researcher': {
    description:
      'Conduct user research, design surveys, perform usability testing sessions, and present actionable insights to product teams.',
    requirements:
      '- 2+ years of experience in UX Research/Design.\n- Experience with qualitative and quantitative research methods.\n- Excellent empathy, listening, and analytical skills.',
    benefits:
      '- Competitive contract rates.\n- Remote work options.\n- Multi-national team collaboration.',
  },
  'Security Engineering Manager': {
    description:
      'Oversee and lead the security initiatives. You will define security benchmarks, orchestrate pen-testing, audit identity systems, and manage security incidents.',
    requirements:
      '- 7+ years in cyber security and application security.\n- Certified CISSP, CISM, or equivalent security certifications.\n- Strong manager background with team coordination skills.',
    benefits:
      '- Premium package with health + wellness insurance.\n- Share options.\n- Annual overseas retreat.',
  },
  'Technical Writer Intern': {
    description:
      'Write developer guides, API documentations, user FAQs, and internal architecture documentations.',
    requirements:
      '- Excellent written English skills.\n- Basic knowledge of HTML, Markdown, and Git.\n- Passion for technical documentation and teaching.',
    benefits:
      '- Mentorship in technical communication.\n- Flexible hours to match university schedule.\n- Internship certificate.',
  },
  'CRM Specialist': {
    description:
      'Configure and optimize our CRM workflows, sales funnels, and marketing emails to engage enterprise clients.',
    requirements:
      '- 2+ years in CRM management (HubSpot, Salesforce, or Zoho).\n- Solid data analysis skills and experience with SQL queries.\n- Excellent communication and marketing sense.',
    benefits: '- Product sales commissions.\n- Health insurance.\n- Dynamic working team.',
  },
  'Platform Reliability Engineer': {
    description:
      'Ensure the reliability and performance of our core platform. You will build observability dashboards, set SLOs/SLIs, and automate recovery procedures.',
    requirements:
      '- 4+ years in SRE or Backend roles.\n- Proficient in AWS infrastructure, Prometheus, Grafana, and ELK stack.\n- Strong scripting skills (Python, Bash, or Go).',
    benefits:
      '- On-call compensation allowance.\n- Premium medical coverage.\n- Hybrid work flexibility.',
  },
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
    /postgres|postgresql|mysql|mongo|redis|prisma|database|db|sql|nosql|oracle|cassandra|mariadb|sqlite|dynamodb|snowflake|warehouse/i.test(
      lowerName,
    )
  ) {
    return categories['Databases & Storage'].id;
  }

  // Cloud & DevOps
  if (
    /aws|azure|gcp|docker|kubernetes|devops|ci\/cd|jenkins|terraform|ansible|cloud|k8s|argocd|linux|unix|nginx|kafka|rabbitmq|system admin|network|monitoring|vmware/i.test(
      lowerName,
    )
  ) {
    return categories['Cloud & DevOps'].id;
  }

  // Artificial Intelligence & Data Science (using word boundaries for short names like ai, ml)
  if (
    /data science|data analysis|data engineering|data warehousing|etl|deep learning|machine learning|nlp|spark|hadoop|tableau|power bi|llm|gpt|openai|tensorflow|pytorch|blockchain/i.test(
      lowerName,
    ) ||
    /\b(ai|ml)\b/i.test(lowerName)
  ) {
    return categories['Data & AI'].id;
  }

  // Frameworks & Libraries
  if (
    /react|reactjs|react native|next|vue|angular|nest|node|django|spring|express|laravel|symfony|asp\.net|\.net|winforms|jquery|flask|fastapi|nuxt|svelte|flutter/i.test(
      lowerName,
    )
  ) {
    return categories['Frameworks & Libraries'].id;
  }

  // Programming Languages (with word boundaries for short names like go, c, r, js, ts)
  if (
    /typescript|javascript|python|java|c\+\+|ruby|php|c#|kotlin|swift|rust|html|css|golang/i.test(
      lowerName,
    ) ||
    /\b(go|c|r|js|ts)\b/i.test(lowerName)
  ) {
    return categories['Programming Languages'].id;
  }

  // Design & Product
  if (
    /figma|sketch|xd|photoshop|illustrator|ui\/ux|ui-ux|design|product management|product owner|business analysis|project management|agile|scrum/i.test(
      lowerName,
    )
  ) {
    return categories['Design & Product'].id;
  }

  // Testing & QA
  if (
    /qa|test|jest|cypress|selenium|playwright|manual|automation|junit|mocha|api testing/i.test(
      lowerName,
    )
  ) {
    return categories['Testing & QA'].id;
  }

  return categories['Others'].id;
}

const inferredSkillNames = [
  'API',
  'Database',
  'Cloud',
  'RESTful API',
  'Microservices',
  'OOP',
  'Design Patterns',
  'System Design',
  'System Architecture',
  'Software Architecture',
  'Solution Architecture',
  'NodeJS',
  'ReactJS',
  'React Native',
  'Flutter',
  'ASP.NET',
  'SQL Server',
  'Oracle',
  'Linux',
  'Unix',
  'Kafka',
  'RabbitMQ',
  'Nginx',
  'Terraform',
  'Jenkins',
  'ETL',
  'Spark',
  'Data Analysis',
  'Data Engineering',
  'Data Warehousing',
  'Power BI',
  'Tableau',
  'Snowflake',
  'Business Analysis',
  'UI/UX',
  'Scrum',
  'Selenium',
  'Playwright',
  'API Testing',
  'Test Case',
  'System Admin',
  'Networking',
  'Security',
  'Cloud Security',
  'SIEM',
  'IAM',
  'English',
  'Mobile Development',
  'CRM',
  'User Research',
  'Wireframing',
  'Embedded',
  'Hardware',
  'C language',
];

const jobSkillInferenceRules: Array<{ name: string; pattern: RegExp }> = [
  { name: 'TypeScript', pattern: /\btypescript\b|\bts\b/i },
  { name: 'JavaScript', pattern: /\bjavascript\b|\bjs\b/i },
  { name: 'Java', pattern: /\bjava\b/i },
  { name: 'Python', pattern: /\bpython\b/i },
  { name: 'Go', pattern: /\bgolang\b|\bgo\b/i },
  { name: 'C#', pattern: /\bc#\b|c sharp/i },
  { name: 'C++', pattern: /\bc\+\+\b/i },
  { name: 'PHP', pattern: /\bphp\b/i },
  { name: 'Kotlin', pattern: /\bkotlin\b/i },
  { name: 'Swift', pattern: /\bswift\b/i },
  { name: 'Rust', pattern: /\brust\b/i },
  { name: 'NodeJS', pattern: /\bnode\.?js\b|\bnodejs\b/i },
  { name: 'NestJS', pattern: /\bnest\.?js\b|\bnestjs\b/i },
  { name: 'Express', pattern: /\bexpress\b/i },
  { name: 'Spring Boot', pattern: /\bspring boot\b/i },
  { name: '.NET', pattern: /\.net\b/i },
  { name: 'ASP.NET', pattern: /\basp\.net\b/i },
  { name: 'ReactJS', pattern: /\breact\.?js\b|\breactjs\b/i },
  { name: 'React Native', pattern: /\breact native\b/i },
  { name: 'Vue.js', pattern: /\bvue\.?js\b|\bvuejs\b/i },
  { name: 'Angular', pattern: /\bangular\b/i },
  { name: 'Next.js', pattern: /\bnext\.?js\b|\bnextjs\b/i },
  { name: 'Django', pattern: /\bdjango\b/i },
  { name: 'FastAPI', pattern: /\bfastapi\b/i },
  { name: 'Laravel', pattern: /\blaravel\b/i },
  { name: 'Flutter', pattern: /\bflutter\b/i },
  { name: 'HTML', pattern: /\bhtml5?\b/i },
  { name: 'CSS', pattern: /\bcss3?\b|tailwind/i },
  { name: 'Tailwind CSS', pattern: /\btailwind\b/i },
  { name: 'SQL', pattern: /\bsql\b/i },
  { name: 'PostgreSQL', pattern: /\bpostgresql\b|\bpostgres\b/i },
  { name: 'MySQL', pattern: /\bmysql\b/i },
  { name: 'MongoDB', pattern: /\bmongodb\b|\bmongo\b/i },
  { name: 'Redis', pattern: /\bredis\b/i },
  { name: 'Oracle', pattern: /\boracle\b/i },
  { name: 'SQL Server', pattern: /\bsql server\b|\bmssql\b/i },
  { name: 'Elasticsearch', pattern: /\belasticsearch\b|\belastic search\b/i },
  { name: 'AWS', pattern: /\baws\b|amazon web services/i },
  { name: 'Azure', pattern: /\bazure\b/i },
  { name: 'GCP', pattern: /\bgcp\b|google cloud/i },
  { name: 'Docker', pattern: /\bdocker\b/i },
  { name: 'Kubernetes', pattern: /\bkubernetes\b|\bk8s\b/i },
  { name: 'Terraform', pattern: /\bterraform\b/i },
  { name: 'Jenkins', pattern: /\bjenkins\b/i },
  { name: 'CI/CD', pattern: /\bci\/cd\b|\bcicd\b|continuous integration|continuous delivery/i },
  { name: 'Linux', pattern: /\blinux\b/i },
  { name: 'Unix', pattern: /\bunix\b/i },
  { name: 'Kafka', pattern: /\bkafka\b/i },
  { name: 'RabbitMQ', pattern: /\brabbitmq\b|\brabbit mq\b/i },
  { name: 'Nginx', pattern: /\bnginx\b/i },
  { name: 'Git', pattern: /\bgit\b/i },
  { name: 'QA', pattern: /\bqa\b|quality assurance/i },
  { name: 'Manual Testing', pattern: /manual test|manual testing/i },
  { name: 'QA Automation', pattern: /automation test|test automation|automated test/i },
  { name: 'Selenium', pattern: /\bselenium\b/i },
  { name: 'Playwright', pattern: /\bplaywright\b/i },
  { name: 'Cypress', pattern: /\bcypress\b/i },
  { name: 'Jest', pattern: /\bjest\b/i },
  { name: 'API Testing', pattern: /api testing|postman/i },
  { name: 'Machine Learning', pattern: /machine learning|\bml\b/i },
  { name: 'Deep Learning', pattern: /deep learning/i },
  { name: 'NLP', pattern: /\bnlp\b|natural language/i },
  { name: 'LLM', pattern: /\bllm\b|large language|generative ai|genai/i },
  { name: 'PyTorch', pattern: /\bpytorch\b/i },
  { name: 'TensorFlow', pattern: /\btensorflow\b/i },
  { name: 'Spark', pattern: /\bspark\b/i },
  { name: 'ETL', pattern: /\betl\b|elt\b/i },
  { name: 'Data Warehousing', pattern: /data warehouse|data warehousing/i },
  { name: 'Power BI', pattern: /power bi/i },
  { name: 'Tableau', pattern: /\btableau\b/i },
  { name: 'Snowflake', pattern: /\bsnowflake\b/i },
  { name: 'Project Management', pattern: /project management|project manager/i },
  { name: 'Business Analysis', pattern: /business analysis|business analyst|\bba\b/i },
  { name: 'Agile/Scrum', pattern: /\bagile\b/i },
  { name: 'Scrum', pattern: /\bscrum\b/i },
  { name: 'Product Management', pattern: /product management|product owner|product manager/i },
  { name: 'UI/UX', pattern: /ui\/ux|ui-ux|user experience|user interface/i },
  { name: 'Figma', pattern: /\bfigma\b/i },
  { name: 'Security', pattern: /\bsecurity\b|cybersecurity|vulnerability|penetration/i },
  { name: 'CRM', pattern: /\bcrm\b|customer relationship/i },
  { name: 'User Research', pattern: /user research|ux research/i },
  { name: 'Wireframing', pattern: /wireframe|wireframing|prototype|prototyping/i },
  { name: 'Embedded', pattern: /\bembedded\b|firmware|microcontroller/i },
  { name: 'Hardware', pattern: /\bhardware\b|iot|device/i },
  { name: 'C language', pattern: /\bc language\b|embedded c/i },
  { name: 'Cloud Security', pattern: /cloud security/i },
  { name: 'SIEM', pattern: /\bsiem\b/i },
  { name: 'IAM', pattern: /\biam\b|identity and access/i },
  { name: 'Networking', pattern: /\bnetwork\b|networking|tcp\/ip|vpn|firewall/i },
  { name: 'System Admin', pattern: /system admin|systems administrator|windows server|vmware/i },
  { name: 'RESTful API', pattern: /restful|rest api|\bapi\b/i },
  { name: 'Microservices', pattern: /microservice/i },
  { name: 'OOP', pattern: /\boop\b|object oriented/i },
  { name: 'Design Patterns', pattern: /design pattern/i },
  { name: 'System Design', pattern: /system design/i },
  { name: 'System Architecture', pattern: /system architecture/i },
  { name: 'Software Architecture', pattern: /software architecture|technical architect/i },
  { name: 'Solution Architecture', pattern: /solution architect|solution architecture/i },
  { name: 'English', pattern: /\benglish\b/i },
];

function pushUniqueSkill(target: string[], skillName: string) {
  if (!target.some((item) => item.toLowerCase() === skillName.toLowerCase())) {
    target.push(skillName);
  }
}

function inferJobSkillNames(input: {
  title?: string | null;
  categoryName?: string | null;
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  specializations?: Array<{ name?: string | null; slug?: string | null }>;
}) {
  const title = input.title || '';
  const categoryName = input.categoryName || '';
  const specializationText = (input.specializations || [])
    .map((item) => `${item.name || ''} ${item.slug || ''}`)
    .join(' ');
  const searchableText = [
    title,
    categoryName,
    specializationText,
    input.description || '',
    input.requirements || '',
    input.benefits || '',
  ].join(' ');
  const context = `${title} ${categoryName} ${specializationText}`;
  const inferred: string[] = [];

  for (const rule of jobSkillInferenceRules) {
    if (rule.pattern.test(searchableText)) {
      pushUniqueSkill(inferred, rule.name);
    }
  }

  if (/backend|back-end|server|api/i.test(context)) {
    ['RESTful API', 'Database', 'OOP', 'Git'].forEach((name) => pushUniqueSkill(inferred, name));
  }
  if (/frontend|front-end|web developer|ui developer/i.test(context)) {
    ['HTML', 'CSS', 'JavaScript', 'Git'].forEach((name) => pushUniqueSkill(inferred, name));
  }
  if (/fullstack|full-stack/i.test(context)) {
    ['JavaScript', 'RESTful API', 'Database', 'Git'].forEach((name) =>
      pushUniqueSkill(inferred, name),
    );
  }
  if (/devops|cloud|infrastructure|system|network/i.test(context)) {
    ['Linux', 'Docker', 'CI/CD', 'Cloud'].forEach((name) => pushUniqueSkill(inferred, name));
  }
  if (/data engineer/i.test(context)) {
    ['SQL', 'Python', 'ETL', 'Data Warehousing'].forEach((name) => pushUniqueSkill(inferred, name));
  } else if (/data analyst|business intelligence|\bbi\b/i.test(context)) {
    ['SQL', 'Data Analysis', 'Power BI'].forEach((name) => pushUniqueSkill(inferred, name));
  }
  if (/\bai\b|machine learning|data science|researcher/i.test(context)) {
    ['Python', 'Machine Learning', 'Deep Learning'].forEach((name) =>
      pushUniqueSkill(inferred, name),
    );
  }
  if (/qa|tester|quality/i.test(context)) {
    ['QA', 'Manual Testing', 'QA Automation', 'API Testing'].forEach((name) =>
      pushUniqueSkill(inferred, name),
    );
  }
  if (/project manager|product owner|scrum master/i.test(context)) {
    ['Project Management', 'Agile/Scrum', 'English'].forEach((name) =>
      pushUniqueSkill(inferred, name),
    );
  }
  if (/business analyst|\bba\b/i.test(context)) {
    ['Business Analysis', 'SQL', 'Agile/Scrum', 'English'].forEach((name) =>
      pushUniqueSkill(inferred, name),
    );
  }
  if (/security/i.test(context)) {
    ['Security', 'Networking', 'Cloud Security'].forEach((name) => pushUniqueSkill(inferred, name));
  }
  if (/mobile|android|ios/i.test(context)) {
    ['Mobile Development', 'API', 'Git'].forEach((name) => pushUniqueSkill(inferred, name));
  }
  if (/product designer|ux researcher|ux designer|ui designer|product design/i.test(context)) {
    ['Figma', 'UI/UX', 'Product Design', 'Wireframing', 'User Research'].forEach((name) =>
      pushUniqueSkill(inferred, name),
    );
  }
  if (/\bcrm\b|crm specialist/i.test(context)) {
    ['CRM', 'SQL', 'Data Analysis', 'Business Analysis'].forEach((name) =>
      pushUniqueSkill(inferred, name),
    );
  }
  if (/embedded|firmware|hardware/i.test(context)) {
    ['Embedded', 'C language', 'C++', 'Linux', 'Hardware'].forEach((name) =>
      pushUniqueSkill(inferred, name),
    );
  }

  return inferred;
}

const jobTextHeadingPatterns = [
  'Responsibilities',
  'Responsibility',
  'Key Responsibilities',
  'Key Accountabilities',
  'Job Purpose',
  'Expectations',
  'Requirements',
  'Required Skills',
  'Required Qualifications',
  'Must have',
  'Nice to have',
  'Qualifications',
  'Education',
  'Professional Experience',
  'Technical Skills',
  'Benefits',
  'Salary & Allowances',
  'Career Growth',
  'Working Environment',
  'What You Will Do',
  "What You'll Do",
  'What You Bring',
  "What You'll Bring",
  "Why You'll Love Working Here",
  'YÊU CẦU CÔNG VIỆC',
  'Yêu cầu công việc',
  'Mô tả công việc',
  'Trách nhiệm',
  'Nhiệm vụ',
  'Quyền lợi',
  'Phúc lợi',
  'Ưu tiên',
  'Kinh nghiệm',
  'Trình độ',
  'Chế độ đãi ngộ',
];

const compactSentenceBoundaryPattern =
  /([a-zàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ0-9\)])([.!?。])(?=([A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]))/g;

function formatJobRichText(text: string | null | undefined, fallbackHeading: string) {
  if (!text) return null;

  let normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return null;

  for (const heading of jobTextHeadingPatterns) {
    const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(
      new RegExp(`([^\\n])(${escapedHeading})(:?)(?=\\s|[A-ZÀ-Ỵ]|$)`, 'g'),
      '$1\n\n$2$3\n',
    );
  }

  normalized = normalized
    .replace(compactSentenceBoundaryPattern, '$1$2\n')
    .replace(/([:：])(?=\s*[A-ZÀ-Ỵ])/g, '$1\n')
    .replace(
      /([.!?])\s+(?=(?:Develop|Design|Build|Implement|Maintain|Collaborate|Work|Participate|Support|Ensure|Manage|Lead|Review|Create|Optimize|Debug|Write|Analyze|Monitor|Report|Coordinate|Tham gia|Thực hiện|Phối hợp|Xây dựng|Thiết kế|Triển khai|Phát triển|Quản lý|Hỗ trợ|Đảm bảo|Nghiên cứu|Tối ưu|Kiểm tra|Báo cáo)\b)/g,
      '$1\n',
    )
    .replace(/\s*[-•]\s+/g, '\n- ')
    .trim();

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const formattedLines: string[] = [];

  for (const line of lines) {
    const isKnownHeading = jobTextHeadingPatterns.some(
      (heading) => line.replace(/:$/, '').toLowerCase() === heading.toLowerCase(),
    );
    const isBullet = /^[-•]\s+/.test(line);
    const isShortLabel = /^[A-ZÀ-Ỵ][^.!?]{2,70}:$/.test(line);

    if (isKnownHeading) {
      formattedLines.push('', line.replace(/:$/, ''));
      continue;
    }

    if (isShortLabel) {
      formattedLines.push('', line.replace(/:$/, ''));
      continue;
    }

    if (isBullet) {
      formattedLines.push(line.replace(/^•\s+/, '- '));
      continue;
    }

    if (line.length > 260 && /;\s/.test(line)) {
      const chunks = line
        .split(/(?<=;)\s+/)
        .map((chunk) => chunk.replace(/[;,]$/, '').trim())
        .filter(Boolean);

      if (chunks.length >= 3) {
        chunks.forEach((chunk) => formattedLines.push(`- ${chunk}`));
        continue;
      }
    }

    formattedLines.push(shouldRenderJobLineAsBullet(line, fallbackHeading) ? `- ${line}` : line);
  }

  const body = formattedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return `${fallbackHeading}\n\n${body}`;
}

function shouldRenderJobLineAsBullet(line: string, fallbackHeading: string) {
  if (fallbackHeading !== 'Mô tả công việc') return true;

  return /^(Develop|Design|Build|Implement|Maintain|Collaborate|Work|Participate|Support|Ensure|Manage|Lead|Review|Create|Optimize|Debug|Write|Analyze|Monitor|Report|Coordinate|Tham gia|Thực hiện|Phối hợp|Xây dựng|Thiết kế|Triển khai|Phát triển|Quản lý|Hỗ trợ|Đảm bảo|Nghiên cứu|Tối ưu|Kiểm tra|Báo cáo|Chuẩn hóa|Rà soát|Đọc|Bóc tách|Điều phối|Trao đổi|Sử dụng|Có khả năng)(?=\s|$)/.test(
    line,
  );
}

function formatJobAsHtmlDropdown(text: string | null | undefined, fallbackHeading: string) {
  if (!text) return '';

  const formatted = formatJobRichText(text, fallbackHeading);
  if (!formatted) return '';

  const cleanText = formatted.replace(new RegExp(`^${fallbackHeading}\\s*`), '').trim();

  const lines = cleanText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let htmlContent = '';
  let insideList = false;

  for (const line of lines) {
    if (line.startsWith('-')) {
      if (!insideList) {
        htmlContent +=
          '<ul style="margin-top: 6px; margin-bottom: 6px; padding-left: 20px; list-style-type: disc;">';
        insideList = true;
      }
      htmlContent += `<li style="margin-bottom: 5px;">${line.substring(1).trim()}</li>`;
    } else {
      if (insideList) {
        htmlContent += '</ul>';
        insideList = false;
      }
      if (line.endsWith(':') || line.length < 50) {
        htmlContent += `<p style="margin-top: 10px; margin-bottom: 4px; font-weight: bold; color: #0f172a;">${line}</p>`;
      } else {
        htmlContent += `<p style="margin-bottom: 6px; color: #334155;">${line}</p>`;
      }
    }
  }
  if (insideList) {
    htmlContent += '</ul>';
  }

  return `
<details style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px; background-color: #f8fafc; font-family: sans-serif;">
  <summary style="font-weight: bold; cursor: pointer; outline: none; color: #0f172a; font-size: 15px; user-select: none;">
    ${fallbackHeading}
  </summary>
  <div style="margin-top: 8px; font-size: 14px; line-height: 1.6;">
    ${htmlContent}
  </div>
</details>
  `.trim();
}

type SeedLocationDetail = {
  city: string;
  district: string;
  address: string;
};

const vietnamLocationPools: Record<string, SeedLocationDetail[]> = {
  hcm: [
    { city: 'Hồ Chí Minh', district: 'Quận 1', address: 'Nguyễn Huệ' },
    { city: 'Hồ Chí Minh', district: 'Quận Bình Thạnh', address: 'Điện Biên Phủ' },
    { city: 'Hồ Chí Minh', district: 'Quận 3', address: 'Cách Mạng Tháng Tám' },
    { city: 'Hồ Chí Minh', district: 'Thành phố Thủ Đức', address: 'Xa Lộ Hà Nội' },
    { city: 'Hồ Chí Minh', district: 'Quận 7', address: 'Nguyễn Văn Linh' },
    { city: 'Hồ Chí Minh', district: 'Quận Tân Bình', address: 'Cộng Hòa' },
    { city: 'Hồ Chí Minh', district: 'Khu vực Thủ Dầu Một', address: 'Đại lộ Bình Dương' },
    { city: 'Hồ Chí Minh', district: 'Khu vực Vũng Tàu', address: 'Ba Cu' },
  ],
  hanoi: [
    { city: 'Hà Nội', district: 'Quận Cầu Giấy', address: 'Dịch Vọng Hậu' },
    { city: 'Hà Nội', district: 'Quận Đống Đa', address: 'Chùa Bộc' },
    { city: 'Hà Nội', district: 'Quận Ba Đình', address: 'Kim Mã' },
    { city: 'Hà Nội', district: 'Quận Hai Bà Trưng', address: 'Đại Cồ Việt' },
    { city: 'Hà Nội', district: 'Quận Hoàn Kiếm', address: 'Tràng Tiền' },
    { city: 'Hà Nội', district: 'Quận Nam Từ Liêm', address: 'Phạm Hùng' },
  ],
  danang: [
    { city: 'Đà Nẵng', district: 'Quận Hải Châu', address: 'Lê Duẩn' },
    { city: 'Đà Nẵng', district: 'Quận Sơn Trà', address: 'Võ Nguyên Giáp' },
    { city: 'Đà Nẵng', district: 'Quận Thanh Khê', address: 'Nguyễn Văn Linh' },
    { city: 'Đà Nẵng', district: 'Quận Cẩm Lệ', address: 'Cách Mạng Tháng Tám' },
  ],
  cantho: [
    { city: 'Cần Thơ', district: 'Quận Ninh Kiều', address: 'Đại lộ Hòa Bình' },
    { city: 'Cần Thơ', district: 'Quận Cái Răng', address: 'Quốc lộ 1A' },
    { city: 'Cần Thơ', district: 'Quận Bình Thủy', address: 'Lê Hồng Phong' },
  ],
  haiphong: [
    { city: 'Hải Phòng', district: 'Quận Ngô Quyền', address: 'Lê Hồng Phong' },
    { city: 'Hải Phòng', district: 'Quận Hồng Bàng', address: 'Điện Biên Phủ' },
    { city: 'Hải Phòng', district: 'Quận Lê Chân', address: 'Tô Hiệu' },
  ],
  dongnai: [
    { city: 'Đồng Nai', district: 'Thành phố Biên Hòa', address: 'Võ Thị Sáu' },
    { city: 'Đồng Nai', district: 'Huyện Long Thành', address: 'Quốc lộ 51' },
    { city: 'Đồng Nai', district: 'Thành phố Long Khánh', address: 'Hùng Vương' },
  ],
  bacninh: [
    { city: 'Bắc Ninh', district: 'Thành phố Bắc Ninh', address: 'Lý Thái Tổ' },
    { city: 'Bắc Ninh', district: 'Thành phố Từ Sơn', address: 'Trần Phú' },
    { city: 'Bắc Ninh', district: 'Huyện Tiên Du', address: 'KCN Tiên Sơn' },
  ],
  hue: [
    { city: 'Huế', district: 'Khu vực Thuận Hóa', address: 'Lê Lợi' },
    { city: 'Huế', district: 'Khu vực Hương Thủy', address: 'Nguyễn Tất Thành' },
  ],
  khanhhoa: [
    { city: 'Khánh Hòa', district: 'Thành phố Nha Trang', address: 'Trần Phú' },
    { city: 'Khánh Hòa', district: 'Thành phố Cam Ranh', address: 'Nguyễn Tất Thành' },
  ],
  lamdong: [
    { city: 'Lâm Đồng', district: 'Thành phố Đà Lạt', address: 'Trần Phú' },
    { city: 'Lâm Đồng', district: 'Thành phố Bảo Lộc', address: 'Nguyễn Công Trứ' },
  ],
  tayninh: [
    { city: 'Tây Ninh', district: 'Khu vực Tây Ninh', address: 'Cách Mạng Tháng Tám' },
    { city: 'Tây Ninh', district: 'Khu vực Tân An', address: 'Hùng Vương' },
    { city: 'Tây Ninh', district: 'Khu vực Đức Hòa', address: 'Tỉnh lộ 824' },
  ],
  quangninh: [
    { city: 'Quảng Ninh', district: 'Thành phố Hạ Long', address: 'Hạ Long' },
    { city: 'Quảng Ninh', district: 'Thành phố Cẩm Phả', address: 'Trần Phú' },
  ],
  thainguyen: [
    { city: 'Thái Nguyên', district: 'Thành phố Thái Nguyên', address: 'Hoàng Văn Thụ' },
    { city: 'Thái Nguyên', district: 'Thành phố Phổ Yên', address: 'KCN Yên Bình' },
  ],
};

const fallbackLocationKeys = [
  'hcm',
  'hanoi',
  'danang',
  'cantho',
  'haiphong',
  'dongnai',
  'bacninh',
  'hue',
  'khanhhoa',
  'lamdong',
  'tayninh',
  'quangninh',
  'thainguyen',
];

function getStableIndex(seed: string, length: number) {
  return Math.abs(createHash('md5').update(seed).digest().readInt32BE(0)) % length;
}

function getLocationKey(cityInput: string | null) {
  const cleanCity = (cityInput || '').trim().toLowerCase();

  if (
    cleanCity.includes('ho chi minh') ||
    cleanCity.includes('hcm') ||
    cleanCity.includes('sai gon')
  ) {
    return 'hcm';
  }
  if (cleanCity.includes('ha noi') || cleanCity.includes('hanoi')) return 'hanoi';
  if (cleanCity.includes('da nang') || cleanCity.includes('danang')) return 'danang';
  if (cleanCity.includes('can tho') || cleanCity.includes('cantho')) return 'cantho';
  if (cleanCity.includes('hai phong') || cleanCity.includes('haiphong')) return 'haiphong';
  if (
    cleanCity.includes('binh duong') ||
    cleanCity.includes('vung tau') ||
    cleanCity.includes('ba ria')
  ) {
    return 'hcm';
  }
  if (cleanCity.includes('dong nai') || cleanCity.includes('bien hoa')) return 'dongnai';
  if (cleanCity.includes('bac ninh')) return 'bacninh';
  if (cleanCity.includes('hue') || cleanCity.includes('thua thien')) return 'hue';
  if (cleanCity.includes('khanh hoa') || cleanCity.includes('nha trang')) return 'khanhhoa';
  if (cleanCity.includes('lam dong') || cleanCity.includes('da lat')) return 'lamdong';
  if (cleanCity.includes('tay ninh') || cleanCity.includes('long an')) return 'tayninh';
  if (cleanCity.includes('quang ninh') || cleanCity.includes('ha long')) return 'quangninh';
  if (cleanCity.includes('thai nguyen')) return 'thainguyen';

  return fallbackLocationKeys[
    getStableIndex(cleanCity || 'vietnam-location', fallbackLocationKeys.length)
  ];
}

function getRandomLocationDetails(
  cityInput: string | null,
  seedInput = '',
): {
  city: string;
  district: string;
  address: string;
} {
  const locationKey = getLocationKey(cityInput);
  const pool = vietnamLocationPools[locationKey];
  const seed = `${cityInput || 'vietnam-location'}:${seedInput || locationKey}`;
  const randomDetail = pool[getStableIndex(seed, pool.length)];
  const streetNumber = getStableIndex(`${seed}:street-number`, 299) + 1;

  return {
    city: randomDetail.city,
    district: randomDetail.district,
    address: `${streetNumber} ${randomDetail.address}`,
  };
}

const seedLogoColors = [
  '2563EB',
  '0F766E',
  '7C3AED',
  'C2410C',
  'BE123C',
  '047857',
  '4338CA',
  'B45309',
  '0369A1',
  '4D7C0F',
];

function getCompanyLogoUrl(name: string, seed: string) {
  const background = seedLogoColors[getStableIndex(seed, seedLogoColors.length)];
  const encodedName = encodeURIComponent(name || seed || 'Company');

  return `https://ui-avatars.com/api/?name=${encodedName}&background=${background}&color=fff&size=160&bold=true&format=png`;
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

  const cleanupCompanyData = loadCompanySeedCleanupData();
  const realCompanyIds = cleanupCompanyData.companies?.map((c: any) => c.id) || [];
  const realRecruiterIds = cleanupCompanyData.recruiters?.map((r: any) => r.id) || [];
  const realRecruiterEmails = cleanupCompanyData.recruiters?.map((r: any) => r.email) || [];

  const backupCandidatesPath = path.join(__dirname, 'data/candidates_real.json');
  let realCandidateEmails: string[] = [];
  if (fs.existsSync(backupCandidatesPath)) {
    try {
      const candidatesRealRaw = JSON.parse(fs.readFileSync(backupCandidatesPath, 'utf8'));
      realCandidateEmails = candidatesRealRaw.map((c: any) => c.email);
    } catch (e) {}
  }

  const candidatesJsonPath = path.join(__dirname, 'candidates.json');
  let staticCandidateEmails: string[] = [];
  if (fs.existsSync(candidatesJsonPath)) {
    try {
      const candidatesData = JSON.parse(fs.readFileSync(candidatesJsonPath, 'utf8'));
      staticCandidateEmails = candidatesData.map((c: any) => c.email);
    } catch (e) {}
  }

  const candidateAccounts = await prisma.candidateAccount.findMany({
    where: {
      OR: [
        {
          email: {
            startsWith: SEED_EMAIL_PREFIX,
          },
        },
        {
          email: {
            in: [...realCandidateEmails, ...staticCandidateEmails],
          },
        },
      ],
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
      OR: [
        {
          email: {
            startsWith: `${SEED_EMAIL_PREFIX}recruiter.`,
          },
        },
        {
          id: {
            in: realRecruiterIds,
          },
        },
        {
          email: {
            in: realRecruiterEmails,
          },
        },
      ],
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
        {
          companyId: {
            in: realCompanyIds,
          },
        },
      ],
    },
    select: {
      id: true,
    },
  });

  const jobIds = jobPosts.map((job) => job.id);

  if (realCompanyIds.length > 0) {
    // Reports on these reviews live on the polymorphic `Report` table, so they are
    // matched by target rather than through a relation.
    const seededCompanyReviewIds = (
      await prisma.companyReview.findMany({
        where: { companyId: { in: realCompanyIds } },
        select: { id: true },
      })
    ).map((review) => review.id);

    if (seededCompanyReviewIds.length > 0) {
      await prisma.report.deleteMany({
        where: { targetType: 'COMPANY_REVIEW', targetId: { in: seededCompanyReviewIds } },
      });
    }

    await prisma.companyReview.deleteMany({
      where: {
        companyId: {
          in: realCompanyIds,
        },
      },
    });
  }

  // Clear chat, messages, participants, support cases and outreach to prevent FK violations
  await prisma.conversation.updateMany({
    data: { latestMessageId: null },
  });
  await prisma.talentContactRequest.updateMany({
    data: { currentAttemptId: null },
  });
  await prisma.talentContactAttempt.deleteMany({});
  await prisma.talentContactRequest.deleteMany({});
  await prisma.supportCaseAssignmentHistory.deleteMany({});
  await prisma.supportCaseStatusHistory.deleteMany({});
  await prisma.supportCase.deleteMany({});
  await prisma.messageAttachment.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.conversationParticipant.deleteMany({});
  await prisma.conversation.deleteMany({});

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

      await prisma.applicationAiScore.deleteMany({
        where: {
          applicationId: {
            in: applicationIds,
          },
        },
      });

      await prisma.applicationAssignment.deleteMany({
        where: {
          applicationId: {
            in: applicationIds,
          },
        },
      });

      const conversationIds = (
        await prisma.conversation.findMany({
          where: {
            applicationId: {
              in: applicationIds,
            },
          },
          select: {
            id: true,
          },
        })
      ).map((c) => c.id);

      if (conversationIds.length > 0) {
        await prisma.conversation.updateMany({
          where: {
            id: {
              in: conversationIds,
            },
          },
          data: {
            latestMessageId: null,
          },
        });
        await prisma.messageAttachment.deleteMany({
          where: {
            conversationId: {
              in: conversationIds,
            },
          },
        });
        await prisma.message.deleteMany({
          where: {
            conversationId: {
              in: conversationIds,
            },
          },
        });
        await prisma.conversationParticipant.deleteMany({
          where: {
            conversationId: {
              in: conversationIds,
            },
          },
        });
        await prisma.conversation.deleteMany({
          where: {
            id: {
              in: conversationIds,
            },
          },
        });
      }
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
    const candidateAppIds = (
      await prisma.application.findMany({
        where: {
          candidateProfileId: {
            in: candidateProfileIds,
          },
        },
        select: {
          id: true,
        },
      })
    ).map((application) => application.id);

    if (candidateAppIds.length > 0) {
      await prisma.interviewLog.deleteMany({
        where: {
          interview: {
            applicationId: {
              in: candidateAppIds,
            },
          },
        },
      });

      await prisma.interview.deleteMany({
        where: {
          applicationId: {
            in: candidateAppIds,
          },
        },
      });

      await prisma.applicationStatusLog.deleteMany({
        where: {
          applicationId: {
            in: candidateAppIds,
          },
        },
      });

      await prisma.applicationAiScore.deleteMany({
        where: {
          applicationId: {
            in: candidateAppIds,
          },
        },
      });

      await prisma.applicationAssignment.deleteMany({
        where: {
          applicationId: {
            in: candidateAppIds,
          },
        },
      });

      const conversationIds = (
        await prisma.conversation.findMany({
          where: {
            applicationId: {
              in: candidateAppIds,
            },
          },
          select: {
            id: true,
          },
        })
      ).map((c) => c.id);

      if (conversationIds.length > 0) {
        await prisma.conversation.updateMany({
          where: {
            id: {
              in: conversationIds,
            },
          },
          data: {
            latestMessageId: null,
          },
        });
        await prisma.messageAttachment.deleteMany({
          where: {
            conversationId: {
              in: conversationIds,
            },
          },
        });
        await prisma.message.deleteMany({
          where: {
            conversationId: {
              in: conversationIds,
            },
          },
        });
        await prisma.conversationParticipant.deleteMany({
          where: {
            conversationId: {
              in: conversationIds,
            },
          },
        });
        await prisma.conversation.deleteMany({
          where: {
            id: {
              in: conversationIds,
            },
          },
        });
      }
    }

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

    await prisma.fileAsset.deleteMany({
      where: {
        ownerId: {
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

  await prisma.companyLocation.deleteMany({
    where: {
      jobPostLocations: {
        none: {},
      },
    },
  });

  await prisma.recruiterAccount.deleteMany({
    where: {
      OR: [
        {
          email: {
            startsWith: `${SEED_EMAIL_PREFIX}recruiter.`,
          },
        },
        {
          id: {
            in: realRecruiterIds,
          },
        },
        {
          email: {
            in: realRecruiterEmails,
          },
        },
      ],
    },
  });

  await prisma.invoice.deleteMany({
    where: {
      company: {
        OR: [
          {
            taxCode: {
              startsWith: SEED_TAX_CODE_PREFIX,
            },
          },
          {
            id: {
              in: realCompanyIds,
            },
          },
        ],
      },
    },
  });

  await prisma.companySubscription.deleteMany({
    where: {
      company: {
        OR: [
          {
            taxCode: {
              startsWith: SEED_TAX_CODE_PREFIX,
            },
          },
          {
            id: {
              in: realCompanyIds,
            },
          },
        ],
      },
    },
  });

  // Only delete seed subscription plans that have no dependent subscriptions or invoices
  await prisma.subscriptionPlan.deleteMany({
    where: {
      createdByAdmin: {
        email: {
          endsWith: '@upnext.dev',
        },
      },
      companySubscriptions: { none: {} },
      invoices: { none: {} },
    },
  });

  // Mark remaining admin seed plans as inactive & hidden instead of hard-deleting
  await prisma.subscriptionPlan.updateMany({
    where: {
      createdByAdmin: {
        email: {
          endsWith: '@upnext.dev',
        },
      },
    },
    data: {
      status: 'INACTIVE',
      isPublic: false,
    },
  });

  await prisma.company.deleteMany({
    where: {
      OR: [
        {
          taxCode: {
            startsWith: SEED_TAX_CODE_PREFIX,
          },
        },
        {
          id: {
            in: realCompanyIds,
          },
        },
      ],
    },
  });

  await prisma.candidateAccount.deleteMany({
    where: {
      OR: [
        {
          email: {
            startsWith: SEED_EMAIL_PREFIX,
          },
        },
        {
          email: {
            in: [...realCandidateEmails, ...staticCandidateEmails],
          },
        },
      ],
    },
  });

  const realFileAssetIds = cleanupCompanyData.fileAssets?.map((asset: any) => asset.id) || [];

  await prisma.fileAsset.deleteMany({
    where: {
      OR: [
        {
          storageKey: {
            startsWith: SEED_STORAGE_PREFIX,
          },
        },
        {
          storageKey: {
            startsWith: 'imported/',
          },
        },
        {
          id: {
            in: realFileAssetIds,
          },
        },
      ],
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
    {
      name: 'Moderate Jobs',
      code: 'jobs:moderate',
      module: 'jobs',
      description: 'Duyệt hoặc từ chối tin tuyển dụng.',
    },
    {
      name: 'View Jobs',
      code: 'jobs:view',
      module: 'jobs',
      description: 'Xem tất cả tin tuyển dụng.',
    },
    {
      name: 'Manage Applications',
      code: 'applications:manage',
      module: 'applications',
      description: 'Can thiệp quản trị vào hồ sơ ứng tuyển khi có phê duyệt.',
    },
    {
      name: 'Manage Interviews',
      code: 'interviews:manage',
      module: 'interviews',
      description: 'Can thiệp quản trị vào lịch phỏng vấn khi có phê duyệt.',
    },
    // companies
    {
      name: 'Verify Companies',
      code: 'companies:verify',
      module: 'companies',
      description: 'Xác thực giấy phép kinh doanh của doanh nghiệp.',
    },
    {
      name: 'Lock Companies',
      code: 'companies:lock',
      module: 'companies',
      description: 'Khóa hoặc mở khóa tài khoản doanh nghiệp.',
    },
    {
      name: 'View Companies',
      code: 'companies:view',
      module: 'companies',
      description: 'Xem tất cả thông tin doanh nghiệp.',
    },
    // users
    {
      name: 'Moderate Users',
      code: 'users:moderate',
      module: 'users',
      description: 'Khóa hoặc mở khóa tài khoản ứng viên/nhà tuyển dụng.',
    },
    {
      name: 'View Users',
      code: 'users:view',
      module: 'users',
      description: 'Xem thông tin chi tiết tài khoản người dùng.',
    },
    // billing
    {
      name: 'Manage Plans',
      code: 'billing:plans',
      module: 'billing',
      description: 'Quản lý các gói dịch vụ và giá cả.',
    },
    {
      name: 'View Invoices',
      code: 'billing:invoices',
      module: 'billing',
      description: 'Tra cứu và kiểm tra hóa đơn thanh toán.',
    },
    // moderation
    {
      name: 'Handle Reports',
      code: 'reports:handle',
      module: 'moderation',
      description: 'Xử lý các báo cáo vi phạm từ người dùng.',
    },
    {
      name: 'Handle Appeals',
      code: 'appeals:handle',
      module: 'moderation',
      description: 'Xử lý các khiếu nại khóa tài khoản/tin đăng.',
    },
    // content
    {
      name: 'Manage Posts',
      code: 'posts:manage',
      module: 'content',
      description: 'Tạo, sửa, xóa và xuất bản bài viết blog/tin tức.',
    },
    {
      name: 'Moderate Reviews',
      code: 'reviews:moderate',
      module: 'content',
      description: 'Kiểm duyệt, ẩn hoặc phê duyệt đánh giá công ty.',
    },
    // support
    ...[
      'sales:handle',
      'billing:handle',
      'job_review:handle',
      'company_verification:handle',
      'technical:handle',
      'general:handle',
      'assign',
      'transfer',
      'resolve',
      'close',
      'reopen',
      'view_all',
    ].map((action) => ({
      name: `Support ${action}`,
      code: `support:${action}`,
      module: 'support',
      description: `Support permission: ${action}`,
    })),
    // system
    {
      name: 'Manage Config',
      code: 'system:config',
      module: 'system',
      description: 'Quản trị cấu hình toàn hệ thống.',
    },
    {
      name: 'View Audit Logs',
      code: 'system:audit',
      module: 'system',
      description: 'Xem nhật ký hoạt động hệ thống của Admin.',
    },
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
      permissionCodes: adminPermissionsDefinitions.map((p) => p.code),
    },
    {
      code: 'MODERATOR',
      name: 'Content Moderator',
      description: 'Kiểm duyệt tin tuyển dụng, bài viết và đánh giá công ty.',
      permissionCodes: [
        'jobs:moderate',
        'jobs:view',
        'reviews:moderate',
        'posts:manage',
        'support:job_review:handle',
        'support:assign',
        'support:resolve',
        'support:close',
        'support:reopen',
      ],
    },
    {
      code: 'COMPLIANCE',
      name: 'Compliance Officer',
      description: 'Xác thực doanh nghiệp, xử lý báo cáo vi phạm và khiếu nại.',
      permissionCodes: [
        'companies:verify',
        'companies:lock',
        'companies:view',
        'reports:handle',
        'appeals:handle',
        'users:moderate',
        'users:view',
        'support:company_verification:handle',
        'support:assign',
        'support:resolve',
        'support:close',
        'support:reopen',
      ],
    },
    {
      code: 'FINANCE',
      name: 'Finance & Billing',
      description: 'Quản lý gói dịch vụ và kiểm tra hóa đơn thanh toán.',
      permissionCodes: [
        'billing:plans',
        'billing:invoices',
        'companies:view',
        'support:billing:handle',
        'support:assign',
        'support:resolve',
        'support:close',
        'support:reopen',
      ],
    },
    {
      code: 'SUPPORT',
      name: 'Support Specialist',
      description: 'Hỗ trợ khách hàng, xem log hệ thống và thông tin cơ bản.',
      permissionCodes: [
        'jobs:view',
        'companies:view',
        'users:view',
        'system:audit',
        'support:sales:handle',
        'support:technical:handle',
        'support:general:handle',
        'support:assign',
        'support:transfer',
        'support:resolve',
        'support:close',
        'support:reopen',
      ],
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
    basic: await prisma.subscriptionPlan.upsert({
      where: { code: 'RECRUITER_BASIC' },
      update: {
        subscriptionName: 'Basic Trial',
        price: new Prisma.Decimal(0),
        description: 'Gói dùng thử miễn phí dành cho nhà tuyển dụng mới.',
        // Gói miễn phí là gói được cấp tự động, và mỗi lần nó hết hạn thì một
        // subscription mới được cấp với bộ đếm về 0 -- tức durationDays chính là chu
        // kỳ reset hạn mức của gói miễn phí. Ở 14 ngày, hạn mức AI của gói miễn phí
        // được làm mới hơn hai lần mỗi tháng, gấp đôi mức bảng giá công bố. 30 ngày
        // khớp với mọi gói còn lại và với phía ứng viên (CANDIDATE_FREE).
        durationDays: 30,
        boostCreditLimit: 0,
        jobPostLimit: 3,
        status: 'ACTIVE',
        isPublic: true,
        createdByAdminId: adminUser.id,
      },
      create: {
        code: 'RECRUITER_BASIC',
        subscriptionName: 'Basic Trial',
        price: new Prisma.Decimal(0),
        description: 'Gói dùng thử miễn phí dành cho nhà tuyển dụng mới.',
        // Gói miễn phí là gói được cấp tự động, và mỗi lần nó hết hạn thì một
        // subscription mới được cấp với bộ đếm về 0 -- tức durationDays chính là chu
        // kỳ reset hạn mức của gói miễn phí. Ở 14 ngày, hạn mức AI của gói miễn phí
        // được làm mới hơn hai lần mỗi tháng, gấp đôi mức bảng giá công bố. 30 ngày
        // khớp với mọi gói còn lại và với phía ứng viên (CANDIDATE_FREE).
        durationDays: 30,
        boostCreditLimit: 0,
        jobPostLimit: 3,
        status: 'ACTIVE',
        isPublic: true,
        createdByAdminId: adminUser.id,
      },
    }),
    standard: await prisma.subscriptionPlan.upsert({
      where: { code: 'RECRUITER_STANDARD' },
      update: {
        subscriptionName: 'Standard Plan',
        price: new Prisma.Decimal(490000),
        description: 'Gói tiêu chuẩn phù hợp cho doanh nghiệp vừa và nhỏ.',
        durationDays: 30,
        boostCreditLimit: 3,
        jobPostLimit: 10,
        status: 'ACTIVE',
        isPublic: true,
        createdByAdminId: adminUser.id,
      },
      create: {
        code: 'RECRUITER_STANDARD',
        subscriptionName: 'Standard Plan',
        price: new Prisma.Decimal(490000),
        description: 'Gói tiêu chuẩn phù hợp cho doanh nghiệp vừa và nhỏ.',
        durationDays: 30,
        boostCreditLimit: 3,
        jobPostLimit: 10,
        status: 'ACTIVE',
        isPublic: true,
        createdByAdminId: adminUser.id,
      },
    }),
    premium: await prisma.subscriptionPlan.upsert({
      where: { code: 'RECRUITER_PREMIUM' },
      update: {
        subscriptionName: 'Premium Plan',
        price: new Prisma.Decimal(1490000),
        description: 'Gói nâng cao không giới hạn cho các tập đoàn lớn.',
        durationDays: 30,
        boostCreditLimit: 10,
        jobPostLimit: 30,
        status: 'ACTIVE',
        isPublic: true,
        createdByAdminId: adminUser.id,
      },
      create: {
        code: 'RECRUITER_PREMIUM',
        subscriptionName: 'Premium Plan',
        price: new Prisma.Decimal(1490000),
        description: 'Gói nâng cao không giới hạn cho các tập đoàn lớn.',
        durationDays: 30,
        boostCreditLimit: 10,
        jobPostLimit: 30,
        status: 'ACTIVE',
        isPublic: true,
        createdByAdminId: adminUser.id,
      },
    }),
    customInactive: await prisma.subscriptionPlan.upsert({
      where: { code: 'RECRUITER_LEGACY' },
      update: {
        subscriptionName: 'Legacy Plan',
        price: new Prisma.Decimal(99000),
        description: 'Gói dịch vụ cũ đã ngưng cung cấp.',
        durationDays: 7,
        boostCreditLimit: 0,
        jobPostLimit: 1,
        status: 'INACTIVE',
        isPublic: false,
        createdByAdminId: adminUser.id,
      },
      create: {
        code: 'RECRUITER_LEGACY',
        subscriptionName: 'Legacy Plan',
        price: new Prisma.Decimal(99000),
        description: 'Gói dịch vụ cũ đã ngưng cung cấp.',
        durationDays: 7,
        boostCreditLimit: 0,
        jobPostLimit: 1,
        status: 'INACTIVE',
        isPublic: false,
        createdByAdminId: adminUser.id,
      },
    }),
    candidateFree: await prisma.subscriptionPlan.upsert({
      where: { code: 'CANDIDATE_FREE' },
      update: {
        audience: PlanAudience.CANDIDATE,
        subscriptionName: 'Candidate Free',
        price: new Prisma.Decimal(0),
        description: 'Gói cơ bản để ứng viên trải nghiệm trợ lý nghề nghiệp AI.',
        durationDays: 30,
        status: 'ACTIVE',
        isPublic: false,
        sortOrder: 10,
        createdByAdminId: adminUser.id,
      },
      create: {
        code: 'CANDIDATE_FREE',
        audience: PlanAudience.CANDIDATE,
        subscriptionName: 'Candidate Free',
        price: new Prisma.Decimal(0),
        description: 'Gói cơ bản để ứng viên trải nghiệm trợ lý nghề nghiệp AI.',
        durationDays: 30,
        status: 'ACTIVE',
        isPublic: false,
        sortOrder: 10,
        createdByAdminId: adminUser.id,
      },
    }),
    candidatePro: await prisma.subscriptionPlan.upsert({
      where: { code: 'CANDIDATE_PRO' },
      update: {
        audience: PlanAudience.CANDIDATE,
        subscriptionName: 'Candidate Pro',
        price: new Prisma.Decimal(99000),
        description: 'Gói nâng cao với nhiều lượt trợ lý AI hơn trong mỗi chu kỳ.',
        durationDays: 30,
        status: 'ACTIVE',
        // `candidateSandboxCheckout()` chỉ nhận gói có `isPublic`, nên để false thì
        // luồng nâng cấp của ứng viên trả SUBSCRIPTION_PLAN_NOT_AVAILABLE ở mọi lần
        // gọi -- và admin không bật lại được, vì `isPublic` không có trong
        // UpdateSubscriptionPlanDto. Bật ở đây để luồng đã bàn giao chạy được.
        // Nhãn "Sắp ra mắt" bị bỏ: một gói mua được thì nhãn đó không còn đúng.
        // Ghi null tường minh, nếu không thì nhánh `update` bỏ qua trường này và nhãn
        // cũ vẫn còn trên những database đã seed trước đây.
        isPublic: true,
        highlightLabel: null,
        sortOrder: 20,
        createdByAdminId: adminUser.id,
      },
      create: {
        code: 'CANDIDATE_PRO',
        audience: PlanAudience.CANDIDATE,
        subscriptionName: 'Candidate Pro',
        price: new Prisma.Decimal(99000),
        description: 'Gói nâng cao với nhiều lượt trợ lý AI hơn trong mỗi chu kỳ.',
        durationDays: 30,
        status: 'ACTIVE',
        // `candidateSandboxCheckout()` chỉ nhận gói có `isPublic`, nên để false thì
        // luồng nâng cấp của ứng viên trả SUBSCRIPTION_PLAN_NOT_AVAILABLE ở mọi lần
        // gọi -- và admin không bật lại được, vì `isPublic` không có trong
        // UpdateSubscriptionPlanDto. Bật ở đây để luồng đã bàn giao chạy được.
        // Nhãn "Sắp ra mắt" bị bỏ: một gói mua được thì nhãn đó không còn đúng.
        // Ghi null tường minh, nếu không thì nhánh `update` bỏ qua trường này và nhãn
        // cũ vẫn còn trên những database đã seed trước đây.
        isPublic: true,
        highlightLabel: null,
        sortOrder: 20,
        createdByAdminId: adminUser.id,
      },
    }),
  };

  // Quota policy belongs to the plan catalogue, not to Copilot code. Adding a
  // future candidate AI capability therefore only needs a PlanFeature row.
  await Promise.all([
    prisma.planFeature.upsert({
      where: {
        planId_feature: {
          planId: plans.candidateFree.id,
          feature: SubscriptionFeature.AI_COPILOT_RUN,
        },
      },
      update: { enabled: true, limitValue: 10 },
      create: {
        planId: plans.candidateFree.id,
        feature: SubscriptionFeature.AI_COPILOT_RUN,
        enabled: true,
        limitValue: 10,
      },
    }),
    prisma.planFeature.upsert({
      where: {
        planId_feature: {
          planId: plans.candidatePro.id,
          feature: SubscriptionFeature.AI_COPILOT_RUN,
        },
      },
      update: { enabled: true, limitValue: 100 },
      create: {
        planId: plans.candidatePro.id,
        feature: SubscriptionFeature.AI_COPILOT_RUN,
        enabled: true,
        limitValue: 100,
      },
    }),
  ]);

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
      description: 'Manage candidate applications',
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
  const currentPermissionCodes = permissionsList.map((p) => p.code);
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
      description: 'Chủ tài khoản - Toàn quyền quản lý',
      permissionCodes: permissionsList.map((p) => p.code),
    },
    {
      code: 'HR',
      name: 'HR',
      description: 'Quản lý tin tuyển dụng, hồ sơ ứng viên và lịch phỏng vấn',
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
      code: 'TECHLEAD',
      name: 'TechLead',
      description: 'Xem thông tin ứng viên được gán và đánh giá phỏng vấn',
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
  const validRoleCodes = ['OWNER', 'HR', 'TECHLEAD'];
  const invalidRoles = await prisma.recruiterRole.findMany({
    where: {
      code: {
        notIn: validRoleCodes,
      },
    },
  });

  const hrRole = seededRoles['HR'];
  const ownerRole = seededRoles['OWNER'];

  for (const role of invalidRoles) {
    const targetRole = hrRole || ownerRole;
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
      Array.from(
        new Set([
          'TypeScript',
          'NestJS',
          'Prisma',
          'React',
          'AWS',
          'AI',
          'QA',
          'Figma',
          'Node.js',
          'Express',
          'JavaScript',
          'Java',
          'Spring Boot',
          'Python',
          'Django',
          'FastAPI',
          'Go',
          'Rust',
          'C#',
          '.NET',
          'PHP',
          'Laravel',
          'HTML',
          'CSS',
          'Vue.js',
          'Angular',
          'Next.js',
          'Tailwind CSS',
          'SQL',
          'PostgreSQL',
          'MySQL',
          'MongoDB',
          'Redis',
          'Elasticsearch',
          'Docker',
          'Kubernetes',
          'GCP',
          'Azure',
          'CI/CD',
          'Git',
          'QA Automation',
          'Manual Testing',
          'Cypress',
          'Jest',
          'Machine Learning',
          'Deep Learning',
          'NLP',
          'PyTorch',
          'TensorFlow',
          'LLM',
          'LangChain',
          'Agile/Scrum',
          'Project Management',
          ...inferredSkillNames,
        ]),
      ).map(async (name) => {
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
      }),
    ),
  );

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const futureDeadline = addDays(now, 45);
  const getHomePostSeedMetadata = (slug: string) => {
    const presentation = HOME_POST_PRESENTATION_BY_SLUG[slug];
    if (!presentation) {
      throw new Error(`Missing presentation metadata for home post: ${slug}`);
    }

    const createdAt = addDays(now, -presentation.daysAgo);
    return {
      viewCount: presentation.viewCount,
      createdAt,
      updatedAt: addDays(createdAt, Math.min(14, Math.floor(presentation.daysAgo / 24))),
    };
  };

  const companiesPath = path.join(__dirname, 'data/companies_detailed.json');
  let companiesWithLogo: any[] = [];
  if (fs.existsSync(companiesPath)) {
    try {
      const companiesData = JSON.parse(fs.readFileSync(companiesPath, 'utf-8')) as any[];
      companiesWithLogo = companiesData.filter(
        (item) =>
          item.Slug &&
          item.Name &&
          item.Logo &&
          typeof item.Logo === 'string' &&
          item.Logo.trim() !== '',
      );
    } catch (e) {
      console.warn('Error reading companies_detailed.json:', e);
    }
  }

  const backupData = loadCompanySeedData();

  const companies = backupData.companies.map((c: any, index: number) => {
    let key = c.slug;
    if (index === 0) key = 'alpha';
    else if (index === 1) key = 'beta';
    else if (index === 2) key = 'gamma';
    else if (index === 3) key = 'delta';
    return {
      ...c,
      key,
    };
  });

  const fileAssetsData = backupData.fileAssets.map((asset: any) => ({
    id: asset.id,
    ownerType: asset.ownerType,
    ownerId: asset.ownerId,
    purpose: asset.purpose,
    visibility: asset.visibility,
    storageKey: asset.storageKey,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: BigInt(asset.sizeBytes),
    publicUrl: asset.publicUrl,
    createdAt: new Date(asset.createdAt),
    updatedAt: new Date(asset.updatedAt),
  }));

  const existingCount = await prisma.fileAsset.count();
  console.log('FileAsset count in DB right before insert:', existingCount);
  if (existingCount > 0) {
    const existing = await prisma.fileAsset.findMany({ select: { id: true } });
    console.log(
      'Existing FileAsset IDs in DB:',
      existing.map((x) => x.id),
    );
  }

  await prisma.fileAsset.createMany({
    data: fileAssetsData,
  });

  await prisma.company.createMany({
    data: companies.map((c: any) => ({
      id: c.id,
      slug: c.slug,
      logoFileId: c.logoFileId,
      businessLicenseFileId: c.businessLicenseFileId,
      type: c.type,
      name: c.name,
      taxCode: c.taxCode,
      address: c.address,
      email: c.email,
      phone: c.phone,
      website: c.website,
      description: c.description,
      benefits: c.benefits,
      companySize: c.companySize,
      workingDays: c.workingDays || 'Thứ 2 - Thứ 6',
      verificationStatus: c.verificationStatus,
      reputationScore: new Prisma.Decimal(c.reputationScore),
      lockedReason: c.lockedReason,
      status: c.status,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    })),
  });

  await prisma.companyReputationActivity.createMany({
    data: [
      // Alpha - 95.00
      {
        companyId: companies[0].id,
        actionType: 'PROFILE_COMPLETED',
        score: new Prisma.Decimal(15.0),
        reason: 'Hoàn thiện đầy đủ thông tin hồ sơ doanh nghiệp',
        byAdminId: null,
      },
      {
        companyId: companies[0].id,
        actionType: 'BUSINESS_LICENSE_VERIFIED',
        score: new Prisma.Decimal(50.0),
        reason: 'Giấy phép đăng ký kinh doanh được phê duyệt',
        byAdminId: adminUser.id,
      },
      {
        companyId: companies[0].id,
        actionType: 'POSITIVE_REVIEW_RECEIVED',
        score: new Prisma.Decimal(30.0),
        reason: 'Nhận đánh giá tích cực từ ứng viên đã tham gia phỏng vấn',
        byAdminId: null,
      },

      // Beta - 15.00
      {
        companyId: companies[1].id,
        actionType: 'PROFILE_COMPLETED',
        score: new Prisma.Decimal(15.0),
        reason: 'Hoàn thiện đầy đủ thông tin hồ sơ doanh nghiệp',
        byAdminId: null,
      },

      // Gamma - 35.00
      {
        companyId: companies[2].id,
        actionType: 'PROFILE_COMPLETED',
        score: new Prisma.Decimal(15.0),
        reason: 'Hoàn thiện đầy đủ thông tin hồ sơ doanh nghiệp',
        byAdminId: null,
      },
      {
        companyId: companies[2].id,
        actionType: 'EMAIL_VERIFIED',
        score: new Prisma.Decimal(20.0),
        reason: 'Xác thực tên miền email doanh nghiệp thành công',
        byAdminId: null,
      },

      // Delta - 10.00
      {
        companyId: companies[3].id,
        actionType: 'PROFILE_COMPLETED',
        score: new Prisma.Decimal(15.0),
        reason: 'Hoàn thiện đầy đủ thông tin hồ sơ doanh nghiệp',
        byAdminId: null,
      },
      {
        companyId: companies[3].id,
        actionType: 'REJECTED_VERIFICATION',
        score: new Prisma.Decimal(-5.0),
        reason: 'Yêu cầu xác thực doanh nghiệp bị từ chối do hồ sơ không khớp',
        byAdminId: adminUser.id,
      },
    ],
  });

  const recruiters = backupData.recruiters.map((rec: any) => {
    let roleCode = 'HR';
    if (
      rec.email === 'hr@fptsoftware.com' ||
      rec.email === 'admin@fptsoftware.com' ||
      rec.email.includes('owner') ||
      (!rec.email.includes('interviewer') && !rec.email.includes('recruiter@'))
    ) {
      roleCode = 'OWNER';
    } else if (rec.email.includes('interviewer')) {
      roleCode = 'TECHLEAD';
    }
    return {
      id: rec.id,
      profileId: rec.profile ? rec.profile.id : randomUUID(),
      companyId: rec.companyId,
      email: rec.email,
      fullName: rec.profile ? rec.profile.fullName : 'Recruiter',
      roleCode: roleCode,
      createdAt: new Date(rec.createdAt),
    };
  });

  await prisma.recruiterAccount.createMany({
    data: recruiters.map((recruiter: any) => ({
      id: recruiter.id,
      companyId: recruiter.companyId,
      recruiterRoleId: seededRoles[recruiter.roleCode].id,
      email: recruiter.email,
      passwordHash: recruiter.passwordHash || passwordHash,
      emailVerifiedAt: recruiter.createdAt,
      createdAt: recruiter.createdAt,
      updatedAt: recruiter.createdAt,
    })),
  });

  const avatarUrls = [
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&q=80',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&q=80',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&q=80',
  ];

  await prisma.recruiterProfile.createMany({
    data: recruiters.map((recruiter: any, idx: number) => {
      const backupRec = backupData.recruiters.find((r: any) => r.id === recruiter.id);
      return {
        id: recruiter.profileId,
        recruiterAccountId: recruiter.id,
        fullName: recruiter.fullName,
        avatarUrl: backupRec?.profile?.avatarUrl || avatarUrls[idx % avatarUrls.length],
        createdAt: recruiter.createdAt,
        updatedAt: recruiter.createdAt,
      };
    }),
  });

  await prisma.companyMember.createMany({
    data: recruiters.map((recruiter: any) => ({
      recruiterAccountId: recruiter.id,
      companyId: recruiter.companyId,
      roleId: seededRoles[recruiter.roleCode].id,
      createdAt: recruiter.createdAt,
      updatedAt: recruiter.createdAt,
    })),
  });

  const vietnameseNames = [
    'Nguyễn Minh Triết',
    'Trần Thị Mai',
    'Lê Hoàng Nam',
    'Phạm Thanh Bình',
    'Hoàng Kim Oanh',
    'Phan Anh Tuấn',
    'Vũ Thị Hồng',
    'Đỗ Minh Khang',
    'Ngô Bích Thủy',
    'Bùi Tiến Dũng',
    'Đặng Ngọc Huyền',
    'Lý Huy Hoàng',
    'Dương Quốc Bảo',
    'Lâm Gia Hưng',
    'Võ Thị Hà',
    'Trịnh Duy Anh',
    'Mai Phương Thảo',
    'Đinh Gia Bảo',
    'Cao Minh Quân',
    'Lương Thu Trang',
    'Nguyễn Hoàng Long',
    'Trần Thanh Hải',
    'Lê Cẩm Tú',
    'Phạm Hữu Phước',
    'Hoàng Thùy Linh',
    'Phan Minh Trí',
    'Vũ Quang Huy',
    'Đỗ Hồng Nhung',
    'Ngô Minh Đức',
    'Bùi Ngọc Trâm',
    'Đặng Tuấn Kiệt',
    'Lý Thu Thảo',
    'Dương Hồng Quân',
    'Lâm Hoài Nam',
    'Võ Hải Đăng',
    'Trịnh Minh Thư',
    'Mai Quốc Anh',
    'Đinh Thị Lan',
    'Cao Tuấn Anh',
    'Lương Minh Triết',
    'Nguyễn Mai Chi',
    'Trần Quốc Khánh',
    'Lê Thanh Sơn',
    'Phạm Tiến Đạt',
    'Hoàng Yến Vy',
    'Phan Bảo Ngọc',
    'Vũ Văn Thanh',
    'Đỗ Duy Mạnh',
    'Ngô Thanh Hằng',
    'Bùi Hoàng Nam',
    'Đặng Khánh Linh',
    'Lý Quốc Tuấn',
    'Dương Hoài An',
    'Lâm Thị Ngọc',
    'Võ Văn Quyết',
    'Trịnh Nhật Minh',
    'Mai Xuân Trường',
    'Đinh Hữu Thắng',
    'Cao Thanh Trúc',
    'Lương Gia Khánh',
  ];

  const backupCandidatesPath = path.join(__dirname, 'data/candidates_real.json');
  if (!fs.existsSync(backupCandidatesPath)) {
    throw new Error('prisma/data/candidates_real.json is required for seeding real candidates.');
  }
  const candidatesRealRaw = JSON.parse(fs.readFileSync(backupCandidatesPath, 'utf8'));

  const detailedNames = [
    'Nguyễn Quốc Vương',
    'Trần Minh Anh',
    'Lê Hoàng Nam',
    'Phạm Gia Hân',
    'Đỗ Minh Khang',
    'Vũ Hoàng Nam',
    'Ngô Bích Thủy',
    'Bùi Tiến Dũng',
    'Nguyễn Minh Triết',
    'Hoàng Kim Oanh',
  ];

  // Only 5 candidates here previously meant every job's application count was
  // hard-capped at 5 (a candidate can only apply once per job — see the unique
  // constraint on Application), no matter how many "views" it got. 90 gives the
  // views→applications conversion below real headroom to vary per job.
  const candidates = Array.from({ length: 90 }, (_, index) => {
    const accountId = randomUUID();
    const profileId = randomUUID();
    const cvId = randomUUID();
    const cvVersionId = randomUUID();
    const cvFileAssetId = randomUUID();

    if (index < 5) {
      const real = candidatesRealRaw[index];
      return {
        index,
        accountId,
        profileId,
        cvId,
        cvVersionId,
        cvFileAssetId,
        fullName: real.fullName,
        email: real.email,
        createdAt: addDays(now, -(index % 30)),
        realCandidate: real,
      };
    }

    const fullName =
      index < 10 ? detailedNames[index] : vietnameseNames[(index - 10) % vietnameseNames.length];
    return {
      index,
      accountId,
      profileId,
      cvId,
      cvVersionId,
      cvFileAssetId: null,
      fullName,
      email:
        index < 10
          ? `${SEED_EMAIL_PREFIX}${toAsciiUrl(fullName).replace(/[^a-z0-9]/g, '-')}.candidate@gmail.com`
          : // Append the index: past 60 candidates, vietnameseNames wraps around and
            // would otherwise generate the same email for two different candidates.
            `${SEED_EMAIL_PREFIX}${toAsciiUrl(fullName)}-${index}@gmail.com`,
      createdAt: addDays(now, -(index % 30)),
      realCandidate: null,
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

  const fileAssetsToCreate: any[] = [];

  await prisma.candidateProfile.createMany({
    data: candidates.map((candidate) => {
      const idx = candidate.index;

      if (candidate.realCandidate) {
        const real = candidate.realCandidate;

        // Add FileAsset for candidate CV if present. The PDF is generated on
        // disk under the real upload convention (uploads/cvs/<cvId>/...) so the
        // recruiter CV stream endpoint can serve it. publicUrl stays null,
        // exactly like a CV uploaded through the app.
        if (real.profile.cvFile) {
          const cvFile = real.profile.cvFile;
          const writtenCv = writeSeedCvPdf(candidate.cvId, [
            real.fullName,
            real.profile.address ?? '',
            '',
            'HO SO UNG VIEN (du lieu mau)',
            '',
            ...String(real.profile.description ?? '')
              .split(/\r?\n/)
              .flatMap((paragraph) => paragraph.match(/.{1,88}(\s|$)/g) ?? []),
          ]);

          fileAssetsToCreate.push({
            id: candidate.cvFileAssetId,
            ownerType: cvFile.ownerType,
            ownerId: candidate.accountId,
            purpose: 'CV',
            visibility: cvFile.visibility,
            storageKey: writtenCv.storageKey,
            originalName: cvFile.originalName,
            mimeType: 'application/pdf',
            sizeBytes: BigInt(writtenCv.sizeBytes),
            publicUrl: null,
            createdAt: candidate.createdAt,
            updatedAt: candidate.createdAt,
          });
        }

        return {
          id: candidate.profileId,
          candidateAccountId: candidate.accountId,
          phoneNumber: real.profile.phoneNumber,
          gender: real.profile.gender as Gender,
          address: real.profile.address,
          birthdate: real.profile.birthdate ? new Date(real.profile.birthdate) : null,
          description: real.profile.description,
          jobSearchStatus: real.profile.jobSearchStatus as JobSearchStatus,
          profileVisibility: real.profile.profileVisibility as ProfileVisibility,
          createdAt: candidate.createdAt,
          updatedAt: candidate.createdAt,
        };
      }

      let description = 'Software Engineer';
      let phoneNumber: string | null = null;
      let gender: Gender | null = null;
      let birthdate: Date | null = null;
      let jobSearchStatus: JobSearchStatus = JobSearchStatus.NOT_LOOKING;
      let address = idx % 2 === 0 ? 'Hồ Chí Minh' : 'Hà Nội';

      if (idx === 5) {
        description =
          'Technical Lead với hơn 7 năm kinh nghiệm thiết kế hệ thống Microservices quy mô lớn. Có kiến thức chuyên sâu về Spring Boot, NestJS, gRPC, Message Broker (Kafka) và kiến trúc High Availability trên môi trường Cloud.';
        phoneNumber = '(+84) 93 444 5555';
        gender = Gender.MALE;
        birthdate = new Date('1994-02-18');
        jobSearchStatus = JobSearchStatus.NOT_LOOKING;
        address = 'Hồ Chí Minh, Việt Nam';
      } else if (idx === 6) {
        description =
          'Engineering Manager có kỹ năng lãnh đạo xuất sắc và am hiểu Agile/Scrum. Quản lý thành công các dự án phần mềm đa quốc gia, tập trung vào nâng cao năng suất nhóm, phát triển con người và tối ưu hóa quy trình release.';
        phoneNumber = '(+84) 94 555 6666';
        gender = Gender.FEMALE;
        birthdate = new Date('1992-07-30');
        jobSearchStatus = JobSearchStatus.NOT_LOOKING;
        address = 'Hồ Chí Minh, Việt Nam';
      } else if (idx === 7) {
        description =
          'QA Automation Engineer với 3 năm kinh nghiệm lập kịch bản test tự động bằng Selenium và Cypress. Chuyên sâu về API Testing, Performance Testing (JMeter) và tích hợp kiểm thử tự động vào quy trình CI/CD.';
        phoneNumber = '(+84) 95 666 7777';
        gender = Gender.MALE;
        birthdate = new Date('1997-09-08');
        jobSearchStatus = JobSearchStatus.OPEN_TO_WORK;
        address = 'Hà Nội, Việt Nam';
      } else if (idx === 8) {
        description =
          'Mobile App Developer đam mê tạo ra các ứng dụng di động tuyệt đẹp và mượt mà trên iOS & Android. Thành thạo React Native, Flutter và Swift. Tích hợp tốt các dịch vụ RESTful API và lưu trữ offline.';
        phoneNumber = '(+84) 92 777 8888';
        gender = Gender.MALE;
        birthdate = new Date('1999-12-25');
        jobSearchStatus = JobSearchStatus.OPEN_TO_WORK;
        address = 'Hồ Chí Minh, Việt Nam';
      } else if (idx === 9) {
        description =
          'Product Designer (UI/UX) với gu thẩm mỹ tinh tế và tư duy đặt người dùng làm trung tâm. Kinh nghiệm thực hiện nghiên cứu người dùng, thiết kế wireframes, prototypes và design systems đồng nhất trên Figma.';
        phoneNumber = '(+84) 98 888 9999';
        gender = Gender.FEMALE;
        birthdate = new Date('2000-05-14');
        jobSearchStatus = JobSearchStatus.OPEN_TO_WORK;
        address = 'Hồ Chí Minh, Việt Nam';
      } else {
        const roleIdx = idx % 8;
        if (roleIdx === 0) {
          description =
            'Sinh viên năm cuối chuyên ngành Khoa học Máy tính, có kiến thức tốt về cấu trúc dữ liệu, giải thuật và lập trình backend (Node.js/Express). Đang tìm kiếm cơ hội thực tập để phát triển kỹ năng.';
        } else if (roleIdx === 1) {
          description =
            'Frontend Developer mới tốt nghiệp. Đam mê thiết kế giao diện tinh tế, phản hồi nhanh và tối ưu hóa trải nghiệm người dùng. Thành thạo HTML, CSS, JavaScript và React.';
        } else if (roleIdx === 2) {
          description =
            'Junior Fullstack Developer với hơn 1.5 năm kinh nghiệm thực tế phát triển các ứng dụng web bằng React và Node.js. Tư duy giải quyết vấn đề tốt và khả năng làm việc độc lập.';
        } else if (roleIdx === 3) {
          description =
            'DevOps Engineer giàu kinh nghiệm trong thiết lập hạ tầng Cloud (AWS), tự động hóa quy trình CI/CD và triển khai ứng dụng bằng Docker/Kubernetes.';
        } else if (roleIdx === 4) {
          description =
            'Senior AI & Data Engineer với hơn 5 năm kinh nghiệm. Chuyên sâu về Machine Learning, NLP và tích hợp các công nghệ Generative AI/LLMs vào sản phẩm thực tế.';
        } else if (roleIdx === 5) {
          description =
            'Technical Lead với hơn 7 năm kinh nghiệm thiết kế kiến trúc hệ thống và dẫn dắt đội ngũ phát triển sản phẩm. Thế mạnh về Microservices, Cloud Computing và bảo mật.';
        } else if (roleIdx === 6) {
          description =
            'Engineering Manager có kinh nghiệm quản lý và phát triển các đội nhóm kỹ thuật. Tối ưu hóa quy trình Agile/Scrum, kết nối các mục tiêu kinh doanh và công nghệ.';
        } else if (roleIdx === 7) {
          description =
            'Chuyên viên QA/QC kiểm thử phần mềm, thành thạo lập kế hoạch test, viết test case, thực hiện cả Manual Testing và Automation Testing (Selenium, Cypress).';
        }
        phoneNumber = idx % 2 === 0 ? '(+84) 90 123 4567' : null;
        gender = idx % 2 === 0 ? Gender.MALE : Gender.FEMALE;
        birthdate = new Date(1996 + (idx % 8), idx % 12, (idx % 28) + 1);
        jobSearchStatus =
          idx % 3 === 0 ? JobSearchStatus.OPEN_TO_WORK : JobSearchStatus.NOT_LOOKING;
      }

      return {
        id: candidate.profileId,
        candidateAccountId: candidate.accountId,
        phoneNumber,
        gender,
        address,
        birthdate,
        description,
        jobSearchStatus,
        profileVisibility: ProfileVisibility.PUBLIC,
        createdAt: candidate.createdAt,
        updatedAt: candidate.createdAt,
      };
    }),
  });

  if (fileAssetsToCreate.length > 0) {
    await prisma.fileAsset.createMany({ data: fileAssetsToCreate });
  }

  await prisma.cV.createMany({
    data: candidates.map((candidate) => ({
      id: candidate.cvId,
      candidateProfileId: candidate.profileId,
      title: `${candidate.fullName} CV`,
      source:
        candidate.realCandidate && candidate.realCandidate.profile.cvFile
          ? CvSource.UPLOAD
          : CvSource.BUILDER,
      status: CvStatus.ACTIVE,
      isDefault: true,
      createdAt: candidate.createdAt,
      updatedAt: candidate.createdAt,
    })),
  });

  await prisma.cVVersion.createMany({
    data: candidates.map((candidate) => {
      const idx = candidate.index;

      if (candidate.realCandidate) {
        const real = candidate.realCandidate;
        return {
          id: candidate.cvVersionId,
          cvId: candidate.cvId,
          versionNo: 1,
          parsedText: `HỌ VÀ TÊN: ${real.fullName}\nĐịa chỉ: ${real.profile.address}\n\nTÓM TẮT CHUYÊN MÔN:\n${real.profile.description}`,
          sourceFileId: real.profile.cvFile ? candidate.cvFileAssetId : null,
          createdAt: candidate.createdAt,
        };
      }

      const roleIdx = idx % 8;
      const cvTexts = [
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Thực tập sinh Backend Developer\nĐịa chỉ: TP. Hồ Chí Minh\n\nTÓM TẮT CHUYÊN MÔN:\nSinh viên năm cuối ngành CNTT đam mê phát triển hệ thống backend. Ham học hỏi, kiên trì và chịu được áp lực tốt.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Ngôn ngữ: JavaScript, TypeScript, Java\n- Framework: Node.js, ExpressJS\n- Cơ sở dữ liệu: MySQL, PostgreSQL\n- Công cụ: Git, Postman\n\nDỰ ÁN NỔI BẬT:\n1. Task Manager API (Express, MongoDB)\n- Thiết kế RESTful API cho ứng dụng quản lý công việc cá nhân.\n- Tích hợp xác thực người dùng bằng JWT.`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Fresher Frontend Developer\nĐịa chỉ: TP. Hồ Chí Minh\n\nTÓM TẮT CHUYÊN MÔN:\nLập trình viên Frontend mới tốt nghiệp, yêu thích thiết kế UI/UX đẹp mắt và mượt mà.\n\nKỸ NĂNG CÔNG NGHỆ:\n- HTML5, CSS3, JavaScript (ES6+), TypeScript\n- Frameworks: React, Next.js, Tailwind CSS\n- Công cụ thiết kế: Figma, Adobe XD\n\nDỰ ÁN NỔI BẬT:\n1. Personal Portfolio Website (React, Tailwind CSS)\n- Website giới thiệu bản thân với giao diện đáp ứng (responsive).\n- Triển khai hosting lên Vercel.`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Junior Fullstack Developer\nĐịa chỉ: TP. Hồ Chí Minh\n\nKINH NGHIỆM LÀM VIỆC:\n- ABC Tech (06/2024 - Hiện tại): Lập trình viên Fullstack\n  + Phát triển các tính năng mới cho ứng dụng e-commerce nội bộ.\n  + Tối ưu các câu lệnh truy vấn database.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Backend: Node.js, Express, NestJS, Prisma ORM\n- Frontend: ReactJS, Redux Toolkit\n- Databases: PostgreSQL, MongoDB\n\nDỰ ÁN NỔI BẬT:\n1. Internal Sales Management System\n- Tham gia xây dựng hệ thống quản lý doanh số từ đầu.`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: DevOps Engineer\nĐịa chỉ: Hà Nội\n\nKINH NGHIỆM LÀM VIỆC:\n- KMS Technology (2023 - Hiện tại): DevOps Engineer\n  + Xây dựng và duy trì đường ống dẫn CI/CD bằng Jenkins và GitLab CI.\n  + Quản lý hạ tầng AWS cho 3 dự án lớn.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Cloud: AWS (EC2, VPC, EKS, RDS, CloudWatch)\n- Containerization: Docker, Kubernetes\n- Infrastructure as Code: Terraform\n- CI/CD: Jenkins, Github Actions`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Senior AI & Data Engineer\nĐịa chỉ: Hà Nội\n\nKINH NGHIỆM LÀM VIỆC:\n- VinAI Research (2021 - Hiện tại): Senior Data Scientist / AI Engineer\n  + Nghiên cứu và tối ưu hóa các mô hình Machine Learning / Deep Learning.\n  + Triển khai hệ thống RAG (Retrieval-Augmented Generation) cho trợ lý ảo doanh nghiệp.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Programming: Python, R, SQL\n- ML/DL Frameworks: PyTorch, TensorFlow, Scikit-learn\n- AI tools: LangChain, LlamaIndex, OpenAI API\n- Big Data: Spark, Hadoop`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Technical Lead (Backend & Cloud)\nĐịa chỉ: TP. Hồ Chí Minh\n\nKINH NGHIỆM LÀM VIỆC:\n- VNG Corporation (2020 - Hiện tại): Technical Lead / Senior Backend Engineer\n  + Thiết kế kiến trúc microservices xử lý lưu lượng truy cập lớn (hơn 10k CCU).\n  + Dẫn dắt và cố vấn (mentor) cho 8 lập trình viên.\n\nKỸ NĂNG CÔNG NGHỆ:\n- Languages & Frameworks: Java (Spring Boot), TypeScript (NestJS), Golang\n- Architecture: Microservices, RESTful API, gRPC, Message Broker (Kafka)\n- Cloud: AWS, GCP`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: Engineering Manager\nĐịa chỉ: TP. Hồ Chí Minh\n\nKINH NGHIỆM LÀM VIỆC:\n- Axon Active (2018 - Hiện tại): Engineering Manager / Scrum Master\n  + Quản lý 3 đội nhóm Agile (tổng cộng 25 thành viên).\n  + Lập kế hoạch tài nguyên, đánh giá hiệu quả công việc và định hướng phát triển nghề nghiệp cho nhân sự.\n\nKỸ NĂNG QUẢN LÝ:\n- Agile/Scrum, Project Planning, Risk Management, People Management, Budgeting`,
        `HỌ VÀ TÊN: ${candidate.fullName}\nVị trí ứng tuyển: QA / Automation Engineer\nĐịa chỉ: Hà Nội\n\nKINH NGHIỆM LÀM VIỆC:\n- FPT Software (2022 - Hiện tại): QA Automation Engineer\n  + Viết kịch bản kiểm thử tự động cho hệ thống web và mobile.\n  + Thực hiện kiểm thử hiệu năng và bảo mật cơ bản.\n\nKỸ NĂNG CHUYÊN MÔN:\n- Testing tools: Selenium WebDriver, Cypress, Postman, JMeter\n- Programming: Java, JavaScript\n- Methodologies: Agile/Scrum, Waterfall`,
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
      if (candidate.realCandidate) {
        const real = candidate.realCandidate;
        const levelCode = real.profile.jobPreference.desiredLevel.code;
        const level = experienceLevels[levelCode as keyof typeof experienceLevels];

        return {
          id: randomUUID(),
          candidateProfileId: candidate.profileId,
          desiredPosition: real.profile.jobPreference.desiredPosition,
          desiredSalaryMin: new Prisma.Decimal(real.profile.jobPreference.desiredSalaryMin),
          desiredSalaryMax: new Prisma.Decimal(real.profile.jobPreference.desiredSalaryMax),
          salaryCurrency: real.profile.jobPreference.salaryCurrency,
          workingModel: real.profile.jobPreference.workingModel as WorkingModel,
          desiredLevelId: level ? level.id : null,
          noticePeriodDays: real.profile.jobPreference.noticePeriodDays,
          isRelocate: real.profile.jobPreference.isRelocate,
          createdAt: candidate.createdAt,
          updatedAt: candidate.createdAt,
        };
      }

      let desiredLevelId: string | null = null;
      let desiredPosition = 'Software Engineer';
      let minSalary = 10000000;
      let maxSalary = 20000000;
      let workingModel: WorkingModel = WorkingModel.HYBRID;
      const idx = candidate.index;
      let isRelocate = idx % 3 === 0;

      if (idx < 10) {
        if (idx === 5) {
          desiredLevelId = experienceLevels.lead.id;
          desiredPosition = 'Technical Lead';
          minSalary = 45000000;
          maxSalary = 70000000;
          workingModel = WorkingModel.REMOTE;
          isRelocate = true;
        } else if (idx === 6) {
          desiredLevelId = experienceLevels.manager.id;
          desiredPosition = 'Engineering Manager';
          minSalary = 60000000;
          maxSalary = 90000000;
          workingModel = WorkingModel.HYBRID;
          isRelocate = false;
        } else if (idx === 7) {
          desiredLevelId = experienceLevels.mid.id;
          desiredPosition = 'QA Automation Engineer';
          minSalary = 18000000;
          maxSalary = 26000000;
          workingModel = WorkingModel.HYBRID;
          isRelocate = false;
        } else if (idx === 8) {
          desiredLevelId = experienceLevels.junior.id;
          desiredPosition = 'Mobile App Developer';
          minSalary = 16000000;
          maxSalary = 24000000;
          workingModel = WorkingModel.HYBRID;
          isRelocate = true;
        } else if (idx === 9) {
          desiredLevelId = experienceLevels.junior.id;
          desiredPosition = 'Product Designer';
          minSalary = 14000000;
          maxSalary = 20000000;
          workingModel = WorkingModel.ONSITE;
          isRelocate = false;
        }
      } else {
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
        isRelocate,
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

  const detailedSkills: Record<number, string[]> = {
    5: [
      'TypeScript',
      'React',
      'NestJS',
      'AWS',
      'Node.js',
      'SQL',
      'PostgreSQL',
      'Docker',
      'Kubernetes',
      'CI/CD',
      'Git',
      'Java',
      'Spring Boot',
    ],
    6: [
      'Project Management',
      'Agile/Scrum',
      'TypeScript',
      'React',
      'NestJS',
      'AWS',
      'Docker',
      'Git',
    ],
    7: [
      'QA',
      'QA Automation',
      'Manual Testing',
      'Cypress',
      'Jest',
      'TypeScript',
      'JavaScript',
      'Git',
      'Postman',
    ],
    8: ['React Native', 'Flutter', 'Swift', 'Java', 'Git', 'REST API', 'JavaScript', 'TypeScript'],
    9: ['Figma', 'UI/UX', 'Web Design', 'Mobile Design', 'Photoshop', 'Illustrator', 'HTML', 'CSS'],
  };

  async function getOrCreateSkill(
    name: string,
    skillsMap: Record<string, any>,
    categories: Record<string, any>,
  ) {
    if (skillsMap[name]) {
      return skillsMap[name];
    }
    const categoryId = getCategoryForSkill(name, categories);
    const skill = await prisma.skill.upsert({
      where: { name },
      update: { categoryId },
      create: { name, categoryId },
    });
    skillsMap[name] = skill;
    return skill;
  }

  for (const candidate of candidates) {
    const idx = candidate.index;
    const profileId = candidate.profileId;
    const baseDate = candidate.createdAt;
    const roleIdx = idx % 8;

    if (candidate.realCandidate) {
      const real = candidate.realCandidate;

      // 1. Languages
      if (real.profile.languages) {
        real.profile.languages.forEach((lang: any) => {
          languagesToCreate.push({
            id: randomUUID(),
            candidateProfileId: profileId,
            language: lang.language,
            proficiency: lang.proficiency,
            createdAt: baseDate,
            updatedAt: baseDate,
          });
        });
      }

      // 2. Links
      if (real.profile.links) {
        real.profile.links.forEach((link: any) => {
          linksToCreate.push({
            id: randomUUID(),
            candidateProfileId: profileId,
            type: link.type,
            url: link.url,
            createdAt: baseDate,
            updatedAt: baseDate,
          });
        });
      }

      // 3. Educations
      if (real.profile.educations) {
        real.profile.educations.forEach((edu: any) => {
          educationsToCreate.push({
            id: randomUUID(),
            candidateProfileId: profileId,
            schoolName: edu.schoolName,
            degree: edu.degree,
            major: edu.major,
            startDate: edu.startDate ? new Date(edu.startDate) : null,
            endDate: edu.endDate ? new Date(edu.endDate) : null,
            isCurrent: edu.isCurrent,
            gpa: edu.gpa ? new Prisma.Decimal(edu.gpa) : null,
            sortOrder: edu.sortOrder,
            createdAt: baseDate,
            updatedAt: baseDate,
          });
        });
      }

      // 4. Skills
      if (real.profile.skills) {
        for (const skill of real.profile.skills) {
          const skillRecord = await getOrCreateSkill(skill.name, skills, categories);
          if (skillRecord) {
            let profLevel = skill.proficiencyLevel;
            if (profLevel === 'BASIC') profLevel = 'BEGINNER';
            skillsToCreate.push({
              id: randomUUID(),
              candidateProfileId: profileId,
              skillId: skillRecord.id,
              proficiencyLevel: profLevel,
              yearsOfExperience: new Prisma.Decimal(skill.yearsOfExperience),
              sortOrder: skill.sortOrder,
              createdAt: baseDate,
              updatedAt: baseDate,
            });
          }
        }
      }

      // 5. Experiences
      if (real.profile.experiences) {
        for (const exp of real.profile.experiences) {
          const expId = randomUUID();
          experiencesToCreate.push({
            id: expId,
            candidateProfileId: profileId,
            companyName: exp.companyName,
            positionTitle: exp.positionTitle,
            employmentType: exp.employmentType,
            startDate: exp.startDate ? new Date(exp.startDate) : null,
            endDate: exp.endDate ? new Date(exp.endDate) : null,
            isCurrent: exp.isCurrent,
            description: exp.description,
            technologies: exp.technologies,
            sortOrder: exp.sortOrder,
            createdAt: baseDate,
            updatedAt: baseDate,
          });

          // Link experience skills
          if (exp.technologies) {
            const techList = exp.technologies.split(',').map((s: string) => s.trim());
            for (const techName of techList) {
              const skillRecord = await getOrCreateSkill(techName, skills, categories);
              if (skillRecord) {
                experienceSkillsToCreate.push({
                  id: randomUUID(),
                  candidateExperienceId: expId,
                  skillId: skillRecord.id,
                });
              }
            }
          }
        }
      }

      // 6. Projects
      if (real.profile.projects) {
        real.profile.projects.forEach((proj: any) => {
          projectsToCreate.push({
            id: randomUUID(),
            candidateProfileId: profileId,
            name: proj.name,
            role: proj.role,
            description: proj.description,
            projectUrl: proj.projectUrl,
            technologies: proj.technologies,
            deployUrl: proj.deployUrl,
            startDate: proj.startDate ? new Date(proj.startDate) : null,
            endDate: proj.endDate ? new Date(proj.endDate) : null,
            sortOrder: proj.sortOrder,
            createdAt: baseDate,
            updatedAt: baseDate,
          });
        });
      }

      // 7. Certifications
      if (real.profile.certifications) {
        real.profile.certifications.forEach((cert: any) => {
          certificationsToCreate.push({
            id: randomUUID(),
            candidateProfileId: profileId,
            name: cert.name,
            organization: cert.organization,
            issuedDate: cert.issuedDate ? new Date(cert.issuedDate) : null,
            expiredDate: cert.expiredDate ? new Date(cert.expiredDate) : null,
            credentialUrl: cert.credentialUrl,
            sortOrder: cert.sortOrder,
            createdAt: baseDate,
            updatedAt: baseDate,
          });
        });
      }

      continue;
    }

    // 1. Languages
    languagesToCreate.push({
      id: randomUUID(),
      candidateProfileId: profileId,
      language: 'Vietnamese',
      proficiency: 'Native',
      createdAt: baseDate,
      updatedAt: baseDate,
    });

    if (idx < 10) {
      const engProf = idx === 5 || idx === 6 ? 'Fluent' : 'Intermediate';
      languagesToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        language: 'English',
        proficiency: engProf,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else {
      if (roleIdx !== 7 && roleIdx !== 1) {
        languagesToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          language: 'English',
          proficiency:
            roleIdx === 5 || roleIdx === 6
              ? 'Fluent'
              : roleIdx === 4
                ? 'IELTS 7.5'
                : 'Intermediate',
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
    }

    // 2. Links
    const asciiName = toAsciiUrl(candidate.fullName).replace(/[^a-z0-9]/g, '-');
    linksToCreate.push({
      id: randomUUID(),
      candidateProfileId: profileId,
      type: 'LinkedIn',
      url: `https://linkedin.com/in/${asciiName}`,
      createdAt: baseDate,
      updatedAt: baseDate,
    });

    if (idx < 10) {
      linksToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        type: 'GitHub',
        url: `https://github.com/${asciiName}`,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
      if (idx === 9) {
        linksToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          type: 'Portfolio',
          url: `https://${asciiName}.dev`,
          createdAt: baseDate,
          updatedAt: baseDate,
        });
      }
    } else {
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
    }

    // 3. Education
    if (idx < 10) {
      const schools = [
        [
          'Hanoi University of Science and Technology',
          'Hanoi University',
          'Da Nang University of Technology',
        ],
        [
          'Hanoi - Amsterdam High School for the Gifted',
          'Le Hong Phong High School',
          'Tran Dai Nghia High School',
        ],
      ];
      const majors = [
        'Software Engineering',
        'Computer Science',
        'Information Technology',
        'Data Science & AI',
        'UI/UX Design',
      ];

      educationsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        schoolName: idx % 2 === 0 ? schools[0][0] : schools[0][idx % 3],
        degree: idx === 9 ? 'Bachelor of Fine Arts' : 'Bachelor of Engineering',
        major: idx === 9 ? majors[4] : majors[idx % 4],
        startDate: new Date('2019-09-05'),
        endDate: new Date('2023-06-20'),
        isCurrent: false,
        gpa: new Prisma.Decimal(3.2 + (idx % 5) * 0.15),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });

      if (idx % 2 === 0) {
        educationsToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          schoolName: schools[1][idx % 3],
          degree: 'High School Diploma',
          major: 'General Science',
          startDate: new Date('2016-09-05'),
          endDate: new Date('2019-05-25'),
          isCurrent: false,
          gpa: new Prisma.Decimal(3.5),
          sortOrder: 1,
          createdAt: baseDate,
          updatedAt: baseDate,
        });
      }
    } else {
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
          gpa: new Prisma.Decimal(3.2),
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
          gpa: new Prisma.Decimal(3.4),
          sortOrder: 0,
          createdAt: baseDate,
          updatedAt: baseDate,
        });
      } else {
        educationsToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          schoolName:
            idx % 2 === 0 ? 'FPT University' : 'Hanoi University of Science and Technology',
          degree: 'Bachelor of Software Engineering',
          major: 'Software Engineering',
          startDate: addDays(baseDate, -1825),
          endDate: addDays(baseDate, -365),
          isCurrent: false,
          gpa: new Prisma.Decimal(3.1),
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
    }

    // 4. Skills & Experiences
    const candidateSkills = [];
    if (idx < 10) {
      candidateSkills.push(...detailedSkills[idx]);
    } else {
      if (roleIdx === 0) {
        candidateSkills.push(
          'TypeScript',
          'NestJS',
          'Node.js',
          'Express',
          'JavaScript',
          'SQL',
          'PostgreSQL',
          'Git',
          'HTML',
          'CSS',
        );
      } else if (roleIdx === 1) {
        candidateSkills.push(
          'React',
          'TypeScript',
          'Figma',
          'JavaScript',
          'HTML',
          'CSS',
          'Tailwind CSS',
          'Git',
        );
      } else if (roleIdx === 2) {
        candidateSkills.push(
          'TypeScript',
          'React',
          'Prisma',
          'Node.js',
          'Express',
          'JavaScript',
          'SQL',
          'PostgreSQL',
          'Tailwind CSS',
          'Git',
          'Docker',
        );
      } else if (roleIdx === 3) {
        candidateSkills.push(
          'AWS',
          'Docker',
          'Kubernetes',
          'CI/CD',
          'Git',
          'Python',
          'GCP',
          'Azure',
        );
      } else if (roleIdx === 4) {
        candidateSkills.push(
          'AI',
          'AWS',
          'Python',
          'Machine Learning',
          'Deep Learning',
          'NLP',
          'PyTorch',
          'TensorFlow',
          'LLM',
          'LangChain',
          'SQL',
          'PostgreSQL',
        );
      } else if (roleIdx === 5) {
        candidateSkills.push(
          'TypeScript',
          'React',
          'NestJS',
          'AWS',
          'Prisma',
          'Node.js',
          'SQL',
          'PostgreSQL',
          'Docker',
          'Kubernetes',
          'CI/CD',
          'Git',
          'Java',
          'Spring Boot',
        );
      } else if (roleIdx === 6) {
        candidateSkills.push(
          'Git',
          'TypeScript',
          'React',
          'NestJS',
          'AWS',
          'Docker',
          'Project Management',
          'Agile/Scrum',
        );
      } else if (roleIdx === 7) {
        candidateSkills.push(
          'QA',
          'QA Automation',
          'Manual Testing',
          'Cypress',
          'Jest',
          'TypeScript',
          'JavaScript',
          'Git',
        );
      }
    }

    candidateSkills.forEach((skillName, sIdx) => {
      const skillRecord = skills[skillName];
      if (skillRecord) {
        let totalYears = 2;
        if (idx < 10) {
          if (idx === 5 || idx === 6) totalYears = 7;
        } else {
          if (roleIdx === 0) totalYears = 0.5;
          else if (roleIdx === 1) totalYears = 1;
          else if (roleIdx === 5 || roleIdx === 6) totalYears = 5;
          else totalYears = 2;
        }

        const factor =
          sIdx === 0 ? 1.0 : sIdx === 1 ? 0.8 : sIdx === 2 ? 0.7 : sIdx === 3 ? 0.5 : 0.4;
        let skillYears = totalYears * factor;
        skillYears = Math.round(skillYears * 10) / 10;
        if (skillYears < 0.5) skillYears = 0.5;

        let maxProf = 'INTERMEDIATE';
        if (idx < 10) {
          if (idx === 5 || idx === 6) maxProf = 'EXPERT';
        } else {
          if (roleIdx >= 5) maxProf = 'EXPERT';
          else if (roleIdx >= 4) maxProf = 'ADVANCED';
        }

        let profLevel = 'INTERMEDIATE';
        if (sIdx < 2) {
          profLevel = maxProf;
        } else if (sIdx < 5) {
          profLevel =
            maxProf === 'EXPERT'
              ? 'ADVANCED'
              : maxProf === 'ADVANCED'
                ? 'INTERMEDIATE'
                : 'BEGINNER';
        } else {
          profLevel = 'INTERMEDIATE';
        }

        skillsToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          skillId: skillRecord.id,
          proficiencyLevel: profLevel,
          yearsOfExperience: new Prisma.Decimal(skillYears),
          sortOrder: sIdx,
          createdAt: baseDate,
          updatedAt: baseDate,
        });
      }
    });

    if (idx < 10) {
      const companiesList = [
        'FPT Software',
        'VNG Corporation',
        'Viettel Cyber Security',
        'VinAI Research',
        'One Mount Group',
        'NashTech',
        'Axon Active',
        'CMC Global',
        'Wayfu Studio',
      ];
      const titlesList = [
        'Frontend Developer',
        'Fullstack Developer',
        'DevOps Engineer',
        'AI Engineer',
        'Senior Developer',
        'Technical Lead',
        'Scrum Master',
        'QA Automation Engineer',
        'Mobile Developer',
      ];

      const expId = randomUUID();
      experiencesToCreate.push({
        id: expId,
        candidateProfileId: profileId,
        companyName: companiesList[(idx - 1) % companiesList.length],
        positionTitle: titlesList[(idx - 1) % titlesList.length],
        employmentType: 'Full-time',
        startDate: addDays(baseDate, -365 * 2),
        endDate: null,
        isCurrent: true,
        description: `• Tham gia phát triển và duy trì sản phẩm cốt lõi của công ty.\n• Phối hợp chặt chẽ với Product Owner và Designers để tối ưu trải nghiệm người dùng.\n• Áp dụng quy trình CI/CD tự động hóa kiểm thử và triển khai ứng dụng.\n• Hướng dẫn và cố vấn (mentor) cho các lập trình viên mới gia nhập nhóm.`,
        technologies: candidateSkills.slice(0, 5).join(', '),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
      candidateSkills.slice(0, 5).forEach((skillName) => {
        const skillRecord = skills[skillName];
        if (skillRecord) {
          experienceSkillsToCreate.push({
            id: randomUUID(),
            candidateExperienceId: expId,
            skillId: skillRecord.id,
          });
        }
      });
    } else {
      if (roleIdx !== 0 && roleIdx !== 1) {
        const expId = randomUUID();
        const companyName =
          roleIdx === 6
            ? 'Axon Active'
            : roleIdx === 5
              ? 'VNG Corporation'
              : roleIdx === 4
                ? 'VinAI'
                : 'ABC Tech';
        const positionTitle =
          roleIdx === 6
            ? 'Engineering Manager'
            : roleIdx === 5
              ? 'Technical Lead'
              : roleIdx === 4
                ? 'Senior AI Engineer'
                : 'Junior Developer';

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
          const skillRecord = skills[skillName];
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
            description: `Designed microservices architectures, mentored junior developers, and streamlined CI/CD workflows.`,
            technologies: 'TypeScript, React, AWS, Docker',
            sortOrder: 1,
            createdAt: baseDate,
            updatedAt: baseDate,
          });

          ['TypeScript', 'React', 'AWS'].forEach((skillName) => {
            const skillRecord = skills[skillName];
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
    }

    // 5. Projects
    if (idx < 10) {
      const projectNames = [
        'Personal Portfolio Website',
        'E-commerce Platform',
        'Chat Realtime System',
        'Smart IoT Dashboard',
        'AI Smart Assistant',
      ];
      projectsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: projectNames[idx % projectNames.length],
        role: idx === 9 ? 'UI/UX Designer' : 'Fullstack Developer',
        description:
          'Dự án cá nhân nhằm áp dụng các công nghệ hiện đại để giải quyết bài toán quản lý và tối ưu hóa trải nghiệm người dùng.',
        projectUrl: `https://github.com/seed/project-${idx}`,
        technologies: candidateSkills.slice(0, 3).join(', '),
        deployUrl: `https://demo-project-${idx}.dev`,
        startDate: addDays(baseDate, -90),
        endDate: addDays(baseDate, -45),
        sortOrder: 0,
        createdAt: baseDate,
        updatedAt: baseDate,
      });
    } else {
      if (roleIdx === 0) {
        projectsToCreate.push({
          id: randomUUID(),
          candidateProfileId: profileId,
          name: 'Task Manager API',
          role: 'Solo Developer',
          description:
            'A RESTful API built to manage daily tasks, supporting CRUD operations and JWT authentication.',
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
          description:
            'A modern, responsive portfolio website featuring glassmorphism design and smooth page transitions.',
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
          description:
            'Developed the checkout and inventory service handling 10k concurrent users during flash sales.',
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
    }

    // 6. Certifications
    if (idx < 10) {
      if (idx === 5) {
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
    } else {
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
    }
  }

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

  const companyByKey = Object.fromEntries(companies.map((company: any) => [company.key, company]));
  const recruiterByCompanyId = recruiters.reduce((acc: Record<string, any>, recruiter: any) => {
    const existing = acc[recruiter.companyId];
    if (!existing || recruiter.roleCode === 'OWNER') {
      acc[recruiter.companyId] = recruiter;
    }
    return acc;
  }, {});

  const jobDefinitions = diversifyJobPostSeedData(loadJobPostSeedData(), now);

  const jobs = [];

  for (const def of jobDefinitions) {
    const company = companies.find((c: any) => c.slug === def.companySlug);
    if (!company) {
      throw new Error(`Company slug "${def.companySlug}" not found`);
    }
    const recruiter = recruiterByCompanyId[company.id];
    if (!recruiter) {
      throw new Error(`Recruiter OWNER for company "${company.name}" not found`);
    }

    // Upsert Category
    const jobCategory = await prisma.jobCategory.upsert({
      where: { name: def.jobCategory.name },
      update: {},
      create: { name: def.jobCategory.name },
    });

    // Upsert Experience Level
    const experienceLevel = await prisma.experienceLevel.upsert({
      where: { code: def.experienceLevel.code },
      update: { name: def.experienceLevel.name },
      create: { code: def.experienceLevel.code, name: def.experienceLevel.name },
    });

    // Upsert Employment Type
    const employmentType = await prisma.employmentType.upsert({
      where: { name: def.employmentType.name },
      update: {},
      create: { name: def.employmentType.name },
    });

    const jobId = randomUUID();

    jobs.push({
      ...def,
      id: jobId,
      companyId: company.id,
      recruiterId: recruiter.id,
      employmentTypeId: employmentType.id,
      experienceLevelId: experienceLevel.id,
      jobCategoryId: jobCategory.id,
      city: def.locations[0]?.city || 'Hồ Chí Minh',
      workMode: def.locations[0]?.workingModel || 'HYBRID',
      publishedAt: new Date(def.publishedAt),
      expiredAt: new Date(def.expiredAt),
      createdAt: new Date(def.publishedAt), // set createdAt = publishedAt
    });
  }

  // Create Job Posts
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
      description: job.description,
      requirements: job.requirements,
      benefits: job.benefits,
      workingDays: job.workingDays,
      educationLevel: job.educationLevel as EducationLevel,
      salaryMin: job.salaryMin != null ? new Prisma.Decimal(job.salaryMin) : null,
      salaryMax: job.salaryMax != null ? new Prisma.Decimal(job.salaryMax) : null,
      salaryCurrency: job.salaryCurrency,
      salaryPeriod: job.salaryPeriod as SalaryPeriod,
      salaryIsNegotiable: job.salaryIsNegotiable,
      salaryIsVisible: job.salaryIsVisible,
      vacanciesCount: job.vacanciesCount ?? job.numberOfRecruits ?? 3,
      status: job.status as JobStatus,
      moderationStatus: job.moderationStatus as ModerationStatus,
      moderationNote: job.moderationNote,
      reason: job.reason,
      publishedAt: job.publishedAt,
      expiredAt: job.expiredAt,
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
    })),
  });

  // Create Locations
  for (const job of jobs) {
    for (const loc of job.locations) {
      const locId = randomUUID();
      await prisma.companyLocation.create({
        data: {
          id: locId,
          companyId: job.companyId,
          country: loc.country,
          workingModel: loc.workingModel as any,
          city: loc.city,
          district: loc.district,
          address: loc.address,
        },
      });
      await prisma.jobPostLocation.create({
        data: {
          jobPostId: job.id,
          jobLocationId: locId,
        },
      });
    }
  }

  // Create Skills
  for (const job of jobs) {
    for (const sk of job.skills) {
      const skillRecord = await prisma.skill.upsert({
        where: { name: sk.name },
        update: {},
        create: { name: sk.name },
      });
      await prisma.jobPostSkill.create({
        data: {
          jobPostId: job.id,
          skillId: skillRecord.id,
          priority: (sk.priority === 'REQUIRED' ? 'REQUIRED' : 'NICE_TO_HAVE') as any,
          minYearsExperience: sk.minYearsExperience || null,
        },
      });
    }
  }

  // Create Specializations
  for (const job of jobs) {
    for (const spec of job.specializations) {
      const specRecord = await prisma.specialization.upsert({
        where: { slug: spec.slug },
        update: { name: spec.name },
        create: { name: spec.name, slug: spec.slug },
      });
      await prisma.jobPostSpecialization.create({
        data: {
          jobPostId: job.id,
          specializationId: specRecord.id,
          isRequired: spec.isRequired,
        },
      });
    }
  }
  console.log('Seeding views, applications, status logs, saved jobs dynamically...');

  // 1. Get all jobs in database (both hardcoded and imported)
  const allDbJobs = await prisma.jobPost.findMany({
    include: {
      createdByRecruiter: true,
    },
  });

  const viewsToCreate: Prisma.JobViewCreateManyInput[] = [];
  const applicationsToCreate: any[] = [];
  const savedJobsToCreate: Prisma.SavedJobCreateManyInput[] = [];

  const candidateProfiles = candidates.map((c) => ({
    profileId: c.profileId,
    accountId: c.accountId,
    fullName: c.fullName,
  }));

  // Helper for random choices
  const randomBetween = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;
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

    // Seed views. Use a long-tail spread (most jobs modest, a "hot" minority much
    // higher) instead of a narrow 80-250 band — that band was so tight relative to
    // ~250 jobs that top-viewed lists kept showing duplicate/near-duplicate counts.
    const isHotJob = Math.random() < 0.12;
    const viewsCount = isHotJob ? randomBetween(600, 4200) : randomBetween(15, 420);
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
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
      if (rand < 0.4) status = ApplicationStatus.SUBMITTED;
      else if (rand < 0.65) status = ApplicationStatus.VIEWED;
      else if (rand < 0.8) status = ApplicationStatus.SHORTLISTED;
      else if (rand < 0.9) status = ApplicationStatus.INTERVIEWING;
      else if (rand < 0.94) status = ApplicationStatus.OFFERED;
      else if (rand < 0.96) status = ApplicationStatus.HIRED;
      else if (rand < 0.98) status = ApplicationStatus.REJECTED;
      else status = ApplicationStatus.WITHDRAWN;

      const submittedAt = addDays(jobCreatedAt, randomBetween(1, 10) + Math.random());

      const coverLetters = [
        `Kính gửi Bộ phận Tuyển dụng,\nTôi xin ứng tuyển vào vị trí ${job.title} tại Quý công ty. Với kiến thức và kinh nghiệm hiện tại, tôi mong muốn được đồng hành và phát triển cùng công ty.\n\nTrân trọng,\n${candidate.fullName}`,
        `Dear Hiring Team,\nI am writing to apply for the ${job.title} position. Given my technical background and background in the field, I am confident I will be a great fit for your team.\n\nBest regards,\n${candidate.fullName}`,
        `Chào anh/chị tuyển dụng,\nTôi muốn gửi hồ sơ ứng tuyển cho công ty mình vị trí ${job.title}. Tôi tin mình có thể đáp ứng tốt các yêu cầu của công việc.\n\nCảm ơn anh/chị,\n${candidate.fullName}`,
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
      data: applicationsToCreate.map((app) => ({
        id: app.id,
        jobPostId: app.jobPostId,
        candidateProfileId: app.candidateProfileId,
        cvVersionId: app.cvVersionId,
        coverLetter: app.coverLetter,
        status: app.status,
        submittedAt: app.submittedAt,
        // Mọi hồ sơ vượt qua SUBMITTED đều có log "Recruiter viewed application details" ở
        // mốc +2h bên dưới, nên viewedAt phải khớp mốc đó. Thiếu nó thì hồ sơ đang phỏng vấn
        // vẫn bị đếm là "chưa xem". WITHDRAWN là ứng viên tự rút khi chưa ai mở nên vẫn null.
        viewedAt:
          app.status === ApplicationStatus.SUBMITTED || app.status === ApplicationStatus.WITHDRAWN
            ? null
            : new Date(app.submittedAt.getTime() + 2 * 60 * 60 * 1000),
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
      })),
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

    const recruiter = recruiters.find((r: any) => r.id === recruiterAccountId);
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

      const interviewType: InterviewType =
        Math.random() < 0.3 ? InterviewType.ONSITE : InterviewType.ONLINE;

      let interviewStatus: InterviewStatus;
      let interviewResult: InterviewResult;
      let recruiterNote: string;

      if ([ApplicationStatus.OFFERED, ApplicationStatus.HIRED].includes(targetStatus)) {
        interviewStatus = InterviewStatus.COMPLETED;
        interviewResult = InterviewResult.PASSED;
        recruiterNote = 'Candidate showed good communications and technical depth.';
      } else {
        const outcomeRoll = Math.random();
        if (outcomeRoll < 0.4) {
          interviewStatus = InterviewStatus.SCHEDULED;
          interviewResult = InterviewResult.PENDING;
          recruiterNote = 'Interview scheduled, awaiting outcome.';
        } else if (outcomeRoll < 0.55) {
          interviewStatus = InterviewStatus.RESCHEDULED;
          interviewResult = InterviewResult.PENDING;
          recruiterNote = 'Candidate requested a new time slot.';
        } else if (outcomeRoll < 0.7) {
          interviewStatus = InterviewStatus.COMPLETED;
          interviewResult = InterviewResult.PASSED;
          recruiterNote = 'Candidate showed good communications and technical depth.';
        } else if (outcomeRoll < 0.85) {
          interviewStatus = InterviewStatus.COMPLETED;
          interviewResult = InterviewResult.FAILED;
          recruiterNote = 'Candidate lacked the required technical depth for this role.';
        } else if (outcomeRoll < 0.93) {
          interviewStatus = InterviewStatus.CANCELLED;
          interviewResult = InterviewResult.PENDING;
          recruiterNote = 'Interview cancelled by recruiter due to a scheduling conflict.';
        } else {
          interviewStatus = InterviewStatus.NO_SHOW;
          interviewResult = InterviewResult.PENDING;
          recruiterNote = 'Candidate did not join the scheduled interview.';
        }
      }

      interviewsData.push({
        id: interviewId,
        recruiterProfileId,
        applicationId: app.id,
        interviewRound: 1,
        type: interviewType,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        meetingUrl:
          interviewType === InterviewType.ONLINE ? 'https://zoom.us/j/upnext-mock-meeting' : null,
        location: interviewType === InterviewType.ONSITE ? 'Tầng 5, văn phòng công ty' : null,
        status: interviewStatus,
        result: interviewResult,
        recruiterNote,
        rescheduleCount: interviewStatus === InterviewStatus.RESCHEDULED ? 1 : 0,
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

      if (interviewStatus === InterviewStatus.RESCHEDULED) {
        interviewLogsData.push({
          id: randomUUID(),
          interviewId,
          oldStatus: InterviewStatus.SCHEDULED,
          newStatus: InterviewStatus.RESCHEDULED,
          proposedStartAt: addDays(startAt, 2),
          proposedEndAt: addDays(endAt, 2),
          actorType: ActorType.CANDIDATE,
          actorId: candidateAccountId,
          note: 'Candidate requested to reschedule the interview',
          createdAt: addDays(baseTime, 3),
        });
      } else if (interviewStatus === InterviewStatus.CANCELLED) {
        interviewLogsData.push({
          id: randomUUID(),
          interviewId,
          oldStatus: InterviewStatus.SCHEDULED,
          newStatus: InterviewStatus.CANCELLED,
          actorType: ActorType.RECRUITER,
          actorId: recruiterAccountId,
          note: 'Interview cancelled due to a scheduling conflict',
          createdAt: addDays(baseTime, 3),
        });
      } else if (interviewStatus === InterviewStatus.NO_SHOW) {
        interviewLogsData.push({
          id: randomUUID(),
          interviewId,
          oldStatus: InterviewStatus.SCHEDULED,
          newStatus: InterviewStatus.NO_SHOW,
          actorType: ActorType.RECRUITER,
          actorId: recruiterAccountId,
          note: 'Candidate did not show up for the interview',
          createdAt: endAt,
        });
      } else if (interviewStatus === InterviewStatus.COMPLETED) {
        interviewLogsData.push({
          id: randomUUID(),
          interviewId,
          oldStatus: InterviewStatus.SCHEDULED,
          newStatus: InterviewStatus.COMPLETED,
          actorType: ActorType.RECRUITER,
          actorId: recruiterAccountId,
          note: `Interview result recorded: ${interviewResult}`,
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
      jobPost: true,
    },
  });

  const hiredAlphaApp = allInsertedApps.find(
    (app) => app.status === ApplicationStatus.HIRED && app.jobPost.companyId === alphaCompany.id,
  );

  if (hiredAlphaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        candidateProfileId: hiredAlphaApp.candidateProfileId,
        companyId: alphaCompany.id,
        overallRating: 5,
        summary:
          'Môi trường làm việc tuyệt vời, quy trình tuyển dụng chuyên nghiệp và nhanh chóng.',
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
    (app) =>
      app.status === ApplicationStatus.SHORTLISTED && app.jobPost.companyId === betaCompany.id,
  );
  if (pendingBetaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        candidateProfileId: pendingBetaApp.candidateProfileId,
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
    (app) =>
      app.status === ApplicationStatus.INTERVIEWING && app.jobPost.companyId === gammaCompany.id,
  );
  if (approvedGammaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        candidateProfileId: approvedGammaApp.candidateProfileId,
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
    (app) => app.status === ApplicationStatus.HIRED && app.jobPost.companyId === deltaCompany.id,
  );
  if (hiredDeltaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        candidateProfileId: hiredDeltaApp.candidateProfileId,
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
    (app) =>
      app.status === ApplicationStatus.SUBMITTED && app.jobPost.companyId === deltaCompany.id,
  );
  if (submittedDeltaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        candidateProfileId: submittedDeltaApp.candidateProfileId,
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
    (app) => app.status === ApplicationStatus.REJECTED && app.jobPost.companyId === alphaCompany.id,
  );
  if (rejectedAlphaApp) {
    await prisma.companyReview.create({
      data: {
        id: randomUUID(),
        candidateProfileId: rejectedAlphaApp.candidateProfileId,
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
      paidAt: addDays(now, -2),
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
      startedAt: addDays(now, -8),
      expiredAt: addDays(now, 22),
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
      paidAt: addDays(now, -8),
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
      content:
        '<p>Writing a great CV is the first step in landing your dream tech job. Focus on impact, highlight your tech stack, and keep it concise.</p>',
      status: 'PUBLISHED',
      type: 'BLOG',
      categoryId: careerCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Top 5 CV Writing Tips for IT Candidates | UpNext',
      metaDescription:
        'Learn how to write a standout resume for software engineering roles with our top 5 CV writing tips.',
      metaKeywords: 'cv writing, resume tips, software engineer resume, it resume',
      ...getHomePostSeedMetadata(`${SEED_KEY}-top-5-cv-writing-tips`),
    },
  });

  const post2 = await prisma.post.create({
    data: {
      title: 'How AI is Revolutionizing Developer Hiring',
      slug: `${SEED_KEY}-how-ai-revolutionizing-hiring`,
      content:
        '<p>AI matching and mock interviews are transforming the recruitment process, enabling companies to identify top technical talent more efficiently.</p>',
      status: 'PUBLISHED',
      type: 'NEWS',
      categoryId: hiringCategory.id,
      adminId: adminUser.id,
      metaTitle: 'How AI is Revolutionizing Developer Hiring | UpNext News',
      metaDescription:
        'Discover the latest trends in tech recruitment and how AI is helping recruiters find top developer talent.',
      metaKeywords: 'ai recruiting, developer hiring, recruitment automation',
      ...getHomePostSeedMetadata(`${SEED_KEY}-how-ai-revolutionizing-hiring`),
    },
  });

  const post3 = await prisma.post.create({
    data: {
      title: 'Salary Negotiation: A Guide for Developers',
      slug: `${SEED_KEY}-salary-negotiation-guide`,
      content:
        '<p>Negotiating your salary can be daunting. Research market rates, highlight your unique skills, and be ready to discuss total compensation packages.</p>',
      status: 'PUBLISHED',
      type: 'BLOG',
      categoryId: careerCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Salary Negotiation Guide for Software Developers | UpNext',
      metaDescription:
        'A step-by-step guide to help software developers negotiate salary, benefits, and equity packages.',
      metaKeywords: 'salary negotiation, developer salary, compensation package',
      ...getHomePostSeedMetadata(`${SEED_KEY}-salary-negotiation-guide`),
    },
  });

  const post4 = await prisma.post.create({
    data: {
      title: 'Why NestJS is the Best Node.js Framework in 2026',
      slug: `${SEED_KEY}-why-nestjs-best-framework`,
      content:
        '<p>NestJS provides an out-of-the-box architecture that makes building scalable, maintainable, and enterprise-grade backend systems a breeze.</p>',
      status: 'PUBLISHED',
      type: 'BLOG',
      categoryId: techCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Why NestJS is the Best Node.js Framework | UpNext',
      metaDescription:
        'Explore the key features of NestJS that make it the industry standard for backend development.',
      metaKeywords: 'nestjs, nodejs, backend framework, web architecture',
      ...getHomePostSeedMetadata(`${SEED_KEY}-why-nestjs-best-framework`),
    },
  });

  const post5 = await prisma.post.create({
    data: {
      title: 'Draft: Getting Started with TypeScript 5.x',
      slug: `${SEED_KEY}-getting-started-typescript-5`,
      content:
        '<p>TypeScript 5.x brings a ton of performance improvements and new features like decorators. Here is how you can start using it today.</p>',
      status: 'DRAFT',
      type: 'BLOG',
      categoryId: techCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Getting Started with TypeScript 5.x | UpNext',
      metaDescription: 'A beginner-friendly guide to setting up and starting with TypeScript 5.x.',
      metaKeywords: 'typescript, ts, javascript development, typed js',
      ...getHomePostSeedMetadata(`${SEED_KEY}-getting-started-typescript-5`),
    },
  });

  const post6 = await prisma.post.create({
    data: {
      title: 'Archived: Legacy Coding Standards in 2024',
      slug: `${SEED_KEY}-legacy-coding-standards-2024`,
      content:
        '<p>This document details the older guidelines and conventions used for JavaScript development prior to the modern ES2026 upgrade.</p>',
      status: 'ARCHIVED',
      type: 'BLOG',
      categoryId: techCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Legacy Coding Standards in 2024 | UpNext',
      metaDescription: 'Archived coding practices and standards for Node.js projects.',
      metaKeywords: 'legacy code, coding standards, javascript guidelines',
      ...getHomePostSeedMetadata(`${SEED_KEY}-legacy-coding-standards-2024`),
    },
  });

  const post7 = await prisma.post.create({
    data: {
      title: 'FAQ: How to apply for jobs on UpNext',
      slug: `${SEED_KEY}-faq-how-to-apply`,
      content:
        '<p>Applying for jobs on UpNext is very straightforward. Create your profile, upload your CV, and click the Apply button on any active job post.</p>',
      status: 'PUBLISHED',
      type: 'FAQ',
      categoryId: careerCategory.id,
      adminId: adminUser.id,
      metaTitle: 'FAQ: How to apply for jobs on UpNext | Help Center',
      metaDescription:
        'Frequently asked questions about applying for software engineering jobs on UpNext.',
      metaKeywords: 'faq, job application, candidate guide, support',
      ...getHomePostSeedMetadata(`${SEED_KEY}-faq-how-to-apply`),
    },
  });

  const post8 = await prisma.post.create({
    data: {
      title: 'Draft: Understanding Web3 and Smart Contracts',
      slug: `${SEED_KEY}-understanding-web3`,
      content:
        '<p>A deep dive into decentralization, smart contracts, Solidity development, and what the future of blockchain technology holds for developers.</p>',
      status: 'DRAFT',
      type: 'NEWS',
      categoryId: hiringCategory.id,
      adminId: adminUser.id,
      metaTitle: 'Understanding Web3 and Smart Contracts | UpNext',
      metaDescription: 'Learn the fundamentals of Web3 and how smart contracts work on Ethereum.',
      metaKeywords: 'web3, blockchain, smart contract, solidity, ethereum',
      ...getHomePostSeedMetadata(`${SEED_KEY}-understanding-web3`),
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
      { postId: post5.id, tagId: aiTag.id },
      { postId: post6.id, tagId: aiTag.id },
      { postId: post7.id, tagId: interviewTag.id },
      { postId: post8.id, tagId: brandingTag.id },
    ],
  });

  // --- Seed Reports ---
  console.log('Seeding reports dynamically...');
  const dbCandidateProfiles = await prisma.candidateProfile.findMany({
    take: 5,
  });
  const dbJobPosts = await prisma.jobPost.findMany({
    take: 5,
  });
  const dbCompanies = await prisma.company.findMany({
    take: 5,
  });

  if (dbCandidateProfiles.length > 0) {
    // Report 1: Pending Job Post Report
    await prisma.report.create({
      data: {
        reporterType: ActorType.CANDIDATE,
        reporterCandidateId: dbCandidateProfiles[0].id,
        targetType: 'JOB_POST',
        targetId: dbJobPosts[0]?.id || '00000000-0000-0000-0000-000000000000',
        reason: 'This job post contains misleading salary information and scam links.',
        status: 'PENDING',
      },
    });

    // Report 2: Resolved Company Report
    await prisma.report.create({
      data: {
        reporterType: ActorType.CANDIDATE,
        reporterCandidateId: dbCandidateProfiles[1 % dbCandidateProfiles.length].id,
        targetType: 'COMPANY',
        targetId: dbCompanies[0]?.id || '00000000-0000-0000-0000-000000000000',
        reason: 'The company is posting spam messages and copying logos from other brands.',
        status: 'RESOLVED',
        handledByAdminId: adminUser.id,
      },
    });

    // Report 3: Reviewing Candidate Profile Report
    await prisma.report.create({
      data: {
        reporterType: ActorType.CANDIDATE,
        reporterCandidateId: dbCandidateProfiles[2 % dbCandidateProfiles.length].id,
        targetType: 'CANDIDATE',
        targetId:
          dbCandidateProfiles[3 % dbCandidateProfiles.length]?.id ||
          '00000000-0000-0000-0000-000000000000',
        reason: 'This profile contains highly inappropriate language and fake certificates.',
        status: 'REVIEWING',
      },
    });

    // Report 4: Pending Post/Blog Report
    await prisma.report.create({
      data: {
        reporterType: ActorType.CANDIDATE,
        reporterCandidateId: dbCandidateProfiles[0].id,
        targetType: 'POST',
        targetId: post1.id,
        reason: 'This article is plagiarized directly from another blog post.',
        status: 'PENDING',
      },
    });
  }
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
        content:
          'Kính gửi Ban quản trị UpNext, tôi đã gửi lại giấy phép đăng ký kinh doanh được cập nhật mới nhất của công ty Bluewave Outsourcing. Mong ban quản trị hỗ trợ xác thực lại trạng thái doanh nghiệp để chúng tôi có thể bắt đầu đăng tin tuyển dụng. Xin cảm ơn.',
        status: 'PENDING',
        createdAt: addDays(now, -5),
        updatedAt: addDays(now, -5),
      },
      {
        id: randomUUID(),
        recruiterAccountId: deltaRecruiter.id,
        targetType: 'COMPANY',
        targetId: companies[3].id, // Delta Company
        content:
          'Chúng tôi đã cập nhật mã số thuế chính xác và đính kèm bản quét giấy phép kinh doanh có công chứng của Vertex Commerce Tech. Đề nghị kiểm tra và mở khóa tài khoản để chúng tôi tiếp tục tuyển dụng.',
        status: 'REJECTED',
        handledByAdminId: complianceAdmin.id,
        createdAt: addDays(now, -10),
        updatedAt: addDays(now, -8),
      },
    ],
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
        newValue: JSON.stringify({
          verificationStatus: 'REJECTED',
          reason: 'Giấy phép đăng ký kinh doanh không hợp lệ hoặc đã quá hạn hiệu lực.',
        }),
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
        oldValue: Prisma.DbNull,
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
        oldValue: Prisma.DbNull,
        newValue: JSON.stringify({ viewed: true }),
        createdAt: addDays(now, -1),
      },
    ],
  });

  // Seed Reports
  await prisma.report.createMany({
    data: [
      {
        id: randomUUID(),
        reporterType: ActorType.CANDIDATE,
        reporterCandidateId: candidates[0].profileId,
        targetType: 'COMPANY',
        targetId: companies[3].id, // Delta Company
        reason:
          'Công ty yêu cầu ứng viên đóng tiền cọc trước khi phỏng vấn, có dấu hiệu lừa đảo và không minh bạch.',
        status: 'RESOLVED',
        handledByAdminId: complianceAdmin.id,
        createdAt: addDays(now, -4),
        updatedAt: addDays(now, -2),
      },
      {
        id: randomUUID(),
        reporterType: ActorType.CANDIDATE,
        reporterCandidateId: candidates[1].profileId,
        targetType: 'JOB_POST',
        targetId: jobs[4].id, // Frontend React Engineer at Bluewave
        reason:
          'Nội dung tuyển dụng yêu cầu phân biệt giới tính và tuổi tác một cách phi lý, không tuân thủ chính sách lao động.',
        status: 'PENDING',
        createdAt: addDays(now, -1),
        updatedAt: addDays(now, -1),
      },
    ],
  });

  // Disable ITviec data import to keep only the custom job posts
  /*
  await importItviecData(
    passwordHash,
    recruiterRole as { id: string },
    employmentTypes,
    experienceLevels,
    categories,
    specializations,
  );
  */
  console.log(
    `Home seed complete: ${companies.length} companies, ${jobs.length} jobs, ${applicationsToCreate.length} applications.`,
  );

  await seedCandidatesAndApplications(prisma);
  await seedRichPosts(adminUser.id, now);
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
        endsWith: '.imported@gmail.com',
      },
    },
  });

  await prisma.companyLocation.deleteMany({
    where: {
      jobPostLocations: {
        none: {},
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
  specializations: Record<string, { id: string }>,
) {
  const now = new Date();
  console.log('Loading ITviec data files...');
  const jobsPath = path.join(__dirname, 'data/itviec-jobs-backend.json');
  const companiesPath = path.join(__dirname, 'data/companies_detailed.json');

  if (!fs.existsSync(jobsPath) || !fs.existsSync(companiesPath)) {
    console.warn('ITviec data files not found. Skipping import.');
    return;
  }

  const jobsData = JSON.parse(fs.readFileSync(jobsPath, 'utf-8')) as { jobs: ImportedItviecJob[] };
  const companiesData = JSON.parse(fs.readFileSync(companiesPath, 'utf-8')) as any[];

  const companiesWithLogo = companiesData.filter(
    (item) =>
      item.Slug &&
      item.Name &&
      item.Logo &&
      typeof item.Logo === 'string' &&
      item.Logo.trim() !== '',
  );
  const companiesToImport =
    companiesWithLogo.length >= 54
      ? companiesWithLogo.slice(4, 54)
      : companiesWithLogo.slice(0, Math.min(50, companiesWithLogo.length));

  console.log(
    `Loaded ${companiesData.length} companies. Importing ${companiesToImport.length} companies with logos and ${jobsData.jobs.length} jobs.`,
  );

  const companyTypesBySlug = new Map<string, string>();
  const companySizesBySlug = new Map<string, string>();

  for (const job of jobsData.jobs) {
    if (job.company?.slug) {
      if (job.company.type)
        companyTypesBySlug.set(job.company.slug as string, job.company.type as string);
      if (job.company.companySize)
        companySizesBySlug.set(job.company.slug as string, job.company.companySize as string);
    }
  }

  console.log('Importing companies...');
  const companySlugToDetails = new Map<string, { companyId: string; recruiterId: string }>();

  for (const item of companiesToImport) {
    if (!item.Slug || !item.Name) continue;

    const logoFileId = randomUUID();
    const logoUrl = item.Logo as string;
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
        publicUrl: logoUrl,
      },
    });

    // Map company type
    let companyType: CompanyType = CompanyType.OTHER;
    const jsonType =
      companyTypesBySlug.get(item.Slug as string) || (item.Type as string | undefined);
    if (jsonType) {
      const t = jsonType.toUpperCase();
      if (t.includes('PRODUCT')) companyType = CompanyType.PRODUCT;
      else if (t.includes('OUTSOURCING') || t.includes('SERVICE'))
        companyType = CompanyType.OUTSOURCING;
      else if (t.includes('STARTUP')) companyType = CompanyType.STARTUP;
      else if (t.includes('AGENCY')) companyType = CompanyType.AGENCY;
    }

    let companySize =
      companySizesBySlug.get(item.Slug as string) ||
      (item['General Information'] as string | undefined) ||
      null;
    if (companySize && companySize.length > 75) {
      companySize = companySize.substring(0, 72) + '...';
    }

    let address = item.Location || null;
    if (address && address.length > 250) {
      address = address.substring(0, 247) + '...';
    }

    const hashSlug = createHash('md5')
      .update(item.Slug as string)
      .digest('hex')
      .substring(0, 30);

    const companyId = randomUUID();
    const coverFileId = randomUUID();
    const coverUrls = [
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=400&fit=crop&q=80',
      'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=800&h=400&fit=crop&q=80',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop&q=80',
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=400&fit=crop&q=80',
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=400&fit=crop&q=80',
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&h=400&fit=crop&q=80',
      'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=400&fit=crop&q=80',
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=400&fit=crop&q=80',
    ];
    const randomCoverUrl =
      coverUrls[
        Math.abs(createHash('md5').update(item.Slug).digest().readInt32BE(0)) % coverUrls.length
      ];

    await prisma.fileAsset.create({
      data: {
        id: coverFileId,
        ownerType: 'company_cover',
        ownerId: companyId,
        purpose: FilePurpose.OTHER,
        visibility: FileVisibility.PUBLIC,
        storageKey: `imported/covers/${item.Slug}`,
        originalName: `${item.Slug}-cover`,
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(0),
        publicUrl: randomCoverUrl,
      },
    });

    await prisma.company.create({
      data: {
        id: companyId,
        name: item.Name,
        slug: item.Slug,
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
    let email = `${item.Slug}.imported@gmail.com`;
    if (item.Slug === 'mb-bank') {
      email = 'max.imported@gmail.com';
    }

    const dayOffset = (item.Slug.charCodeAt(0) || 0) % 30;
    const recordDate = addDays(now, -dayOffset);

    await prisma.recruiterAccount.create({
      data: {
        id: recruiterId,
        companyId: companyId,
        recruiterRoleId: recruiterRole.id,
        email: email,
        passwordHash: passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: recordDate,
        createdAt: recordDate,
        updatedAt: recordDate,
      },
    });

    await prisma.recruiterProfile.create({
      data: {
        id: recruiterProfileId,
        recruiterAccountId: recruiterId,
        fullName: `${item.Name} Recruiter`,
        avatarUrl: logoUrl,
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
  const IMPORT_JOB_CAP = 50;
  const randomBetween = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  // The crawled ITviec feed tags almost every job "Full-time", which reads as
  // repetitive once it's the only employment type in the imported batch. Nudge a
  // shuffled subset of slots toward the other real employment types instead.
  const employmentTypeOverridePool: Array<keyof typeof employmentTypes | null> = [
    ...Array(Math.round(IMPORT_JOB_CAP * 0.15)).fill('partTime'),
    ...Array(Math.round(IMPORT_JOB_CAP * 0.15)).fill('contract'),
    ...Array(Math.round(IMPORT_JOB_CAP * 0.1)).fill('internship'),
    ...Array(IMPORT_JOB_CAP).fill(null),
  ]
    .slice(0, IMPORT_JOB_CAP)
    .sort(() => 0.5 - Math.random());

  for (const job of jobsData.jobs) {
    if (importedJobsCount >= 50) break;
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
    const employmentTypeOverride = employmentTypeOverridePool[importedJobsCount];
    if (employmentTypeOverride) {
      employmentTypeId = employmentTypes[employmentTypeOverride].id;
    }

    const urlParts = job.source.url.split('/');
    const jobSlug = urlParts[urlParts.length - 1];

    const jobDayOffset = (jobSlug.charCodeAt(0) || 0) % 60;
    const jobRecordDate = addDays(now, -jobDayOffset);
    jobRecordDate.setHours(randomBetween(7, 21), randomBetween(0, 59), 0, 0);
    const jobExpiredDate = addDays(now, randomBetween(3, 55));
    jobExpiredDate.setHours(23, 59, 0, 0);

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
        vacanciesCount: job.jobPost.vacanciesCount || randomBetween(1, 6),
        status: JobStatus.PUBLISHED,
        moderationStatus: 'APPROVED',
        publishedAt: jobRecordDate,
        createdAt: jobRecordDate,
        updatedAt: jobRecordDate,
        expiredAt: jobExpiredDate,
      },
    });

    if (job.locations && Array.isArray(job.locations)) {
      for (const location of job.locations) {
        let workingModel: WorkingModel = WorkingModel.ONSITE;
        if (location.workingModel === 'REMOTE') workingModel = WorkingModel.REMOTE;
        else if (location.workingModel === 'HYBRID') workingModel = WorkingModel.HYBRID;
        else {
          // The crawled feed skews heavily ONSITE (43/50). Nudge a portion toward
          // HYBRID/REMOTE so this batch doesn't read as monolithic on top of the
          // main dataset, while keeping ONSITE the realistic majority.
          const roll = Math.random();
          if (roll < 0.18) workingModel = WorkingModel.REMOTE;
          else if (roll < 0.45) workingModel = WorkingModel.HYBRID;
        }

        const locDetails = getRandomLocationDetails(location.city, job.jobPost.title);
        const locationId = randomUUID();

        await prisma.companyLocation.create({
          data: {
            id: locationId,
            country: 'Vietnam',
            workingModel: workingModel,
            city: locDetails.city,
            district: locDetails.district,
            address: `${locDetails.address}, ${locDetails.district}`,
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

    const originalSkillItems =
      job.skills && Array.isArray(job.skills)
        ? job.skills.filter((skillItem) => Boolean(skillItem.name))
        : [];
    const inferredSkillItems = inferJobSkillNames({
      title: job.jobPost.title,
      categoryName: job.jobPost.jobCategoryName,
      description: job.jobPost.description,
      requirements: job.jobPost.requirements,
      benefits: job.jobPost.benefits,
      specializations: job.specializations,
    }).map((name) => ({
      name,
      minYearsExperience: null,
      inferred: true,
    }));
    const combinedSkillItems: Array<
      ImportedItviecSkill & {
        inferred?: boolean;
      }
    > = [];
    const addedSkillNames = new Set<string>();

    for (const skillItem of [...originalSkillItems, ...inferredSkillItems]) {
      if (!skillItem.name) continue;
      const normalizedName = skillItem.name.toLowerCase();
      if (addedSkillNames.has(normalizedName)) continue;
      addedSkillNames.add(normalizedName);
      combinedSkillItems.push(skillItem);
      if (combinedSkillItems.length >= 8) break;
    }

    if (combinedSkillItems.length > 0) {
      const addedSkillIds = new Set<string>();
      for (const skillItem of combinedSkillItems) {
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
            minYearsExperience:
              skillItem.minYearsExperience != null ? skillItem.minYearsExperience : null,
            priority: skillItem.inferred ? SkillPriority.NICE_TO_HAVE : SkillPriority.REQUIRED,
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

  // Seed candidate CVs
  await seedCandidatesAndApplications(prisma);
}

async function seedCandidatesAndApplications(prisma: PrismaClient) {
  // Find FPT Software company dynamically
  const fptSoftware = await prisma.company.findUnique({
    where: { slug: 'fpt-software' },
  });

  if (!fptSoftware) {
    console.log('[SEED] Warning: FPT Software company not found. Skipping custom seeding.');
    return;
  }

  const recruiterRole = await prisma.recruiterRole.findFirst({
    where: { code: 'OWNER' },
  });

  if (!recruiterRole) {
    console.log('[SEED] Warning: OWNER recruiter role not found. Skipping custom seeding.');
    return;
  }

  const recruiterAccountId = 'a6276a27-97ca-4fbb-8416-cea3e517126e';
  const recruiterProfileId = '942de3fe-9ee0-42e8-a382-5b967663ea50';
  const passwordHash = await hash('password123', 10);

  // 1. Create or link recruiter account
  await prisma.recruiterAccount.upsert({
    where: { id: recruiterAccountId },
    update: {
      email: 'duycc771@gmail.com',
      companyId: fptSoftware.id,
      recruiterRoleId: recruiterRole.id,
      passwordHash: passwordHash,
      authProvider: AuthProvider.DEFAULT,
      providerUserId: null,
    },
    create: {
      id: recruiterAccountId,
      email: 'duycc771@gmail.com',
      passwordHash: passwordHash,
      authProvider: AuthProvider.DEFAULT,
      providerUserId: null,
      companyId: fptSoftware.id,
      recruiterRoleId: recruiterRole.id,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  // 2. Create or link recruiter profile
  await prisma.recruiterProfile.upsert({
    where: { id: recruiterProfileId },
    update: {},
    create: {
      id: recruiterProfileId,
      recruiterAccountId: recruiterAccountId,
      fullName: 'Duy CC',
    },
  });

  // 3. Create or link company member
  await prisma.companyMember.upsert({
    where: {
      recruiterAccountId_companyId: {
        recruiterAccountId: recruiterAccountId,
        companyId: fptSoftware.id,
      },
    },
    update: {
      roleId: recruiterRole.id,
      status: 'ACTIVE',
    },
    create: {
      recruiterAccountId: recruiterAccountId,
      companyId: fptSoftware.id,
      roleId: recruiterRole.id,
      status: 'ACTIVE',
    },
  });

  // 4. Update the original job post owner to duycc771
  const javaJob = await prisma.jobPost.findFirst({
    where: {
      companyId: fptSoftware.id,
      slug: 'fpt-software-senior-java-backend-engineer',
    },
  });

  const createdJobs = [];
  if (javaJob) {
    await prisma.jobPost.update({
      where: { id: javaJob.id },
      data: { createdByRecruiterId: recruiterAccountId },
    });
    createdJobs.push(javaJob);
  }

  // 5. Create 4 more detailed job posts
  const customJobsData = [
    {
      title: 'Senior React Frontend Developer',
      slug: 'fpt-software-senior-react-frontend-developer',
      categoryName: 'Frontend Engineering',
      expCode: 'senior',
      empName: 'Full-time',
      salaryMin: 30000000,
      salaryMax: 55000000,
      description: `<details open>
  <summary><strong>Mô tả công việc</strong></summary>
  <div>
    <p>Tham gia vào đội ngũ phát triển sản phẩm công nghệ cao tại FPT Software, chịu trách nhiệm xây dựng giao diện người dùng tối ưu, hiệu năng cao và có khả năng mở rộng.</p>
    <ul>
      <li>Xây dựng và phát triển các ứng dụng web quy mô lớn (Single Page Applications, SSR) sử dụng React.js, Next.js và TypeScript.</li>
      <li>Thiết kế, chuẩn hóa và đóng gói hệ thống thư viện thành phần (Design System / Component Library) dùng chung cho toàn bộ dự án của công ty.</li>
      <li>Tối ưu hóa hiệu năng render (Rendering performance, Core Web Vitals), tối ưu bundle size, tải trang nhanh và khả năng tương thích đa trình duyệt.</li>
      <li>Phối hợp chặt chẽ với UI/UX Designers để chuyển dịch bản vẽ Figma thành mã nguồn React chính xác từng pixel và hoạt động mượt mà.</li>
      <li>Quản lý trạng thái ứng dụng linh hoạt sử dụng Redux Toolkit, Zustand hoặc React Query.</li>
      <li>Viết tài liệu kỹ thuật, hướng dẫn lập trình chuẩn và hỗ trợ kỹ thuật cho các thành viên trong dự án.</li>
      <li>Tham gia quy trình review code nghiêm ngặt để đảm bảo chất lượng, tính tái sử dụng và khả năng bảo trì của mã nguồn.</li>
    </ul>
  </div>
</details>`,
      requirements: `<details open>
  <summary><strong>Yêu cầu ứng viên</strong></summary>
  <div>
    <p>Chúng tôi tìm kiếm kỹ sư Frontend đam mê công nghệ, giàu kinh nghiệm thực tế về tối ưu hóa giao diện và làm việc với các hệ thống lớn.</p>
    <ul>
      <li>Tối thiểu 4 năm kinh nghiệm phát triển Frontend chuyên sâu, trong đó ít nhất 3 năm làm việc liên tục với React.js và Next.js.</li>
      <li>Thành thạo TypeScript, Modern JavaScript (ES6+), HTML5, CSS3/SCSS và có tư duy thiết kế layout tốt (Flexbox, CSS Grid).</li>
      <li>Kinh nghiệm làm việc với các thư viện styling lớn như TailwindCSS, Styled Components hoặc Emotion.</li>
      <li>Hiểu sâu về các cơ chế render của Next.js (SSR, SSG, ISR) và quản lý state phức tạp.</li>
      <li>Có kỹ năng tối ưu hóa performance giao diện ứng dụng lớn (Lighthouse audit, lazy loading, code splitting).</li>
      <li>Thành thạo kiểm thử mã nguồn (Jest, React Testing Library, Cypress).</li>
      <li>Kinh nghiệm làm việc trong môi trường Agile/Scrum, sử dụng thành thạo Git/GitHub, CI/CD pipeline (GitHub Actions, Jenkins).</li>
      <li>Khả năng đọc hiểu và giao tiếp kỹ thuật tốt bằng tiếng Anh.</li>
    </ul>
  </div>
</details>`,
      benefits: `<details open>
  <summary><strong>Quyền lợi</strong></summary>
  <div>
    <p>Gia nhập FPT Software, bạn sẽ được hưởng chính sách phúc lợi toàn diện tương xứng với vị trí Senior:</p>
    <ul>
      <li>Mức lương cạnh tranh dao động từ 30.000.000 đến 55.000.000 VND tùy theo năng lực chuyên môn.</li>
      <li>Tháng lương thứ 13 và các khoản thưởng hiệu suất công việc cuối năm lên tới 2-3 tháng lương.</li>
      <li>Gói bảo hiểm sức khỏe cao cấp FPT Care dành riêng cho nhân viên và hỗ trợ người thân.</li>
      <li>Cơ hội làm việc onsite ngắn hạn và dài hạn tại thị trường Nhật Bản, Châu Âu hoặc Mỹ.</li>
      <li>Được cấp trang thiết bị làm việc hiện đại: Macbook Pro hoặc Laptop cấu hình cao cùng màn hình phụ Dell.</li>
      <li>Nghỉ phép 14 ngày/năm và hỗ trợ nghỉ làm hybrid linh hoạt 1-2 ngày/tuần.</li>
      <li>Được tài trợ 100% học phí và lệ phí thi các chứng chỉ công nghệ quốc tế (AWS, Azure, Scrum Master...).</li>
    </ul>
  </div>
</details>`,
      skills: ['React', 'TypeScript', 'Next.js', 'CSS'],
      specialization: 'frontend',
    },
    {
      title: 'AI / Machine Learning Engineer',
      slug: 'fpt-software-ai-machine-learning-engineer',
      categoryName: 'Data & AI',
      expCode: 'mid',
      empName: 'Full-time',
      salaryMin: 35000000,
      salaryMax: 65000000,
      description: `<details open>
  <summary><strong>Mô tả công việc</strong></summary>
  <div>
    <p>Nghiên cứu, phát triển và triển khai tích hợp các giải pháp Trí tuệ nhân tạo (AI/ML) vào hệ thống tuyển dụng thông minh của UpNext.</p>
    <ul>
      <li>Nghiên cứu và ứng dụng các mô hình học máy (Machine Learning), học sâu (Deep Learning) phục vụ bài toán trích xuất thông tin CV (Resume Parsing) và khớp hồ sơ (Resume Matching).</li>
      <li>Xây dựng và tối ưu quy trình Retrieval-Augmented Generation (RAG) sử dụng Vector Database và các mô hình ngôn ngữ lớn (LLMs như Gemini, Llama).</li>
      <li>Huấn luyện, fine-tuning các mô hình ngôn ngữ hoặc thị giác máy tính nhỏ để phục vụ các tác vụ phân loại và chấm điểm hồ sơ ứng viên tự động.</li>
      <li>Thiết kế và triển khai các API phục vụ suy luận mô hình AI tốc độ cao sử dụng Python, FastAPI và Docker.</li>
      <li>Thiết kế quy trình xử lý dữ liệu (ETL pipeline) cho các dữ liệu văn bản phi cấu trúc lớn như PDF, Docx, hình ảnh.</li>
      <li>Đánh giá hiệu năng của các mô hình AI dựa trên các tập dữ liệu thử nghiệm thực tế (Accuracy, Precision, Recall, F1-score).</li>
      <li>Hợp tác với đội ngũ Backend và Product để tích hợp tính năng AI vào sản phẩm thực tế hoạt động ổn định.</li>
    </ul>
  </div>
</details>`,
      requirements: `<details open>
  <summary><strong>Yêu cầu ứng viên</strong></summary>
  <div>
    <p>Yêu cầu kỹ sư AI/ML có nền tảng toán học, giải thuật vững chắc và kinh nghiệm triển khai mô hình AI thực tế.</p>
    <ul>
      <li>Tối thiểu 2 năm kinh nghiệm làm việc ở vị trí AI Engineer hoặc Machine Learning Engineer.</li>
      <li>Thành thạo lập trình Python và làm việc với các thư viện AI/ML: PyTorch, TensorFlow, Scikit-learn, Hugging Face Transformers.</li>
      <li>Hiểu sâu về kiến trúc LLMs, kỹ thuật Prompt Engineering, cấu trúc Vector Database (ChromaDB, FAISS, pgvector) và quy trình RAG.</li>
      <li>Kinh nghiệm xây dựng và đóng gói sản phẩm AI bằng Docker, Docker Compose, triển khai API với FastAPI hoặc Flask.</li>
      <li>Nắm vững kiến thức toán giải tích, đại số tuyến tính, xác suất thống kê ứng dụng trong học máy.</li>
      <li>Hiểu biết về trích xuất văn bản OCR (Tesseract, PaddleOCR) và xử lý ngôn ngữ tự nhiên (NLP) tiếng Việt là lợi thế lớn.</li>
      <li>Có tư duy giải quyết vấn đề tốt, ham học hỏi các công nghệ AI mới và làm việc độc lập/nhóm hiệu quả.</li>
    </ul>
  </div>
</details>`,
      benefits: `<details open>
  <summary><strong>Quyền lợi</strong></summary>
  <div>
    <p>Chính sách đãi ngộ xứng đáng dành cho kỹ sư AI làm việc tại FPT Software:</p>
    <ul>
      <li>Thu nhập hấp dẫn từ 35.000.000 đến 65.000.000 VND cùng gói thưởng dự án định kỳ.</li>
      <li>Nhận gói bảo hiểm sức khỏe cao cấp FPT Care cho bản thân và gia đình.</li>
      <li>Làm việc cùng đội ngũ chuyên gia công nghệ đầu ngành về Trí tuệ Nhân tạo.</li>
      <li>Được tài trợ toàn bộ chi phí thi các chứng chỉ chuyên nghiệp về AI và Cloud (Google Cloud Professional Machine Learning Engineer, AWS Certified Machine Learning...).</li>
      <li>Được cấp thiết bị làm việc GPU Workstation hoặc Macbook M3 Pro chuyên dụng phục vụ việc dev.</li>
      <li>Chế độ làm việc Hybrid mềm dẻo, giờ làm việc linh hoạt, môi trường trẻ trung cởi mở.</li>
    </ul>
  </div>
</details>`,
      skills: ['Python', 'Machine Learning', 'PyTorch', 'TensorFlow', 'LLM'],
      specialization: 'ai',
    },
    {
      title: 'DevOps Cloud Infrastructure Engineer',
      slug: 'fpt-software-devops-cloud-infrastructure-engineer',
      categoryName: 'Security',
      expCode: 'senior',
      empName: 'Full-time',
      salaryMin: 40000000,
      salaryMax: 70000000,
      description: `<details open>
  <summary><strong>Mô tả công việc</strong></summary>
  <div>
    <p>Chịu trách nhiệm thiết kế, triển khai, tối ưu hóa hạ tầng Cloud có tính sẵn sàng cao, bảo mật tốt và quy trình tự động hóa CI/CD cho các sản phẩm của dự án.</p>
    <ul>
      <li>Thiết kế hạ tầng mạng và tài nguyên Cloud có khả năng tự động co giãn (Auto Scaling), khả năng chịu lỗi cao trên nền tảng AWS hoặc Azure.</li>
      <li>Xây dựng, tối ưu hóa và duy trì hệ thống CI/CD pipeline tự động hóa quy trình kiểm thử, build và deploy code liên tục.</li>
      <li>Quản lý hạ tầng bằng mã nguồn (Infrastructure as Code - IaC) sử dụng Terraform hoặc Ansible.</li>
      <li>Quản lý, vận hành và giám sát hệ thống cụm Kubernetes (EKS/AKS) chạy container hóa của ứng dụng.</li>
      <li>Cấu hình các công cụ giám sát hiệu năng hệ thống (Monitoring) và ghi log tập trung sử dụng Prometheus, Grafana, ELK Stack hoặc Datadog.</li>
      <li>Đảm bảo các chính sách bảo mật hạ tầng mạng, quản lý quyền hạn truy cập (IAM), cấu hình firewall, VPN và giám sát các sự cố bảo mật.</li>
      <li>Hỗ trợ đội ngũ Dev điều tra nguyên nhân sự cố hạ tầng và tối ưu hóa chi phí sử dụng tài nguyên Cloud hàng tháng.</li>
    </ul>
  </div>
</details>`,
      requirements: `<details open>
  <summary><strong>Yêu cầu ứng viên</strong></summary>
  <div>
    <p>Chúng tôi tìm kiếm kỹ sư DevOps giàu kinh nghiệm thực tế về hạ tầng Cloud lớn và quản trị Kubernetes chuyên sâu.</p>
    <ul>
      <li>Tối thiểu 3 năm kinh nghiệm thực tế làm việc ở vị trí DevOps Engineer hoặc Cloud Engineer.</li>
      <li>Thành thạo một trong các dịch vụ điện toán đám mây lớn: AWS (Amazon Web Services) hoặc Microsoft Azure.</li>
      <li>Thành thạo công nghệ container (Docker, Docker Compose) và có kinh nghiệm vận hành production thực tế cụm Kubernetes (K8s).</li>
      <li>Thành thạo sử dụng Terraform để cấu hình Infrastructure as Code (IaC).</li>
      <li>Kinh nghiệm xây dựng CI/CD với GitHub Actions, GitLab CI hoặc Jenkins.</li>
      <li>Kinh nghiệm quản trị hệ điều hành Linux (Ubuntu, CentOS), viết bash script hoặc python script tự động hóa.</li>
      <li>Hiểu sâu về bảo mật hạ tầng mạng (VPC, Subnet, Security Group, SSL/TLS, VPN).</li>
      <li>Ưu tiên ứng viên có chứng chỉ chuyên nghiệp về AWS (DevOps Engineer, Solutions Architect) hoặc Kubernetes (CKA, CKAD).</li>
    </ul>
  </div>
</details>`,
      benefits: `<details open>
  <summary><strong>Quyền lợi</strong></summary>
  <div>
    <p>Chế độ đãi ngộ hấp dẫn dành cho kỹ sư DevOps:</p>
    <ul>
      <li>Lương tháng cạnh tranh từ 40.000.000 đến 70.000.000 VND cùng các khoản thưởng dự án.</li>
      <li>Thưởng lương tháng 13 và thưởng hiệu quả hoạt động kinh doanh cuối năm.</li>
      <li>Hưởng đầy đủ bảo hiểm xã hội, y tế cùng gói bảo hiểm sức khỏe đặc biệt FPT Care cao cấp.</li>
      <li>Cung cấp Macbook Pro đời mới cấu hình mạnh mẽ phục vụ công việc.</li>
      <li>Được làm việc Hybrid linh hoạt, chủ động sắp xếp thời gian làm việc.</li>
      <li>Tài trợ 100% học phí và lệ phí thi các chứng chỉ Cloud/DevOps quốc tế cao cấp.</li>
    </ul>
  </div>
</details>`,
      skills: ['Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Terraform'],
      specialization: 'devops',
    },
    {
      title: 'Technical Project Manager / Scrum Master',
      slug: 'fpt-software-technical-project-manager-scrum-master',
      categoryName: 'Operations',
      expCode: 'lead',
      empName: 'Full-time',
      salaryMin: 45000000,
      salaryMax: 80000000,
      description: `<details open>
  <summary><strong>Mô tả công việc</strong></summary>
  <div>
    <p>Đóng vai trò dẫn dắt và điều phối quy trình phát triển sản phẩm phần mềm theo mô hình Agile/Scrum, chịu trách nhiệm về tiến độ, chất lượng dự án và giải quyết các trở ngại của đội ngũ.</p>
    <ul>
      <li>Tổ chức và điều phối các cuộc họp Scrum hàng ngày (Daily Standup), lập kế hoạch sprint (Sprint Planning), review sprint (Sprint Review) và cải tiến quy trình (Retrospective).</li>
      <li>Quản lý tiến độ dự án, dự báo rủi ro kỹ thuật, quản lý phạm vi công việc và xử lý các điểm nghẽn cản trước tiến trình công việc của đội phát triển.</li>
      <li>Hợp tác chặt chẽ với Product Owner để quản lý và tối ưu hóa backlog sản phẩm, làm rõ các User Stories trước khi đưa vào Sprint.</li>
      <li>Theo dõi và trực quan hóa hiệu suất làm việc của nhóm thông qua các biểu đồ (Burndown Chart, Velocity) trên Jira hoặc Confluence.</li>
      <li>Duy trì văn hóa làm việc Agile, khuyến khích tinh thần tự quản lý, hợp tác và liên tục cải tiến hiệu suất trong nhóm.</li>
      <li>Hỗ trợ giao tiếp và kết nối thông tin kỹ thuật giữa đội ngũ phát triển sản phẩm với các bên liên quan (Stakeholders, Khách hàng).</li>
      <li>Tham gia thảo luận kiến trúc hệ thống cấp cao và định hướng kỹ thuật cho dự án để đảm bảo sản phẩm bàn giao đúng chất lượng kỹ thuật.</li>
    </ul>
  </div>
</details>`,
      requirements: `<details open>
  <summary><strong>Yêu cầu ứng viên</strong></summary>
  <div>
    <p>Yêu cầu quản lý dự án có kiến thức nền tảng kỹ thuật tốt và kỹ năng giao tiếp, dẫn dắt đội ngũ xuất sắc.</p>
    <ul>
      <li>Tối thiểu 3 năm kinh nghiệm làm vị trí Project Manager, Scrum Master hoặc Tech Lead trong các dự án phát triển phần mềm.</li>
      <li>Hiểu biết sâu sắc về Agile/Scrum, có kinh nghiệm thực tế áp dụng quy trình Scrum vào quản lý các dự án phần mềm phức tạp.</li>
      <li>Có nền tảng lập trình tốt (từng là Developer hoặc QA Lead) để có thể hiểu rõ các khó khăn kỹ thuật và trao đổi sâu với lập trình viên.</li>
      <li>Thành thạo sử dụng các công cụ quản lý dự án lớn như Jira Software, Confluence, Trello.</li>
      <li>Kỹ năng giao tiếp, thương lượng, thuyết phục và giải quyết mâu thuẫn xuất sắc.</li>
      <li>Có chứng chỉ Scrum Master chuyên nghiệp (CSM, PSM I hoặc PSM II) là một lợi thế lớn.</li>
      <li>Kỹ năng tiếng Anh lưu loát, tự tin giao tiếp kỹ thuật trực tiếp với đối tác/khách hàng quốc tế.</li>
    </ul>
  </div>
</details>`,
      benefits: `<details open>
  <summary><strong>Quyền lợi</strong></summary>
  <div>
    <p>Chính sách đãi ngộ hấp dẫn dành cho Technical Project Manager / Scrum Master:</p>
    <ul>
      <li>Mức thu nhập cạnh tranh từ 45.000.000 đến 80.000.000 VND cùng gói thưởng hiệu năng dự án.</li>
      <li>Lương tháng 13 và thưởng cuối năm theo kết quả kinh doanh của tập đoàn.</li>
      <li>Gói bảo hiểm sức khỏe toàn diện FPT Care dành riêng cho cấp quản lý.</li>
      <li>Được làm việc trong môi trường năng động, chuyên nghiệp và có cơ hội thăng tiến rõ ràng lên Delivery Manager.</li>
      <li>Được cung cấp đầy đủ thiết bị làm việc cao cấp tự chọn (Macbook Pro, Laptop).</li>
      <li>Nghỉ phép 14 ngày/năm, làm việc hybrid linh hoạt, giờ giấc tự chủ.</li>
    </ul>
  </div>
</details>`,
      skills: ['Agile', 'Scrum', 'Project Management'],
      specialization: 'project-management',
    },
  ];

  for (const jobDef of customJobsData) {
    const category = await prisma.jobCategory.findFirst({ where: { name: jobDef.categoryName } });
    const expLevel = await prisma.experienceLevel.findFirst({ where: { code: jobDef.expCode } });
    const empType = await prisma.employmentType.findFirst({ where: { name: jobDef.empName } });
    const spec = await prisma.specialization.findFirst({ where: { slug: jobDef.specialization } });

    if (!category || !expLevel || !empType) {
      console.log(
        `[SEED] Warning: Relational metadata not found for job ${jobDef.title}. Skipping.`,
      );
      continue;
    }

    let job = await prisma.jobPost.findUnique({
      where: { slug: jobDef.slug },
    });

    if (!job) {
      job = await prisma.jobPost.create({
        data: {
          createdByRecruiterId: recruiterAccountId,
          companyId: fptSoftware.id,
          jobCategoryId: category.id,
          experienceLevelId: expLevel.id,
          employmentTypeId: empType.id,
          title: jobDef.title,
          slug: jobDef.slug,
          description: jobDef.description,
          requirements: jobDef.requirements,
          benefits: jobDef.benefits,
          workingDays: 'Thứ 2 - Thứ 6',
          educationLevel: 'BACHELOR',
          salaryMin: jobDef.salaryMin != null ? new Prisma.Decimal(jobDef.salaryMin) : null,
          salaryMax: jobDef.salaryMax != null ? new Prisma.Decimal(jobDef.salaryMax) : null,
          salaryCurrency: 'VND',
          salaryPeriod: 'MONTH',
          salaryIsNegotiable: true,
          salaryIsVisible: true,
          vacanciesCount: [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)],
          status: 'PUBLISHED',
          moderationStatus: 'APPROVED',
          publishedAt: addDays(new Date(), -Math.floor(Math.random() * 30)),
          expiredAt: addDays(new Date(), 10 + Math.floor(Math.random() * 50)),
        },
      });

      // Create location
      const locId = randomUUID();
      await prisma.companyLocation.create({
        data: {
          id: locId,
          companyId: fptSoftware.id,
          city: 'Hà Nội',
          district: 'Cầu Giấy',
          address: 'FPT Cầu Giấy Building, Duy Tân, Cầu Giấy, Hà Nội',
          workingModel: [WorkingModel.HYBRID, WorkingModel.ONSITE, WorkingModel.REMOTE][
            Math.floor(Math.random() * 3)
          ],
        },
      });

      await prisma.jobPostLocation.create({
        data: {
          jobPostId: job.id,
          jobLocationId: locId,
        },
      });

      // Create specialization
      if (spec) {
        await prisma.jobPostSpecialization.create({
          data: {
            jobPostId: job.id,
            specializationId: spec.id,
            isRequired: true,
          },
        });
      }

      // Create skills
      const skillCategory = await prisma.skillCategory.findFirst({ where: { name: 'Others' } });
      for (const skillName of jobDef.skills) {
        const skill = await prisma.skill.upsert({
          where: { name: skillName },
          update: {},
          create: {
            name: skillName,
            categoryId: skillCategory
              ? skillCategory.id
              : (await prisma.skillCategory.findFirst())!.id,
          },
        });

        await prisma.jobPostSkill.create({
          data: {
            jobPostId: job.id,
            skillId: skill.id,
            priority: 'REQUIRED',
          },
        });
      }
    }

    createdJobs.push(job);
  }

  // 6. Load candidates data
  const candidatesJsonPath = path.join(__dirname, 'candidates.json');
  if (!fs.existsSync(candidatesJsonPath)) {
    console.log(`[SEED] Warning: File ${candidatesJsonPath} not found. Skipping CV seeding.`);
    return;
  }

  const candidatesData = JSON.parse(fs.readFileSync(candidatesJsonPath, 'utf-8'));
  console.log(
    `[SEED] Loading ${candidatesData.length} static candidate records from candidates.json.`,
  );

  const cvStorageDirectory = path.posix.join('uploads', 'cv');
  const cvDir = path.join(uploadRoot, 'cv');
  if (!fs.existsSync(cvDir)) {
    fs.mkdirSync(cvDir, { recursive: true });
  }

  const seededCandidates: Array<{ profileId: string; cvVersionId: string; fullName: string }> = [];

  for (const item of candidatesData) {
    try {
      const { fullName, email, originalName, sizeBytes, parsedText } = item;

      // Unique email check
      let emailAddr = email;
      let candidateAccount = await prisma.candidateAccount.findUnique({
        where: { email: emailAddr },
      });

      if (!candidateAccount) {
        candidateAccount = await prisma.candidateAccount.create({
          data: {
            fullName,
            email: emailAddr,
            passwordHash,
            candidateAccountStatus: 'ACTIVE',
            emailVerifiedAt: new Date(),
          },
        });
      }

      let candidateProfile = await prisma.candidateProfile.findUnique({
        where: { candidateAccountId: candidateAccount.id },
      });

      if (!candidateProfile) {
        candidateProfile = await prisma.candidateProfile.create({
          data: {
            candidateAccountId: candidateAccount.id,
            jobSearchStatus: 'OPEN_TO_WORK',
            profileVisibility: 'PUBLIC',
          },
        });
      }

      const cleanFileName = `${emailAddr}.pdf`;
      const targetPath = path.join(cvDir, cleanFileName);

      let actualSize = sizeBytes;
      if (!fs.existsSync(targetPath)) {
        fs.writeFileSync(targetPath, Buffer.alloc(0));
        actualSize = 0;
      }

      let fileAsset = await prisma.fileAsset.findFirst({
        where: {
          ownerId: candidateProfile.id,
          purpose: FilePurpose.CV,
        },
      });

      if (!fileAsset) {
        const storageKey = path.posix.join(cvStorageDirectory, cleanFileName);
        const publicUrl = `${appBackendUrl}/${storageKey}`;
        fileAsset = await prisma.fileAsset.create({
          data: {
            ownerType: 'candidate_cv',
            ownerId: candidateProfile.id,
            purpose: FilePurpose.CV,
            visibility: FileVisibility.PUBLIC,
            storageKey,
            originalName,
            mimeType: 'application/pdf',
            sizeBytes: BigInt(actualSize),
            publicUrl,
          },
        });
      }

      let cvRecord = await prisma.cV.findFirst({
        where: { candidateProfileId: candidateProfile.id },
      });

      if (!cvRecord) {
        cvRecord = await prisma.cV.create({
          data: {
            candidateProfileId: candidateProfile.id,
            title: `CV - ${fullName}`,
            source: CvSource.UPLOAD,
            status: CvStatus.ACTIVE,
            isDefault: true,
          },
        });
      }

      let cvVersion = await prisma.cVVersion.findFirst({
        where: { cvId: cvRecord.id },
      });

      if (!cvVersion) {
        cvVersion = await prisma.cVVersion.create({
          data: {
            cvId: cvRecord.id,
            sourceFileId: fileAsset.id,
            versionNo: 1,
            parsedText: parsedText || null,
          },
        });
      }

      seededCandidates.push({
        profileId: candidateProfile.id,
        cvVersionId: cvVersion.id,
        fullName,
      });
    } catch (err) {
      console.error(`[SEED] Failed to seed candidate: ${item.fullName}`, err);
    }
  }

  let applicationSuccessCount = 0;
  let interviewCreatedCount = 0;

  // 7. Seed applications into each of the 5 jobs
  for (const job of createdJobs) {
    console.log(`[SEED] Seeding applications for job: "${job.title}"...`);
    for (let i = 0; i < seededCandidates.length; i++) {
      const candidate = seededCandidates[i];
      try {
        let application = await prisma.application.findFirst({
          where: {
            jobPostId: job.id,
            candidateProfileId: candidate.profileId,
          },
        });

        if (!application) {
          // Distribute statuses
          let status: ApplicationStatus = ApplicationStatus.SUBMITTED;
          const mod = i % 10;
          if (mod < 5) {
            status = ApplicationStatus.SUBMITTED;
          } else if (mod === 5) {
            status = ApplicationStatus.VIEWED;
          } else if (mod === 6) {
            status = ApplicationStatus.SHORTLISTED;
          } else if (mod === 7) {
            status = ApplicationStatus.INTERVIEWING;
          } else if (mod === 8) {
            status = ApplicationStatus.OFFERED;
          } else {
            status = ApplicationStatus.REJECTED;
          }

          const daysAgo = Math.floor(Math.random() * 14);
          const submittedAt = new Date();
          submittedAt.setDate(submittedAt.getDate() - daysAgo);

          application = await prisma.application.create({
            data: {
              jobPostId: job.id,
              candidateProfileId: candidate.profileId,
              cvVersionId: candidate.cvVersionId,
              status,
              submittedAt,
            },
          });

          // Schedule mock interviews for INTERVIEWING status
          if (status === ApplicationStatus.INTERVIEWING) {
            const interviewStart = new Date();
            const daysForward = 1 + Math.floor(Math.random() * 6);
            interviewStart.setDate(interviewStart.getDate() + daysForward);
            interviewStart.setHours(9 + Math.floor(Math.random() * 6), 0, 0, 0);

            const interviewEnd = new Date(interviewStart.getTime() + 60 * 60 * 1000);

            await prisma.interview.create({
              data: {
                recruiterProfileId,
                applicationId: application.id,
                interviewRound: 1,
                type: InterviewType.ONLINE,
                scheduledStartAt: interviewStart,
                scheduledEndAt: interviewEnd,
                meetingUrl: 'https://meet.google.com/abc-defg-hij',
                status: InterviewStatus.SCHEDULED,
                result: InterviewResult.PENDING,
                recruiterNote: 'Phỏng vấn kỹ thuật trao đổi chi tiết',
              },
            });
            interviewCreatedCount++;
          }

          applicationSuccessCount++;
        }
      } catch (err) {
        console.error(
          `[SEED] Failed to create application for candidate ${candidate.fullName} and job ${job.title}:`,
          err,
        );
      }
    }
  }

  console.log(`[SEED] Successfully seeded ${seededCandidates.length} candidate accounts.`);
  console.log(
    `[SEED] Successfully created ${applicationSuccessCount} applications across ${createdJobs.length} jobs.`,
  );
  console.log(`[SEED] Successfully created ${interviewCreatedCount} mock interviews.`);

  await seedCompanyCovers(prisma);
}

async function seedCompanyCovers(prisma: PrismaClient) {
  const domainCovers: Record<string, string> = {
    momo: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1600&auto=format&fit=crop&q=85',
    zalopay:
      'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1600&auto=format&fit=crop&q=85',
    vnpay:
      'https://images.unsplash.com/photo-1556742049-0a67daf4005a?w=1600&auto=format&fit=crop&q=85',
    vietcombank:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&auto=format&fit=crop&q=85',
    techcombank:
      'https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=1600&auto=format&fit=crop&q=85',
    'mb-bank':
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600&auto=format&fit=crop&q=85',
    vpbank:
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&auto=format&fit=crop&q=85',
    acb: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1600&auto=format&fit=crop&q=85',
    bidv: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=1600&auto=format&fit=crop&q=85',
    agribank:
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1600&auto=format&fit=crop&q=85',
    hdbank:
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&auto=format&fit=crop&q=85',
    sacombank:
      'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1600&auto=format&fit=crop&q=85',
    tpbank:
      'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1600&auto=format&fit=crop&q=85',
    vib: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1600&auto=format&fit=crop&q=85',
    vietinbank:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&auto=format&fit=crop&q=85',
    msb: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1600&auto=format&fit=crop&q=85',
    ocb: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1600&auto=format&fit=crop&q=85',
    'fpt-software':
      'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1600&auto=format&fit=crop&q=85',
    'fpt-corporation':
      'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1600&auto=format&fit=crop&q=85',
    'fpt-is':
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1600&auto=format&fit=crop&q=85',
    'vng-corporation':
      'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&auto=format&fit=crop&q=85',
    rikkeisoft:
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&auto=format&fit=crop&q=85',
    'cmc-global':
      'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1600&auto=format&fit=crop&q=85',
    'cmc-corporation':
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1600&auto=format&fit=crop&q=85',
    'nashtech-vietnam':
      'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=1600&auto=format&fit=crop&q=85',
    'axon-active-vietnam':
      'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1600&auto=format&fit=crop&q=85',
    'dek-technologies-vietnam':
      'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1600&auto=format&fit=crop&q=85',
    'kms-technology-vietnam':
      'https://images.unsplash.com/photo-1515187029135-18ee286d815b?w=1600&auto=format&fit=crop&q=85',
    'luvina-software':
      'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=1600&auto=format&fit=crop&q=85',
    smartosc:
      'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&auto=format&fit=crop&q=85',
    'tma-solutions':
      'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1600&auto=format&fit=crop&q=85',
    'ntq-solution':
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&auto=format&fit=crop&q=85',
    vti: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1600&auto=format&fit=crop&q=85',
    'bosch-global-software-technologies-vietnam':
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1600&auto=format&fit=crop&q=85',
    'viettel-group':
      'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1600&auto=format&fit=crop&q=85',
    'viettel-cyber-security':
      'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1600&auto=format&fit=crop&q=85',
    'viettel-idc':
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1600&auto=format&fit=crop&q=85',
    'fpt-telecom':
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&auto=format&fit=crop&q=85',
    vnpt: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1600&auto=format&fit=crop&q=85',
    'vnpt-technology':
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1600&auto=format&fit=crop&q=85',
    netnam:
      'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1600&auto=format&fit=crop&q=85',
    'shopee-vietnam':
      'https://images.unsplash.com/photo-1556740758-90de374c12ad?w=1600&auto=format&fit=crop&q=85',
    'tiki-group':
      'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1600&auto=format&fit=crop&q=85',
    'sendo-technology':
      'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1600&auto=format&fit=crop&q=85',
    'grab-vietnam':
      'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1600&auto=format&fit=crop&q=85',
    'be-group':
      'https://images.unsplash.com/photo-1508873696983-2df515122519?w=1600&auto=format&fit=crop&q=85',
    haravan:
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1600&auto=format&fit=crop&q=85',
    kiotviet:
      'https://images.unsplash.com/photo-1556742044-3c52d6e88c62?w=1600&auto=format&fit=crop&q=85',
    'base-vn':
      'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=1600&auto=format&fit=crop&q=85',
    misa: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1600&auto=format&fit=crop&q=85',
    sapo: 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?w=1600&auto=format&fit=crop&q=85',
    'topcv-vietnam':
      'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1600&auto=format&fit=crop&q=85',
    'one-mount-group':
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&auto=format&fit=crop&q=85',
    vccorp:
      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1600&auto=format&fit=crop&q=85',
    'elsa-speak-vietnam':
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1600&auto=format&fit=crop&q=85',
    vnvc: 'https://images.unsplash.com/photo-1631815588090-d4bfec5b1cdb?w=1600&auto=format&fit=crop&q=85',
    pharmacity:
      'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=1600&auto=format&fit=crop&q=85',
    'dhg-pharma':
      'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1600&auto=format&fit=crop&q=85',
    imexpharm:
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1600&auto=format&fit=crop&q=85',
    traphaco:
      'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1600&auto=format&fit=crop&q=85',
    'vietnam-airlines':
      'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1600&auto=format&fit=crop&q=85',
    'vietjet-air':
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1600&auto=format&fit=crop&q=85',
    'bamboo-airways':
      'https://images.unsplash.com/photo-1506015391300-4802dc74de2e?w=1600&auto=format&fit=crop&q=85',
    'airports-corporation-of-vietnam':
      'https://images.unsplash.com/photo-1517059224940-d4af9eec41b7?w=1600&auto=format&fit=crop&q=85',
    'vietnam-post':
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1600&auto=format&fit=crop&q=85',
    'viettel-post':
      'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=1600&auto=format&fit=crop&q=85',
    vietravel:
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&auto=format&fit=crop&q=85',
    vinfast:
      'https://images.unsplash.com/photo-1617788138017-80ad40651399?w=1600&auto=format&fit=crop&q=85',
    vingroup:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&auto=format&fit=crop&q=85',
    'vincom-retail':
      'https://images.unsplash.com/photo-1567449303078-57ad995bd301?w=1600&auto=format&fit=crop&q=85',
    evn: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=1600&auto=format&fit=crop&q=85',
    'pv-gas':
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=85',
    'pv-power':
      'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1600&auto=format&fit=crop&q=85',
    petrolimex:
      'https://images.unsplash.com/photo-1545261380-72e50587d609?w=1600&auto=format&fit=crop&q=85',
    'binh-son-refining-and-petrochemical':
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop&q=85',
    'ree-corporation':
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&auto=format&fit=crop&q=85',
    'mobile-world-investment':
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1600&auto=format&fit=crop&q=85',
    'fpt-retail':
      'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=1600&auto=format&fit=crop&q=85',
    pnj: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1600&auto=format&fit=crop&q=85',
    digiworld:
      'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=1600&auto=format&fit=crop&q=85',
    vinamilk:
      'https://images.unsplash.com/photo-1527153857715-3908f2bae5e8?w=1600&auto=format&fit=crop&q=85',
    'masan-group':
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1600&auto=format&fit=crop&q=85',
    'masan-consumer':
      'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=1600&auto=format&fit=crop&q=85',
    sabeco:
      'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=1600&auto=format&fit=crop&q=85',
    'the-pan-group':
      'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600&auto=format&fit=crop&q=85',
    'dabaco-group':
      'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=1600&auto=format&fit=crop&q=85',
    vissan:
      'https://images.unsplash.com/photo-1544025162-d76694265947?w=1600&auto=format&fit=crop&q=85',
    'hoa-phat-group':
      'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=1600&auto=format&fit=crop&q=85',
    'hoa-sen-group':
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&auto=format&fit=crop&q=85',
    'vietnam-rubber-group':
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1600&auto=format&fit=crop&q=85',
    'highlands-coffee':
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1600&auto=format&fit=crop&q=85',
    'phuc-long-heritage':
      'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=1600&auto=format&fit=crop&q=85',
    'trung-nguyen-group':
      'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=1600&auto=format&fit=crop&q=85',
    'golden-gate-group':
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&auto=format&fit=crop&q=85',
    coteccons:
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&auto=format&fit=crop&q=85',
    'hoa-binh-construction-group':
      'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?w=1600&auto=format&fit=crop&q=85',
    'novaland-group':
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600&auto=format&fit=crop&q=85',
    'khang-dien-house':
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&auto=format&fit=crop&q=85',
    'nam-long-group':
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&auto=format&fit=crop&q=85',
    'becamex-idc':
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&auto=format&fit=crop&q=85',
  };

  const defaultFallbackCover =
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&auto=format&fit=crop&q=85';
  const companies = await prisma.company.findMany({
    select: { id: true, slug: true },
  });

  const now = new Date();
  for (const company of companies) {
    const coverUrl = domainCovers[company.slug] || defaultFallbackCover;
    const fileId = createHash('md5').update(`company-cover:${company.slug}`).digest('hex');
    const formattedId = `${fileId.slice(0, 8)}-${fileId.slice(8, 12)}-${fileId.slice(12, 16)}-${fileId.slice(16, 20)}-${fileId.slice(20, 32)}`;

    await prisma.fileAsset.upsert({
      where: { id: formattedId },
      update: {
        ownerType: 'company_cover',
        ownerId: company.id,
        purpose: FilePurpose.OTHER,
        visibility: FileVisibility.PUBLIC,
        storageKey: `upnext/seed/company-covers/${company.slug}`,
        originalName: `${company.slug}-cover.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(0),
        publicUrl: coverUrl,
        updatedAt: now,
      },
      create: {
        id: formattedId,
        ownerType: 'company_cover',
        ownerId: company.id,
        purpose: FilePurpose.OTHER,
        visibility: FileVisibility.PUBLIC,
        storageKey: `upnext/seed/company-covers/${company.slug}`,
        originalName: `${company.slug}-cover.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(0),
        publicUrl: coverUrl,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  console.log(
    `[SEED] Successfully seeded domain-specific cover photos for all ${companies.length} companies.`,
  );
}

// =========================
// Rich post, taxonomy and image seed
// =========================

/** Helper to generate fixed UUIDs for deterministic seed runs */
const postSeedId = (n: number) => `b0e80b22-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Unable to download post image from ${imageUrl}: HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Unable to download post image from ${imageUrl}: empty response`);
  }
  return buffer;
}

async function seedRichPosts(adminId: string, seedReferenceDate: Date) {
  console.log(
    '🚀 === BẮT ĐẦU SEED DỮ LIỆU BÀI VIẾT (POST, CATEGORY, TAG & REAL JPEG THUMBNAILS) ===\n',
  );

  // Ensure uploads/posts directory exists
  const uploadDir = path.join(uploadRoot, 'posts');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`✅ Đã tạo thư mục lưu trữ ảnh bài viết: ${uploadDir}`);
  }

  const admin = { id: adminId };

  // 2. Tạo 3 Danh mục CHA (Parent Categories)
  console.log('\n--- 1. SEED DANH MỤC PHÂN CẤP (PARENT & CHILD CATEGORIES) ---');
  const parent1 = await prisma.postCategory.upsert({
    where: { slug: 'blog-upnext' },
    update: { name: 'Blog UpNext' },
    create: { id: postSeedId(1), name: 'Blog UpNext', slug: 'blog-upnext' },
  });

  const parent2 = await prisma.postCategory.upsert({
    where: { slug: 'su-nghiep-it' },
    update: { name: 'Sự nghiệp IT' },
    create: { id: postSeedId(2), name: 'Sự nghiệp IT', slug: 'su-nghiep-it' },
  });

  const parent3 = await prisma.postCategory.upsert({
    where: { slug: 'chuyen-mon-it' },
    update: { name: 'Chuyên môn IT' },
    create: { id: postSeedId(3), name: 'Chuyên môn IT', slug: 'chuyen-mon-it' },
  });

  console.log('✅ Đã khởi tạo 3 Danh mục Cha: Blog UpNext, Sự nghiệp IT, Chuyên môn IT.');

  // Tạo các Danh mục CON (Child Categories)
  const childCategoriesData = [
    // Con của Sự nghiệp IT
    { id: postSeedId(10), name: 'Developer', slug: 'su-nghiep-developer', parentId: parent2.id },
    {
      id: postSeedId(11),
      name: 'Ứng tuyển & Thăng tiến',
      slug: 'ung-tuyen-thang-tien',
      parentId: parent2.id,
    },
    {
      id: postSeedId(12),
      name: 'Phỏng vấn & Lương thưởng',
      slug: 'phong-van-luong-thuong',
      parentId: parent2.id,
    },
    {
      id: postSeedId(13),
      name: 'Kỹ năng mềm & Định hướng',
      slug: 'ky-nang-mem-dinh-huong',
      parentId: parent2.id,
    },

    // Con của Chuyên môn IT
    { id: postSeedId(20), name: 'AI & Data', slug: 'ai-data-specialty', parentId: parent3.id },
    {
      id: postSeedId(21),
      name: 'Backend & Architecture',
      slug: 'backend-architecture',
      parentId: parent3.id,
    },
    { id: postSeedId(22), name: 'DevOps & Cloud', slug: 'devops-cloud', parentId: parent3.id },
    {
      id: postSeedId(23),
      name: 'Mobile & Frontend',
      slug: 'mobile-frontend',
      parentId: parent3.id,
    },

    // Con của Blog UpNext
    { id: postSeedId(30), name: 'Tin tức UpNext', slug: 'tin-tuc-upnext', parentId: parent1.id },
    { id: postSeedId(31), name: 'Sự kiện IT', slug: 'su-kien-it-upnext', parentId: parent1.id },
    {
      id: postSeedId(32),
      name: 'Báo cáo thị trường IT',
      slug: 'bao-cao-thi-truong-it',
      parentId: parent1.id,
    },
    { id: postSeedId(33), name: 'FAQ & Hướng dẫn', slug: 'faq-huong-dan', parentId: parent1.id },
  ];

  const categoriesMap: Record<string, { id: string; name: string }> = {};
  categoriesMap['blog-upnext'] = { id: parent1.id, name: parent1.name };
  categoriesMap['su-nghiep-it'] = { id: parent2.id, name: parent2.name };
  categoriesMap['chuyen-mon-it'] = { id: parent3.id, name: parent3.name };

  for (const c of childCategoriesData) {
    const created = await prisma.postCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, parentId: c.parentId },
      create: { id: c.id, name: c.name, slug: c.slug, parentId: c.parentId },
    });
    categoriesMap[c.slug] = { id: created.id, name: created.name };
  }
  console.log(`✅ Đã tạo thành công ${childCategoriesData.length} Danh mục Con.`);

  // 3. Tạo các TAGS
  console.log('\n--- 2. SEED TAGS BÀI VIẾT ---');
  const tagsData = [
    { name: 'ReactJS', slug: 'reactjs' },
    { name: 'NestJS', slug: 'nestjs' },
    { name: 'AI & Data', slug: 'ai-data' },
    { name: 'Cloud & AWS', slug: 'cloud-aws' },
    { name: 'Developer', slug: 'developer' },
    { name: 'Big Data', slug: 'big-data' },
    { name: 'Python', slug: 'python' },
    { name: 'Technical Lead', slug: 'technical-lead' },
    { name: 'Phỏng vấn IT', slug: 'phong-van-it' },
    { name: 'Lương IT', slug: 'luong-it' },
    { name: 'DevOps', slug: 'devops' },
    { name: 'Machine Learning', slug: 'machine-learning' },
    { name: 'System Architecture', slug: 'system-architecture' },
    { name: 'Agile & Scrum', slug: 'agile-scrum' },
    { name: 'Career Path', slug: 'career-path' },
    { name: 'Xu hướng công nghệ', slug: 'xu-huong-cong-nghe' },
    { name: 'Backend & Architecture', slug: 'backend-architecture-tag' },
    { name: 'Sự kiện IT', slug: 'su-kien-it-tag' },
    { name: 'Báo cáo thị trường IT', slug: 'bao-cao-thi-truong-it-tag' },
    { name: 'Tin tức UpNext', slug: 'tin-tuc-upnext-tag' },
    { name: 'FAQ & Hướng dẫn', slug: 'faq-huong-dan-tag' },
    { name: 'Tuyển dụng IT', slug: 'tuyen-dung-it-tag' },
  ];

  const tagsMap: Record<string, string> = {};
  for (const t of tagsData) {
    const createdTag = await prisma.tag.upsert({
      where: { slug: t.slug },
      update: { name: t.name },
      create: { name: t.name, slug: t.slug },
    });
    tagsMap[t.name] = createdTag.id;
  }
  console.log(`✅ Đã khởi tạo ${tagsData.length} Thẻ (Tag) bài viết.`);

  // 4. Khởi tạo danh sách BÀI VIẾT với ảnh JPEG chất lượng cao
  console.log('\n--- 3. SEED BÀI VIẾT & DOWNLOADING REAL JPEG THUMBNAIL IMAGES ---');

  const buildArticle = (
    title: string,
    intro: string,
    sections: Array<{ heading: string; body: string }>,
  ) =>
    `
<article class="entry-content is-layout-flow">
  <h1>${title}</h1>
  <p><strong>${intro}</strong></p>
  ${sections.map((section) => `<section><h2>${section.heading}</h2><p>${section.body}</p></section>`).join('\n  ')}
  <h2>Kết luận</h2>
  <p>Hãy biến những gợi ý trên thành một kế hoạch nhỏ, đo lường kết quả và điều chỉnh sau mỗi vòng thực hành.</p>
</article>`.trim();

  const postsData = [
    {
      id: postSeedId(200),
      title: 'AI tự hành trong HR: Chuẩn data, tuyển nhanh, chọn đúng',
      slug: 'ai-tu-hanh-trong-hr-chuan-data-tuyen-nhanh-chon-dung',
      imageUrl:
        'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 6,
      content:
        '<h1 class="page-title">AI tự hành trong HR: Chuẩn data, tuyển nhanh, chọn đúng</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/danh-cho-nha-tuyen-dung-it/"><span>Dành cho Nhà tuyển dụng IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#AI_khong_giup_doanh_nghiep_tuyen_dung_nguoi_neu_quy_trinh_tuyen_dung_chua_dung" >AI không giúp doanh nghiệp tuyển đúng người nếu quy trình tuyển dụng chưa đúng</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#Tu_Job_Description_den_Ideal_Candidate_Profile_Thay_doi_diem_khoi_dau_cua_tuyen_dung" >Từ Job Description đến Ideal Candidate Profile: Thay đổi điểm khởi đầu của tuyển dụng</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-3" href="#Khi_da_co_tieu_chi_dung_AI_co_the_tu_dong_hoa_phan_con_lai_cua_quy_trinh" >Khi đã có tiêu chí đúng, AI có thể tự động hóa phần còn lại của quy trình</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-4" href="#Tong_ket_AI_khong_thay_the_HR_ma_cung_co_vai_tro_cua_HR" >Tổng kết: AI không thay thế HR, mà củng cố vai trò của HR</a></li></ul>\n\n</nav></div>\n\n<p><strong><em>Trong bối cảnh thị trường tuyển dụng công nghệ ngày càng nhiều biến động, việc ứng dụng AI vào tuyển dụng không còn là câu chuyện &#8220;có nên hay không&#8221;, mà là &#8220;ứng dụng như thế nào để tuyển đúng người&#8221;. Đây cũng là thông điệp xuyên suốt được chia sẻ tại sự kiện “AI Tự Hành Trong HR: Chuẩn data, tuyển nhanh, chọn đúng” do UpNext và Diaflow đồng tổ chức.</em></strong></p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</figure>\n\n<p class="has-text-align-center"><em>Sự kiện &#8220;AI Tự Hành Trong HR: Chuẩn Data, Tuyển Nhanh, Chọn Đúng&#8221; do UpNext và Diaflow đồng tổ chức thu hút đông đảo HR, HRM, HRD và TA Lead cùng thảo luận về ứng dụng AI trong tuyển dụng.</em></p>\n\n<h2 class="wp-block-heading" id="h-ai-khong-giup-doanh-nghiệp-tuyển-dung-người-nếu-quy-trinh-tuyển-dụng-chưa-dung"><span class="ez-toc-section" id="AI_khong_giup_doanh_nghiep_tuyen_dung_nguoi_neu_quy_trinh_tuyen_dung_chua_dung"></span><strong>AI không giúp doanh nghiệp tuyển đúng người nếu quy trình tuyển dụng chưa đúng</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Theo chia sẻ của ông Tân Cao, bức tranh tuyển dụng công nghệ đang thay đổi nhanh chóng. Có đến 15,4% doanh nghiệp công nghệ đã cắt giảm hoặc đóng băng tuyển dụng, tăng gần ba lần so với cùng kỳ năm trước (5,9%).</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</figure>\n\n<p class="has-text-align-center"><em>Ông Tân Cao &#8211; Manager of Recruitment Consulting, UpNext</em>,<em> chia sẻ những thay đổi trong chiến lược tuyển dụng khi AI ngày càng phổ biến.</em></p>\n\n<p>Trong khi đó, nhiều doanh nghiệp vẫn liên tục đầu tư vào các công cụ AI với kỳ vọng nâng cao hiệu quả tuyển dụng. Tuy nhiên, thực tế cho thấy AI không tự động giải quyết được bài toán tuyển sai người nếu ngay từ đầu doanh nghiệp chưa xác định đúng tiêu chí tuyển dụng.</p>\n\n<p>Một ví dụ được ông Tân chia sẻ tại sự kiện đã minh họa rõ điều này. Khi yêu cầu hai ứng viên (Junior và Senior) thực hiện cùng một bài kiểm tra sàng lọc hồ sơ bằng AI, nếu chấm trên thang điểm 100 thì ứng viên Junior tăng từ 2 lên 20 điểm, trong khi ứng viên Senior tăng từ 8 lên 80 điểm.</p>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p>Ông nhấn mạnh: <em>“AI không tự nhiên làm cho con người giỏi hơn, mà AI giúp nới rộng khoảng cách năng lực và gia tăng giá trị mà mỗi cá nhân mang lại cho công việc.”</em></p>\n\n</blockquote>\n\n<p>Điều đó cũng lý giải vì sao cách đánh giá ứng viên tại nhiều doanh nghiệp công nghệ đang dần thay đổi. Theo chia sẻ tại sự kiện, các doanh nghiệp như Google hay MoMo không còn đặt mục tiêu kiểm tra ứng viên có sử dụng AI hay không, mà tập trung đánh giá liệu ứng viên có thể sử dụng AI để tạo ra kết quả chính xác và hiệu quả hơn hay không.</p>\n\n<h2 class="wp-block-heading" id="h-từ-job-description-dến-ideal-candidate-profile-thay-dổi-diểm-khởi-dầu-của-tuyển-dụng"><span class="ez-toc-section" id="Tu_Job_Description_den_Ideal_Candidate_Profile_Thay_doi_diem_khoi_dau_cua_tuyen_dung"></span><strong>Từ Job Description đến Ideal Candidate Profile: Thay đổi điểm khởi đầu của tuyển dụng</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Một trong những nội dung được quan tâm nhất tại sự kiện là sự dịch chuyển từ Job Description (JD) sang Ideal Candidate Profile (ICP).</p>\n\n<p>Theo ông Tân Cao, JD phản ánh nhu cầu tuyển dụng từ góc nhìn của doanh nghiệp, nhưng chưa trả lời được ba câu hỏi quan trọng:</p>\n\n<ul class="wp-block-list">\n<li>Doanh nghiệp thực sự cần giải quyết bài toán kinh doanh nào?</li>\n\n<li>Chân dung ứng viên đó có tồn tại trên thị trường hay không?</li>\n\n<li>Ngân sách của doanh nghiệp có phù hợp với mặt bằng thị trường hay không?</li>\n</ul>\n\n<p>Ngay cả khi doanh nghiệp sẵn sàng tăng ngân sách để tuyển nhân sự AI, nếu quy trình tuyển dụng vẫn giữ nguyên cách tiếp cận cũ thì nguy cơ tuyển sai người vẫn không thay đổi. Thay vào đó, UpNext đề xuất xây dựng Ideal Candidate Profile (ICP) dựa trên sự giao thoa của ba yếu tố:</p>\n\n<ul class="wp-block-list">\n<li>Nhu cầu thực tế của doanh nghiệp.</li>\n\n<li>Nguồn cung nhân tài trên thị trường.</li>\n\n<li>Mức lương và ngân sách tuyển dụng khả thi.</li>\n</ul>\n\n<p>Từ nền tảng ICP, ông Tân Cao đề xuất bốn tiêu chí giúp HR đánh giá ứng viên toàn diện hơn trong bối cảnh AI đang thay đổi cách làm việc.</p>\n\n<ol class="wp-block-list">\n<li><strong>AI Capability</strong>: Ứng viên không chỉ biết sử dụng AI, mà phải có khả năng ứng dụng AI để xây dựng kế hoạch hoặc triển khai các công việc thực tế.</li>\n\n<li><strong>Business Impact</strong>: Giá trị của AI được đo bằng khả năng giải quyết các nút thắt của doanh nghiệp thay vì chỉ tạo ra các kết quả mang tính trình diễn.</li>\n\n<li><strong>Learning Velocity</strong>: Tốc độ học hỏi và thích nghi trở thành lợi thế quan trọng khi công nghệ AI liên tục thay đổi.</li>\n\n<li><strong>Market Fit</strong>: Năng lực của ứng viên khi kết hợp với AI cần tạo ra giá trị cạnh tranh cho doanh nghiệp và phù hợp với nhu cầu của thị trường.</li>\n</ol>\n\n<h2 class="wp-block-heading" id="h-khi-da-co-tieu-chi-dung-ai-co-thể-tự-dộng-hoa-phần-con-lại-của-quy-trinh"><span class="ez-toc-section" id="Khi_da_co_tieu_chi_dung_AI_co_the_tu_dong_hoa_phan_con_lai_cua_quy_trinh"></span><strong>Khi đã có tiêu chí đúng, AI có thể tự động hóa phần còn lại của quy trình</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Nếu phần chia sẻ của UpNext tập trung vào chiến lược tuyển dụng, thì nhiệm vụ của Diaflow là hướng dẫn người tham dự cách hiện thực hóa chiến lược đó bằng AI. Thay vì bắt đầu từ việc đọc hàng chục hoặc hàng trăm CV, quy trình được giới thiệu tại sự kiện bắt đầu từ việc chuẩn hóa tiêu chí tuyển dụng.</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</figure>\n\n<p class="has-text-align-center"><em>Ông Võ Hoàng Nam &#8211; Country Manager, Diaflow, trình diễn cách tự động hóa quy trình tuyển dụng bằng AI workflow.</em></p>\n\n<p>Đầu tiên, AI hỗ trợ HR khai thác đầy đủ yêu cầu từ Hiring Manager thông qua ghi âm, chuyển đổi nội dung thành văn bản và tổng hợp thành bộ tiêu chí đánh giá thống nhất.</p>\n\n<p>Tiếp theo, khi HR tải JD hoặc ICP cùng tập CV lên hệ thống, AI sẽ tự động đối chiếu hồ sơ với các tiêu chí đã thiết lập, chấm điểm, phân loại ứng viên đạt hoặc không đạt, đồng thời tạo bản tóm tắt về điểm mạnh, điểm cần lưu ý của từng ứng viên để HR có thêm cơ sở đánh giá.</p>\n\n<p>Sau khi hoàn tất bước sàng lọc, AI tiếp tục tự động thực hiện các tác vụ lặp lại như lưu trữ hồ sơ, phân loại CV và gửi email mời phỏng vấn hoặc thông báo kết quả theo mẫu mà doanh nghiệp thiết lập.</p>\n\n<p>Theo ông Võ Hoàng Nam, toàn bộ quy trình được xây dựng theo hướng doanh nghiệp có thể chuẩn hóa và tái sử dụng, đồng thời đáp ứng các yêu cầu về bảo mật dữ liệu với các tiêu chuẩn như SOC2 và GDPR. Dữ liệu của doanh nghiệp cũng không được sử dụng để huấn luyện các mô hình AI công cộng.</p>\n\n<h2 class="wp-block-heading" id="h-tổng-kết-ai-khong-thay-thế-hr-ma-củng-cố-vai-tro-của-hr"><span class="ez-toc-section" id="Tong_ket_AI_khong_thay_the_HR_ma_cung_co_vai_tro_cua_HR"></span><strong>Tổng kết: AI không thay thế HR, mà củng cố vai trò của HR</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Một thông điệp được nhắc lại xuyên suốt sự kiện là AI không thay thế người làm tuyển dụng: <em>“AI hoàn toàn không thể nào thay thế con người được.”</em></p>\n\n<p>AI có thể giúp HR tự động hóa nhiều tác vụ như tổng hợp yêu cầu tuyển dụng, sàng lọc hồ sơ hay gửi email đến ứng viên. Tuy nhiên, việc xác định doanh nghiệp cần tìm ai, đánh giá mức độ phù hợp của ứng viên và đưa ra quyết định tuyển dụng cuối cùng vẫn là vai trò của con người. Trong kỷ nguyên AI, lợi thế cạnh tranh của HR không còn nằm ở việc xử lý nhiều công việc thủ công hơn, mà ở khả năng xây dựng đúng tiêu chí tuyển dụng, thiết kế quy trình hiệu quả và đưa ra những quyết định tuyển dụng chính xác hơn.</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'tin-tuc-upnext',
      metaTitle: 'AI tự hành trong HR: Chuẩn data, tuyển nhanh, chọn đúng',
      metaDescription:
        'Đầu tư AI nhưng vẫn tuyển sai người? Khám phá chiến lược tuyển dụng mới cùng UpNext và Diaflow, từ ICP đến AI workflow tự động hóa quy trình.',
      viewCount: 26410,
      tags: ['Tin tức UpNext', 'Xu hướng công nghệ', 'Developer'],
    },
    {
      id: postSeedId(201),
      title: 'F88 &#8211; Hành trình “Không Ngừng Chuyển Hóa” để tạo sự khác biệt',
      slug: 'phong-van-cio-hanh-trinh-chuyen-doi-so-f88',
      imageUrl:
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 278,
      content:
        '<h1 class="page-title">F88 &#8211; Hành trình “Không Ngừng Chuyển Hóa” để tạo sự khác biệt</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/lanh-dao-it/"><span>Lãnh đạo IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Start-up_va_kho_khan_tu_su_%E2%80%9CBat_Dau%E2%80%9D" >Start-up và khó khăn từ sự “Bắt Đầu”</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#Hanh_trinh_%E2%80%9CKhong_Ngung_Chuyen_Hoa%E2%80%9D_de_tao_ra_su_khac_biet" >Hành trình “Không Ngừng Chuyển Hóa” để tạo ra sự khác biệt</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-3" href="#Khat_khao_%E2%80%9Clam_chu%E2%80%9D_voi_tinh_than_%E2%80%9CDam_nghi_Dam_lam%E2%80%9D" >Khát khao “làm chủ” với tinh thần “Dám nghĩ, Dám làm”</a></li></ul>\n\n</nav></div>\n\n<p><span >Trong những năm trở lại đây, Việt Nam đã trở thành một trong những quốc gia năng động nhất trên thế giới trong việc phát triển kinh tế số và tài chính số, đặc biệt là trong giai đoạn hậu Covid-19. Theo dự báo của Quỹ Tiền tệ Quốc tế (IMF), đến năm 2025, nền kinh tế Việt Nam sẽ vươn lên vị trí thứ ba trong khu vực Đông Nam Á về quy mô kinh tế và thị trường Fintech của Việt Nam sở hữu nhiều yếu tố để có thể trở thành một trong những thị trường hấp dẫn nhất khu vực.</span></p>\n\n<p><span >Trong bối cảnh ấy, ngành Dịch vụ Tài chính – Ngân hàng đối mặt với yêu cầu thúc đẩy dịch vụ số để đáp ứng sự phát triển tất yếu của thời đại. Điều này mang tới vô vàn cơ hội nhưng cũng không ít thách thức, bởi chuyển đổi số không phải đơn thuần là câu chuyện về công nghệ mà đó là bài toán tổng thể cần tìm ra được chiến lược riêng phù hợp với bối cảnh &amp; đặc thù doanh nghiệp để vươn lên trên hành trình đầy thách thức ấy.</span></p>\n\n<p><span >Là một start-up trong lĩnh vực tài chính cá nhân, chỉ trong hơn 10 năm hình thành và phát triển, F88 đã vươn mình từ một đội ngũ với hơn chục nhân sự trở thành một hệ thống với đội ngũ hơn 4,000 nhân tài, hơn 800 Phòng Giao dịch và phục vụ hơn 10 triệu khách hàng trên khắp mọi miền Tổ quốc. </span></p>\n\n<p><span >Để đáp ứng tốc độ tăng trưởng mạnh mẽ ấy, hạ tầng &amp; nhân tài công nghệ tại F88 được đầu tư ra sao? Và chiến lược nào được F88 lựa chọn để bắt kịp làn sóng chuyển đổi số vô cùng tốc độ của ngành Tài chính – Ngân hàng tại Việt Nam?</span></p>\n\n<p><span >Cùng gặp gỡ <strong>Giám đốc Công nghệ Thông tin (CIO) của F88 – anh Đinh Gia Hiếu</strong> để tìm hiểu hành trình hơn 1 thập kỷ vươn mình trên hành trình chuyển đổi số của F88 và những điều doanh nghiệp này mang tới cho đội ngũ nhân tài Công nghệ của mình.</span></p>\n\n<h2><span class="ez-toc-section" id="Start-up_va_kho_khan_tu_su_%E2%80%9CBat_Dau%E2%80%9D"></span><b>Start-up và khó khăn từ sự “Bắt Đầu”</b><span class="ez-toc-section-end"></span></h2>\n\n<p><b><i>Với kinh nghiệm dày dặn về chuyển đổi số trong các tổ chức tài chính – ngân hàng, theo anh, yếu tố cốt lõi nào sẽ mang tới thành công cho hoạt động phát triển hệ thống Công nghệ và số hóa tại một doanh nghiệp tài chính cá nhân như F88?</i></b></p>\n\n<p><span >Với gần 20 năm làm việc tại nhiều tổ chức tài chính – ngân hàng trong và ngoài nước, cá nhân tôi cho rằng chuyển đổi số không chỉ là công nghệ, mà là sự kết hợp của chiến lược, quy trình, văn hóa doanh nghiệp, quản trị nhân tài,…trong một tổ chức. Bởi vậy, để có thể chuyển đổi số thành công, chúng ta cần đảm bảo 03 yếu tố:</span></p>\n\n<ol>\n<li  aria-level="1"><strong>Chiến lược phù hợp:</strong><span > Mỗi tổ chức có một bối cảnh, nền tảng, nguồn lực &amp; nhu cầu khác nhau mà chúng ta cần phân tích, thấu hiểu để đưa ra mục tiêu, định hướng phù hợp. Không phải cứ áp dụng công nghệ mới nhất, công cụ hiện đại nhất hay đi với tốc độ nhanh nhất mới là tốt. Điều quan trọng là tìm ra giải pháp phù hợp nhất với thực trạng doanh nghiệp, đáp ứng toàn bộ về mặt vận hành, ngân sách, nguồn lực… và hướng tới mục tiêu đặt ra.</span></li>\n<li  aria-level="1"><strong>Sự đồng thuận:</strong><span > Chuyển đổi số chỉ có thể thành công khi mọi cá nhân trong tổ chức hiểu được tầm quan trọng của nó và chuyển đổi tư duy, năng lực, cách thức vận hành theo nó. Đó là một sự chuyển đổi mang tính hệ thống với sự đồng thuận từ cấp lãnh đạo tới cán bộ nhân viên. Định hướng, chiến lược &amp; công cụ có thể đi từ khối Công nghệ, nhưng cần được lan tỏa, chia sẻ &amp; đồng hành từ tất cả các phòng ban. </span></li>\n<li  aria-level="1"><strong>Sự quyết tâm:</strong> Quá trình chuyển đổi, dù là chuyển đổi về vấn đề gì đều sẽ gặp vô số những khó khăn, trở ngại. Sự quyết tâm của toàn bộ đội ngũ nhằm đảm bảo tiến độ, phát triển giải pháp và hướng tới mục tiêu là điều tiên quyết để mọi dự án đạt được kết quả cuối cùng.</li>\n</ol>\n\n<p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</p>\n\n<p><b><i>Nhiều chuyên gia cho rằng các tổ chức ngân hàng thường gặp khó khăn về tốc độ và sự linh hoạt, vậy với doanh nghiệp tài chính cá nhân như F88 có sự khác biệt gì hay không?</i></b><i><span > </span></i></p>\n\n<p><span >Nếu so sánh với Ngân hàng, chuyển đổi số tại các doanh nghiệp, đặc biệt với F88 sẽ có khác biệt lớn về cả cơ hội và thách thức.</span></p>\n\n<p><span >F88 sẽ không gặp những khó khăn về tính linh hoạt. Phát triển từ một start-up, từ ban lãnh đạo tới đội ngũ nhân sự của F88 đều mang một tinh thần “fail fast – learn fast”, “dám nghĩ &#8211; dám làm”. Mọi người rất sẵn sàng trong việc liên tục thay đổi, học hỏi, trải nghiệm, rút kinh nghiệm. Điều đó cho phép tất cả đội ngũ được tạo điều kiện để thử nghiệm những công nghệ mới, giải pháp mới và tiến về phía trước một cách nhanh hơn.</span></p>\n\n<p><span >Bên cạnh đó, việc đơn giản hóa thủ tục, quy trình cho phép đội ngũ công nghệ của F88 thử nghiệm trong một phạm vi nhỏ, một tệp khách hàng riêng biệt. Việc hoàn thiện, nâng cấp các sản phẩm công nghệ từ đó được thuận tiện, liên tục và đảm bảo tính ưu việt cho người dùng cuối.</span></p>\n\n<p><span >Những thuận lợi nói trên cũng đã giúp việc chuyển đổi số của các doanh nghiệp như F88 được triển khai nhanh chóng, linh hoạt, thử nghiệm nhiều hạng mục, nhiều công nghệ. Tuy nhiên, bên cạnh những điểm sáng, F88 cũng sẽ gặp những khó khăn như bao doanh nghiệp khác về hạn chế ngân sách, nguồn lực và việc tìm ra một chiến lược phù hợp như đã nói ở trên cũng là một thách thức.</span></p>\n\n<p><b><i>Hành trình chuyển đổi số của F88 đã bắt đầu như thế nào và ở thời điểm đó, những thách thức mà anh và đội ngũ phải đối diện là gì?</i></b></p>\n\n<p><span >Năm 2024, F88 lựa chọn chủ đề năm là “Không Ngừng Chuyển Hóa” &#8211; Đó không chỉ là một câu khẩu hiệu mà là hành trình thực tế của F88 trong suốt hơn 10 năm qua. Qua từng giai đoạn phát triển, F88 liên tục có những sự chuyển đổi để phù hợp với nhu cầu kinh doanh và tăng trưởng trên toàn hệ thống. </span></p>\n\n<p><span >Nếu nói về thời điểm bắt đầu chuyển hóa, có lẽ dấu mốc chuyển đổi số mạnh mẽ nhất chính là vào năm 2021,</span><span > khi F88 đặt mục tiêu cán mốc 500 Phòng Giao dịch và hơn 3,000 điểm bán trên cả nước – tỉ lệ thuận với sự tăng cao về số lượng nhân sự, số lượng khách hàng và khối lượng công việc vận hành. Chính điều đó tạo nên một khát khao về việc số hóa nhằm tối ưu hiệu suất, hướng tới phục vụ khách hàng và hiện thực hóa mục tiêu đặt ra.</span></p>\n\n<p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</p>\n\n<p><span >Ở thời điểm đó, hệ thống công nghệ của F88 tương đối mang tính legacy (lâu đời) và monolithic, dẫn tới vấn đề khá lớn về đảm bảo hiệu năng và không đáp ứng được nhu cầu mở rộng quy mô của tổ chức. Đội ngũ Công nghệ không thể tập trung phát triển các sáng kiến mới mà chủ yếu mất thời gian để sửa lỗi và bảo trì hệ thống. Và lúc này, chúng tôi cần phải giải quyết ngay hai bài toán khó chính là: </span></p>\n\n<ul>\n<li  aria-level="1"><span ><strong>Thời gian:</strong> F88 phải thay đổi ngay, thay đổi nhanh và thay đổi một cách toàn diện hệ thống để đảm bảo không bỏ lỡ cơ hội bứt phá </span></li>\n<li  aria-level="1"><span ><strong>Nguồn lực con người:</strong> Về bên ngoài, mức độ cạnh tranh nhân tài trên thị trường vô cùng lớn và F88 chưa phải một thương hiệu mạnh để thu hút nhân tài công nghệ một cách dễ dàng. Ở bên trong, nguồn lực đội ngũ còn mỏng và đã quá quen với hệ thống cũ.</span></li>\n</ul>\n\n<p><b><i>Và trong hoàn cảnh đó, F88 đã làm gì để vượt qua thách thức?</i></b></p>\n\n<p><span >Đứng trước áp lực tăng trưởng &amp; kỳ vọng của nhà đầu tư, đội ngũ Công nghệ Thông tin chúng tôi đã đưa ra một quyết định vô cùng khó khăn, đó là lựa chọn tập trung vào cấu trúc lại hệ thống phần mềm cốt lõi thay vì theo đuổi mục tiêu phát triển ngắn hạn là mở rộng quy mô hạ tầng, bổ sung những ứng dụng mới,&#8230;</span></p>\n\n<p><span >Hướng tới phát triển bền vững, một chiến lược và kế hoạch tổng thể được đưa ra với mục tiêu triển khai một platform mới, theo một kiến trúc mới giải quyết các nhu cầu và vấn đề trọng yếu của doanh nghiệp với sự đồng thuận cao của Ban lãnh đạo. Toàn bộ nguồn lực được tập trung để triển khai các vấn đề trọng yếu.</span></p>\n\n<p><b>Và điều tự hào nhất của chúng tôi chính là sự quyết tâm và khát khao của đội ngũ Công nghệ thời điểm đó.</b><span > Các bạn đã tự đề xuất, tự làm chủ công nghệ mới &#8211; từ các workflow đến business rules với rất nhiều cấu phần. Chỉ với một team 35 nhân sự, trong vòng 9 tháng các bạn đã go-live toàn bộ hệ thống với nhiều công nghệ mới của AWS (Amazon Web Services) được ứng dụng – một hệ thống mà nếu tìm mua bên ngoài có thể có giá trị lên tới hàng triệu USD.</span></p>\n\n<h2><span class="ez-toc-section" id="Hanh_trinh_%E2%80%9CKhong_Ngung_Chuyen_Hoa%E2%80%9D_de_tao_ra_su_khac_biet"></span><b>Hành trình “Không Ngừng Chuyển Hóa” để tạo ra sự khác biệt</b><span class="ez-toc-section-end"></span></h2>\n\n<p><strong><i>Trong quá trình thực hiện chuyển đổi số, F88 đã có những hành động, chiến lược riêng biệt như thế nào để tận dụng lợi thế, vượt qua khó khăn?</i></strong></p>\n\n<p><span >Là một start-up, F88 khó có thể so sánh về nguồn lực tài chính và con người với các ngân hàng hay tổ chức tài chính lớn. Tuy nhiên, chúng tôi đã “giải bài toán” theo cách của riêng mình, với một chiến lược phù hợp và tinh thần “thay đổi liên tục, chuyển hóa liên tục”.</span></p>\n\n<p><span >F88 không gặp vấn đề ràng buộc quá lớn về quy trình, quy định, đặc biệt về hoạt động mua sắm. Chính vì vậy, việc quyết định sử dụng công nghệ, giải pháp nào để thử nghiệm một cách nhanh chóng, hiệu quả nhất được hoàn toàn chủ động bởi đội ngũ Công nghệ Thông tin. Ví dụ, 100% các hạ tầng của của F88 được chạy trên nền tảng AWS (Amazon Web Services) và sử dụng các nền tảng SaaS (Software as a service) và PaaS (Platform as a service). Đó là những nền tảng “pay as you go”, cho phép đội ngũ thử nghiệm với phạm vi nhỏ và chi phí hợp lý. Khi thấy giải pháp chạy thử phù hợp, chúng tôi mới triển khai ở phạm vi lớn và tổng thể hơn nhằm đảm bảo tối ưu về cả hiệu quả và ngân sách.</span></p>\n\n<p><span >Về nguồn lực con người, F88 luôn nỗ lực tạo nên một môi trường giúp đội ngũ nhân sự phát triển một cách tốt nhất. Trong nội bộ, các bạn với chức danh quản lý sẽ có KPI về đào tạo công nghệ mới cho các thành viên của mình nhằm thúc đẩy văn hóa sẻ chia, học hỏi. Về bên ngoài, F88 cũng kết hợp với các đơn vị/ tổ chức công nghệ uy tín như AWS tổ chức các chuỗi đào tạo cho nhân sự trong ngành. Ngoài ra, khi CBNV tham gia các khóa học và đạt những chứng chỉ chuyên môn, F88 cũng có chính sách tài trợ chi phí đào tạo cho các bạn. </span></p>\n\n<p><span >Ngoài những nhân sự thuộc Khối Công nghệ Thông tin, các hoạt động đào tạo về tư duy chuyển đổi số, ứng dụng AI/ số hóa trong công việc hàng ngày,&#8230; cũng được triển khai tới toàn thể CBNV trong nội bộ.</span></p>\n\n<p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</p>\n\n<p><b><i>Trên quá trình phát triển về công nghệ, F88 có làm việc, phối hợp với đơn vị tư vấn hoặc đối tác bên ngoài nào hay không?</i></b></p>\n\n<p><span >Từ năm 2016 tới nay, F88 luôn nhận được sự tư vấn và hỗ trợ chuyên môn từ Quỹ đầu tư Mekong Capital, không chỉ về Công nghệ Thông tin mà về mọi mặt trong hoạt động kinh doanh. Góc nhìn chuyên sâu và toàn diện từ các chuyên gia của Mekong Capital đã giúp F88 rất nhiều trong việc xây dựng và thực thi chiến lược chuyển đổi trên thực tế.</span></p>\n\n<p><span >Ngoài ra, F88 cũng nhận được sự đồng hành của nhiều đối tác uy tín, đặc biệt là Amazon – một trong 03 nhà cung cấp dịch vụ đám mây (cloud) hàng đầu trên thế giới. Amazon đã cam kết cung cấp dịch vụ &amp; chuyên gia hàng đầu để đồng hành cùng F88 trong quá trình tư vấn, triển khai, cùng thử nghiệm những công nghệ mới. </span></p>\n\n<p><span >Ví dụ, sau khi Amazon đầu tư vào Anthropic và phát triển Claude.ai, đơn vị này cũng đang thử nghiệm với F88 để ứng dụng AI vào các bài toán về trải nghiệm khách hàng và tự động hóa; điển hình là việc xây dựng Internal Knowledge Base (cơ sở tri thức nội bộ) để F88 giải quyết các vấn đề giải đáp thắc mắc, phản hồi, hỗ trợ khách hàng cũng như tối ưu các quy trình nội bộ doanh nghiệp.</span></p>\n\n<p><span >Những “người bạn” ấy đã hỗ trợ cho F88 rất nhiều trong quá trình phát triển năng lực, tư duy số và thực thi thành công những giải pháp công nghệ cho tới ngày hôm nay. </span></p>\n\n<p><b><i>Hiện tại F88 có hơn 10 triệu khách hàng trên cả nước với nhiều dịch vụ tài chính khác nhau, làm thế nào để các sản phẩm công nghệ của F88 đáp ứng được nhu cầu và trải nghiệm của khách hàng?</i></b></p>\n\n<p><span >F88 hiện cung cấp dịch vụ cho vay cầm cố, bảo hiểm, thanh toán hóa đơn và nhiều tiện ích tài chính khác cho khách hàng chủ yếu là bà con, người dân lao động. Chính vì thế, chúng tôi luôn tâm niệm phải mang tới những trải nghiệm đơn giản nhất, dễ dàng nhất cho khách hàng. Mọi công nghệ hiện đại sẽ là nền tảng ở phía sau, được ứng dụng, phát triển với đích đến cuối cùng là sự thuận tiện cho khách hàng – đảm bảo họ không cần có kinh nghiệm, trải nghiệm về công nghệ hay số hóa cũng có thể sử dụng.</span></p>\n\n<p><span >Sự khác biệt tại F88 nằm ở việc mỗi thành viên trong đội ngũ đều thấm nhuần giá trị cốt lõi “Khách hàng là trọng tâm”, luôn nỗ lực để thấu hiểu nhu cầu, hành vi, tâm lý khách hàng. Khi phát triển, nâng cấp bất kỳ sản phẩm công nghệ nào, các bạn Developer, Project Owner,&#8230; không chỉ phối hợp sát sao với bộ phận Trải nghiệm Khách hàng mà có những ngày tới Phòng Giao dịch để làm việc, từ đó nắm bắt quy trình nghiệp vụ, sản phẩm và tiếp cận, tìm hiểu khách hàng một cách trực tiếp. Chính nhờ đó, các bạn có thể tự đưa ra sáng kiến, lộ trình cho sản phẩm mà mình quản trị để đáp ứng tốt nhất nhu cầu của đa dạng khách hàng.</span></p>\n\n<h2><span class="ez-toc-section" id="Khat_khao_%E2%80%9Clam_chu%E2%80%9D_voi_tinh_than_%E2%80%9CDam_nghi_Dam_lam%E2%80%9D"></span><b>Khát khao “làm chủ” với tinh thần “Dám nghĩ, Dám làm”</b><span class="ez-toc-section-end"></span></h2>\n\n<p><b><i>Trong chặng đường tiếp theo với những tham vọng và mục tiêu mới, F88 sẽ làm gì để tận dụng lợi thế của mình và đạt được những thành tựu mới trên hành trình chuyển đổi số?</i></b></p>\n\n<p><span >Đội ngũ F88 hiện tại đang nỗ lực hiện thực hóa tầm nhìn năm 2025 “trở thành trở thành tập đoàn cung cấp dịch vụ tài chính cá nhân lớn nhất Việt Nam được mọi người yêu quý và ngưỡng mộ” với mục tiêu đạt 1500 Phòng Giao dịch, hướng tới IPO trong thời gian gần.</span></p>\n\n<p><span >Để làm được điều đó, chúng tôi hiểu rằng, tăng trưởng bền vững chỉ đến khi đội ngũ của mình làm chủ được công nghệ, chủ động làm ra những sản phẩm “vừa vặn” với doanh nghiệp và khách hàng. Chính vì thế, chúng tôi đặt mục tiêu tái cấu trúc, chuyển đổi từ mô hình vận hành truyền thống sang “Agile”.</span></p>\n\n<p><span >Với Khối Công nghệ Thông tin hiện tại, đội ngũ không làm việc theo các phòng ban truyền thống mà được chia thành các Squad Team. Mỗi Squad Team sẽ phụ trách nghiên cứu, phát triển một sản phẩm nhất định và deliver đến kết quả cuối cùng. Mô hình đó xóa nhòa đi những quy trình phức tạp mà hệ thống phân tầng (hierarchy) mang đến, đồng thời tạo cơ hội cho mỗi thành viên được thể hiện năng lực, thúc đẩy sự phát triển và linh hoạt trong giải quyết vấn đề. Mọi nhân sự cũng được trải nghiệm nhiều hơn ở các dự án khác nhau, thay đổi theo giai đoạn và nhu cầu thực tế.</span></p>\n\n<p><span >Không dừng lại ở đó, trong thời gian tới, mô hình Agile cũng được mở rộng ra toàn bộ tổ chức với sự tham gia sâu của các đơn vị nghiệp vụ. Các khối phòng ban, bao gồm cả Kinh doanh, Quản trị Nguồn nhân lực, Tài chính,&#8230; cũng sẽ ứng dụng mô hình này để triển khai những dự án tối ưu năng suất của riêng mình, tạo ra những sự chuyển đổi mang tính đột phá &amp; đồng bộ cho F88.</span></p>\n\n<p><b><i>Trên chặng đường đầy tham vọng ấy, F88 đã và sẽ làm gì để đội ngũ của mình phát huy &amp; phát triển năng lực một cách tốt nhất?</i></b></p>\n\n<p><span >Đội ngũ sáng lập (Founder) của F88 luôn tự hào rằng “F88 vận hành theo mô hình kim tự tháp ngược” với tư duy “lãnh đạo phục vụ” – nghĩa là lãnh đạo cấp càng cao thì càng có trách nhiệm hỗ trợ, tạo điều kiện tốt nhất cho cấp dưới hoàn thành nhiệm vụ. Có một câu quotes mà bản thân tôi rất tâm đắc, đó là “As leaders in technology, our legacy isn&#8217;t in lines of code, but in the impact we make on the lives and careers of our team”. Tôi luôn tâm niệm mình là một người leader (người lãnh đạo), người định hướng, hỗ trợ đội ngũ và tạo được tác động tích cực cho cuộc sống và sự nghiệp của anh em.</span></p>\n\n<p><span >Tôi hiểu rằng các bạn sẽ chỉ có thể phát triển, khi các bạn có cơ hội để được thể hiện, học hỏi và trải nghiệm. Vì thế, tôi xây dựng ra một cơ chế trao quyền, để mỗi Squad Team của mình được tự nghiên cứu, đề xuất và triển khai các phương án kỹ thuật, giải pháp công nghệ của riêng mình. Tôi sẽ đóng vai trò là người quản lý, kiểm soát, dẫn dắt các bạn đến mục tiêu dựa trên KPI để các bạn tạo ra thành quả “on-time, on-target”. Điều đó giúp mỗi thành viên trong đội ngũ có không gian để sáng tạo, thử nghiệm và thực thi những giải pháp mới thay vì đóng khung trong yêu cầu của Ban Lãnh đạo.</span></p>\n\n<p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</p>\n\n<p><span >Tuy nhiên, để làm được điều đó, chúng tôi cũng phải đảm bảo việc đào tạo, phát triển năng lực cho đội ngũ của mình. Việc này là cả một quá trình với vô vàn những hành động từ việc tuyển dụng đúng người, thúc đẩy đào tạo phát triển, nâng cao trải nghiệm nhân sự, ghi nhận và tưởng thưởng xứng đáng,&#8230; mà F88 đã thực hiện trong suốt thời gian qua. </span></p>\n\n<p><span >Minh chứng cho điều đó là tháng 5 vừa qua, F88 đã tự hào được vinh danh trong danh sách 25 &#8220;Nơi làm việc xuất sắc hàng đầu Việt Nam&#8221; năm 2024 do Great Place To Work xếp hạng bên cạnh nhiều thương hiệu lớn như Coca-Cola, Hilton, Schneider Electric, DHL,&#8230;</span></p>\n\n<p><b><i>“Cơn bão” chuyển đổi số phía trước còn nhiều chông gai và thách thức, theo anh, điều gì sẽ là &#8220;vũ khí&#8221; để đội ngũ Công nghệ Thông tin của F88 để tạo nên sự khác biệt, tự tin vươn mình bứt phá?</i></b></p>\n\n<p><b>Điều đặc biệt, cũng là “vũ khí” của riêng F88 chính là con người</b><span > – là sự nhiệt huyết, đồng lòng và tinh thần “dám nghĩ, dám làm” của mỗi thành viên trong đội ngũ.</span></p>\n\n<p><span >Tại F88, chúng tôi xây dựng một văn hóa đặc trưng với định vị “Nơi bạn làm chủ”. Ở đó, mỗi cá nhân được tự chủ ý kiến, chủ động đề xuất, triển khai; được trao cơ hội để thực hiện ước mơ của mình. Có lẽ không ở đâu như F88 mà ngày hôm nay, trong một buổi ăn trưa, bạn nói rằng mình thấy công nghệ này đã phát triển ổn định và có tiềm năng giải quyết tốt một vấn đề của doanh nghiệp; ngày mai, sẽ có 1 nhóm dự án nghiên cứu để thử nghiệm, ứng dụng công nghệ đó trong thực tế. Với tinh thần start-up, chúng tôi không giới hạn những ý tưởng, suy nghĩ mà cho phép mọi cá nhân thể hiện năng lực và tạo ra giá trị của riêng mình.</span></p>\n\n<p><span >Bên cạnh đó, để tăng cường sức mạnh tập thể, chúng tôi có văn hóa “đồng thuận”. Tại F88, bất kỳ quyết định, vấn đề nào được đưa ra đều dựa trên sự đồng thuận của các cá nhân liên quan; và khi “đồng thuận”, nghĩa là bạn cam kết chung tay thực hiện nó với nguồn lực của mình. Hai chữ “đồng thuận” ấy đã tạo nên sự gắn kết, đồng lòng và hỗ trợ chặt chẽ giữa các cá nhân, đội nhóm, phòng ban – từ cấp lãnh đạo tới nhân viên để hướng tới mục tiêu chung.</span></p>\n\n<p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</p>\n\n<p><span >F88 sẽ là nơi dành cho những cá nhân “dám nghĩ, dám làm”, có đam mê và mong muốn tạo ra giá trị, giải pháp, sản phẩm mang dấu ấn của mình. Và khi bạn làm được điều đó, F88 sẵn sàng ghi nhận, tưởng thưởng bằng cả vật chất và tinh thần. Minh chứng cho điều đó là ở thời điểm hiện tại, tỉ lệ quản lý dưới 30 tuổi của F88 đạt 48.7% trên tổng chức danh quản lý trong tổ chức và ngay tại khối Công nghệ Thông tin, có nhiều bạn trẻ sinh năm 1998 &#8211; 1999 đã trở thành Chuyên viên Cao cấp, giữ vai trò quan trọng trong đội nhóm. </span></p>\n\n<p><span >Với chiến lược phù hợp, sự đồng thuận và quyết tâm nội tại, tôi tin F88 sẽ là nơi để đội ngũ nhân tài Công nghệ thể hiện khát vọng, theo đuổi đam mê, tích lũy trải nghiệm và vững bước vượt mọi thử thách, vươn tới thành công.</span></p>\n\n<p>Khám phá ngay các cơ hội <a href="https://UpNext.com/nha-tuyen-dung/f88?utm_source=UpNext_blog&amp;utm_medium=fit_jobs_2024&amp;utm_campaign=f88_fit_jobs_sponsored_article_062024" target="_blank" rel="noopener">việc làm IT hấp dẫn</a> tại F88, hoặc tiếp cận nhanh chóng mọi thông tin hữu ích về sự nghiệp IT trong ngành Tài chính – Ngân hàng <a href="https://UpNext.com/viec-lam-it-noi-bat-tai-chinh-ngan-hang-2024?utm_source=UpNext_blog&amp;utm_medium=fit_jobs_2024&amp;utm_campaign=f88_fit_jobs_sponsored_article_062024" target="_blank" rel="noopener">tại đây</a>.</p>\n\n<p class="p1"><div class="post-views content-post post-73717 entry-meta load-dynamic">\r\n\t\t\t\t<span class="post-views-icon dashicons dashicons-chart-bar"></span> <span class="post-views-label">Post Views:</span> <span class="post-views-count">18.745</span>\r\n\t\t\t</div></p>\n\n<p ><em>Nội dung và hình ảnh được cung cấp bởi F88</em></p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'tin-tuc-upnext',
      metaTitle: 'F88 &#8211; Hành trình “Không Ngừng Chuyển Hóa” để tạo sự khác biệt',
      metaDescription:
        'Gặp gỡ Giám đốc Công nghệ Thông tin (CIO) của F88 – anh Đinh Gia Hiếu để tìm hiểu hành trình chuyển đổi số mạnh mẽ ở F88 và vai trò của nhân tài IT...',
      viewCount: 14825,
      tags: ['Tin tức UpNext', 'Xu hướng công nghệ', 'Developer'],
    },
    {
      id: postSeedId(202),
      title: 'Designing AI Systems for Millions of Digital Assets: The Orange Logic Approach',
      slug: 'designing-ai-systems-for-millions-of-digital-assets-the-orange-logic-approach',
      imageUrl:
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 73,
      content:
        '<h1 class="page-title">Designing AI Systems for Millions of Digital Assets: The Orange Logic Approach   </h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/ai-data/"><span>AI &amp; Data</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Beyond_Magic_The_Philosophy_of_AI" >Beyond Magic: The Philosophy of AI&nbsp;&nbsp;&nbsp;</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#Embedding_AI_into_the_Core_of_Content_Systems" >Embedding AI into the Core of Content Systems&nbsp;&nbsp;</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-3" href="#From_Theory_to_Impact_The_AI_Transformation_at_AFI" >From Theory to Impact: The AI Transformation at AFI&nbsp;</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-4" href="#Orange_Logic" >Orange Logic&nbsp;</a></li></ul>\n\n</nav></div>\n\n<p>Most enterprises have millions of images, videos, and documents they&nbsp;can&#8217;t&nbsp;find when they need them. The assets exist, but the information inside them, such as&nbsp;who&#8217;s&nbsp;in the photo,&nbsp;what&#8217;s&nbsp;said in the recording, or what&nbsp;the document is about, is locked up in files scattered across systems with inconsistent or missing metadata. Searching is slow. Reusing existing work is harder than creating it again from scratch.&nbsp;</p>\n\n<p>The instinct is to treat this as a content management problem with better folders, stricter tagging rules, and more&nbsp;disciplined librarians. That approach scales until it&nbsp;doesn&#8217;t. Manual tagging&nbsp;can&#8217;t&nbsp;keep up with volume. Predefined taxonomies go stale as the business changes.&nbsp;Eventually, organizations are paying to store data they can&#8217;t actually use.&nbsp;</p>\n\n<p>AI changes&nbsp;what&#8217;s&nbsp;possible here. Instead of waiting for humans to describe every asset, modern systems read the assets directly: a face in a photo, a sentence in a recording, a chart in a PDF. The content describes itself, and the archive becomes searchable on its own terms.&nbsp;</p>\n\n<h2 class="wp-block-heading" id="h-beyond-magic-the-philosophy-of-ai-nbsp-nbsp-nbsp"><span class="ez-toc-section" id="Beyond_Magic_The_Philosophy_of_AI"></span><strong>Beyond Magic: The Philosophy of AI&nbsp;</strong>&nbsp;&nbsp;<span class="ez-toc-section-end"></span></h2>\n\n<p>Applying AI in enterprise environments goes far beyond improving user experience. It involves designing systems that can&nbsp;operate&nbsp;reliably across millions of assets, integrate with complex infrastructures, and support evolving business needs.&nbsp;&nbsp;</p>\n\n<p>AI is increasingly used to automate processes such as tagging, classification, workflow routing, and compliance checks. A growing direction is the development of agent-based systems capable of executing multi-step tasks and adapting to specific domains. In this model, AI becomes an active participant in workflows rather than just a supporting tool. </p>\n\n<p><strong>One of the most visible shifts is in search</strong>. Traditional systems depend on exact matches such as filenames or tags, while AI-driven approaches aim to interpret user intent. This enables natural language search, more relevant results despite incomplete metadata, and faster access to information. Behind this experience lies a combination of semantic understanding, pattern recognition, and continuous refinement based on real usage.&nbsp;&nbsp;</p>\n\n<p>For engineers, however, what appears seamless to users involves significant complexity underneath. Building production-ready AI systems requires continuous experimentation, evaluating trade-offs between accuracy and performance, and ensuring scalability over time. The experience may feel intuitive, but it is grounded in disciplined engineering. A useful analogy can be drawn from Alita: Battle Angel, where advanced technology appears almost magical, yet is&nbsp;ultimately the&nbsp;result of thoughtful design and engineering rigor.&nbsp;&nbsp;</p>\n\n<p>Equally important is the <strong>data infrastructure</strong> that supports these capabilities. AI systems depend on scalable storage, high-performance APIs, robust data pipelines, and governance layers to ensure compliance and security. In this context, content platforms evolve into foundational data infrastructure, connecting systems, standardizing access, and enabling organizations to fully&nbsp;leverage&nbsp;their information.&nbsp;&nbsp;</p>\n\n<p>As digital content continues to grow, the distinction between content and data will continue to blur. The future lies in intelligent systems that can understand, connect, and activate information at scale, reshaping how organizations interact with their own data.&nbsp;&nbsp;</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n<figcaption class="wp-element-caption">A discovery problem for most organizations</figcaption></figure>\n\n<h2 class="wp-block-heading" id="h-embedding-ai-into-the-core-of-content-systems-nbsp-nbsp"><span class="ez-toc-section" id="Embedding_AI_into_the_Core_of_Content_Systems"></span><strong>Embedding AI into the Core of Content Systems</strong>&nbsp;&nbsp;<span class="ez-toc-section-end"></span></h2>\n\n<p>Platforms like those developed by Orange Logic, founded by <strong>Karl Facredyn</strong>, reflect this transition. What began as a solution for managing large photo archives has evolved into systems designed to treat content as a dynamic data layer: one that can be queried, enriched, and acted upon intelligently. AI is no longer positioned as an add-on feature, but as a foundational&nbsp;component&nbsp;of how these systems&nbsp;operate. What truly differentiates an AI team, however, is not just the technology it adopts, but how engineers are empowered to transform ideas into real, production-ready, and impactful solutions.&nbsp;&nbsp;</p>\n\n<p>At Orange Logic, this means working on high-impact AI applications that solve real-world problems:&nbsp;&nbsp;&nbsp;</p>\n\n<ul class="wp-block-list">\n<li><strong>AI Search:</strong>&nbsp;We enable users to search using their own words and find assets even when they&nbsp;don’t&nbsp;know the exact tags, filenames, or where an asset lives. This saves time and removes friction from discovery.&nbsp;&nbsp;&nbsp;&nbsp;</li>\n</ul>\n\n<ul class="wp-block-list">\n<li><strong>AI Assistant</strong>: Transforms simple conversation into action, users effortlessly manage and create assets without needing to learn complex workflows&nbsp;&nbsp;&nbsp;</li>\n</ul>\n\n<ul class="wp-block-list">\n<li><strong>Agentic AI Studio:</strong>&nbsp;Design and deploy your own AI agents with specific personalities and domain knowledge, enable autonomously handling of repetitive tasks at scale.&nbsp;&nbsp;&nbsp;</li>\n</ul>\n\n<p>By handling the heavy lifting behind the scenes, AI frees users to focus on creative, strategic, and high-impact work,&nbsp;ultimately making&nbsp;their day-to-day experience simpler, faster, and more rewarding.&nbsp;&nbsp;</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n<figcaption class="wp-element-caption">How Agent Studio helps with Creatives</figcaption></figure>\n\n<h2 class="wp-block-heading" id="h-from-theory-to-impact-the-ai-transformation-at-afi-nbsp"><span class="ez-toc-section" id="From_Theory_to_Impact_The_AI_Transformation_at_AFI"></span><strong>From Theory to Impact: The AI Transformation at AFI</strong>&nbsp;<span class="ez-toc-section-end"></span></h2>\n\n<p>To illustrate this shift, consider the <strong>American Film Institute (AFI)</strong>, a nonprofit preserving 50 years of cinematic history. Before implementing Orange Logic, their archive of over 1 million still images and 70,000 audio/video recordings was siloed across disorganized servers and physical tapes.&nbsp;</p>\n\n<p>By embedding AI into the core of their archive, AFI achieved three critical technical breakthroughs:&nbsp;</p>\n\n<ul class="wp-block-list">\n<li><strong>Automated Metadata Enrichment:</strong>&nbsp;AFI utilized Facial Recognition to process over a million assets. A batch confirm tool allowed them to go through groups of photos and confirm identifications without reviewing photos one by one.&nbsp;</li>\n</ul>\n\n<ul class="wp-block-list">\n<li><strong>Easy-to-use Search:</strong>&nbsp;For their 700,000 recordings, AFI used AI-driven auto-captioning. This transformed audio into searchable data, allowing users to find not only a specific speaker but also every instance where that person was a topic of discussion across other assets.&nbsp;</li>\n</ul>\n\n<ul class="wp-block-list">\n<li><strong>High-Velocity Asset Orchestration:</strong>&nbsp;With video files as large as 400 GB, users can now use AI to&nbsp;identify&nbsp;specific time codes and download only the necessary&nbsp;subclips<strong>&nbsp;</strong>directly from the DAM.&nbsp;</li>\n</ul>\n\n<p><em>Link for reference:&nbsp;</em><a href="https://www.orangelogic.com/case-studies/american-film-institute" target="_blank" rel="noreferrer noopener"><em>https://www.orangelogic.com/case-studies/american-film-institute</em></a>&nbsp;</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n<figcaption class="wp-element-caption">The AI Transformation at American Film Institute</figcaption></figure>\n\n<h2 class="wp-block-heading" id="h-orange-logic-nbsp"><span class="ez-toc-section" id="Orange_Logic"></span><strong>Orange Logic</strong>&nbsp;<span class="ez-toc-section-end"></span></h2>\n\n<p>Orange Logic is more than a software provider; we are the architects of digital ecosystems. We empower organizations to take control of their creative and functional assets through a platform that is as dynamic as their ideas.&nbsp;Our clients include the American Film Institute, the World Bank, and the United Nations. The work spans healthcare archives, humanitarian image libraries, brand archives, and retail content operations with different industries, same underlying problem: too many assets, not enough structure.&nbsp;&nbsp;</p>\n\n<p>What truly defines us is not just our platform, but the people behind the code. We believe that extraordinary engineering begins with human passion, which is why we invest deeply in our teams. We foster a hiring process designed to attract the top-tier engineering minds who are passionate about solving impossible problems at scale. This commitment secures the&nbsp;expertise&nbsp;and creativity needed to elevate our product and ensure our clients maximize their full potential.&nbsp;&nbsp;</p>\n\n<p>Also,&nbsp;strong ownership is a core principle for all engineers, especially the AI team in Vietnam. Engineers are not just contributors to isolated tasks; they own their features end-to-end. From early exploration and prototyping to production deployment and long-term maintenance, teams are trusted to make technical decisions, experiment with&nbsp;new approaches, and take responsibility for outcomes. This ownership culture creates a safe space for innovation, where learning and experimentation are encouraged rather than constrained.&nbsp;&nbsp;</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n<figcaption class="wp-element-caption">The Orange Logic Team</figcaption></figure>\n\n<p><a href="https://UpNext.com/nha-tuyen-dung/ol-vietnam">Orange Logic</a> is committed to pushing the boundaries of what is possible in the DAM and MAM spaces. As we continue to expand our footprint, we are looking for engineers, visionaries, and problem solvers who want to work on a product that&nbsp;impacts&nbsp;the world’s most recognizable brands.&nbsp;&nbsp;</p>\n\n<p class="has-text-align-right"><em>Content and images belong to Orange Logic Vietnam.</em></p>\n\n</div>\n<div class="entry-tags is-width-constrained "><span class="ct-module-title">TAGS</span><div class="entry-tags-items"><a href="https://UpNext.com/blog/tag/ai-tranformation/" rel="tag"><span>#</span> AI tranformation</a><a href="https://UpNext.com/blog/tag/ai-driven/" rel="tag"><span>#</span> AI-driven</a><a href="https://UpNext.com/blog/tag/tech-trend/" rel="tag"><span>#</span> Tech trend</a></div></div>\t\t\n\t\t\t\t\t\n\t\t<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle: 'Designing AI Systems for Millions of Digital Assets: The Orange Logic Approach',
      metaDescription:
        'Beyond the magic of AI: Discover how Orange Logic engineers production-ready AI search and agentic studios to solve complex enterprise data problems.',
      viewCount: 9680,
      tags: ['Career Path', 'Developer', 'Phỏng vấn IT'],
    },
    {
      id: postSeedId(203),
      title: 'Scala Developer là gì: Kỹ năng yêu cầu và cơ hội nghề nghiệp',
      slug: 'scala-developer-la-gi',
      imageUrl:
        'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 387,
      content:
        '<h1 class="page-title">Scala Developer là gì: Kỹ năng yêu cầu và cơ hội nghề nghiệp</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/chuyen-mon-it/"><span>Chuyên môn IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<h2 class="wp-block-heading" id="h-lộ-trinh-trở-thanh-scala-developer"><span class="ez-toc-section" id="Lo_trinh_tro_thanh_Scala_Developer"></span><strong>Lộ trình trở thành Scala Developer</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Để trở thành một Scala Developer, bạn cần xây dựng nền tảng lập trình vững chắc, sau đó từng bước tiếp cận hệ sinh thái Scala và các công nghệ liên quan. Vì Scala thường được sử dụng trong backend systems và các nền tảng dữ liệu lớn, lộ trình học thường kết hợp giữa kiến thức lập trình, hệ thống và xử lý dữ liệu.&nbsp;</p>\n\n<h3 class="wp-block-heading" id="h-kiến-thức-nền-tảng-cần-nắm-vững"><strong>Kiến thức nền tảng cần nắm vững</strong></h3>\n\n<p>Trước khi lựa chọn hướng đi cụ thể, bạn cần hiểu rõ những kiến thức cốt lõi sau:</p>\n\n<ul class="wp-block-list">\n<li><strong>Lập trình cơ bản và tư duy giải quyết vấn đề: </strong>Bao gồm cấu trúc dữ liệu, thuật toán, cách tổ chức chương trình và tư duy logic. Đây là nền tảng chung cho mọi ngôn ngữ, không riêng gì Scala.</li>\n\n<li><strong>Lập trình hướng đối tượng (OOP): </strong>Scala chạy trên JVM và có khả năng tương tác chặt chẽ với Java, vì vậy việc hiểu OOP (class, object, inheritance, abstraction…) sẽ giúp bạn tiếp cận Scala dễ dàng hơn</li>\n\n<li><strong>Scala core và cú pháp cơ bản: </strong>Làm quen với cách khai báo biến (val, var), functions, collections, pattern matching và cách Scala tổ chức code.</li>\n\n<li><strong>Tư duy lập trình hàm (Functional Programming): </strong>Đây là điểm khác biệt lớn nhất của Scala. Những khái niệm bạn cần làm quen trước là immutability, pure function, higher-order function, map/filter/reduce, Option, Either… </li>\n\n<li><strong>Hiểu hệ sinh thái JVM: </strong>Scala chạy trên JVM, vì vậy việc hiểu cách JVM hoạt động, cách sử dụng thư viện Java và cách Scala tương tác với Java sẽ giúp bạn làm việc hiệu quả hơn trong môi trường thực tế.</li>\n</ul>\n\n<p>Sau khi đã có nền tảng này, bạn có thể lựa chọn hướng phát triển phù hợp với mục tiêu nghề nghiệp của mình theo hướng Backend/Distributed Systems hoặc Data/platform.</p>\n\n<h3 class="wp-block-heading" id="h-backend-distributed-systems"><strong>Backend/Distributed Systems</strong></h3>\n\n<p>Nếu bạn muốn trở thành backend engineer hoặc làm việc với hệ thống phân tán, bạn cần tập trung vào các kỹ năng:</p>\n\n<ul class="wp-block-list">\n<li><strong>Scala core và tư duy Functional Programming: </strong>Việc viết code rõ ràng, immutable và dễ mở rộng là yếu tố rất quan trọng khi xây dựng hệ thống backend lớn.</li>\n\n<li><strong>Hiểu cách thiết kế API và hệ thống backend: </strong>Bạn cần hiểu cách thiết kế RESTful API, xử lý request/response, validation và tổ chức business logic một cách sạch sẽ.</li>\n\n<li><strong>Concurrency và Distributed Systems: </strong>là phần cốt lõi khi dùng Scala cho backend. Bạn cần hiểu cách xử lý bất đồng bộ (async), multi-threading và cách hệ thống hoạt động khi scale.</li>\n\n<li><strong>Các framework và công nghệ phổ biến: </strong>Một số công cụ thường dùng gồm:</li>\n</ul>\n\n<ul class="wp-block-list">\n<li>Play Framework (web framework)</li>\n\n<li>Akka / Apache Pekko (actor model, hệ thống phân tán)</li>\n\n<li>Cats Effect / ZIO (quản lý side effects theo hướng functional)</li>\n\n<li><strong>Database và hệ thống triển khai: </strong>Sử dụng database (SQL/NoSQL) và cách tối ưu hệ thống; làm quen với Docker, CI/CD và cách deploy hệ thống trong production.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-scala-data-big-data-platform"><strong>Scala Data / Big Data Platform</strong></h3>\n\n<p>Nếu bạn quan tâm đến dữ liệu và hệ thống xử lý dữ liệu, bạn nên tập trung vào:</p>\n\n<ul class="wp-block-list">\n<li><strong>Scala core và xử lý dữ liệu với collections: </strong>Khả năng thao tác dữ liệu bằng functional style là nền tảng quan trọng khi làm việc với Big Data.</li>\n\n<li><strong>Apache Spark (trọng tâm): </strong>Đây là công cụ quan trọng nhất trong hệ sinh thái Scala Data. Bạn cần hiểu:\n\n<ul class="wp-block-list">\n<li>DataFrame / Dataset</li>\n\n<li>Transformation vs Action</li>\n\n<li>Cách Spark xử lý dữ liệu phân tán</li>\n</ul>\n\n</li>\n<li><strong>Streaming data với Kafka: </strong>Hiểu cách dữ liệu được xử lý theo thời gian thực (real-time), event-driven systems.</li>\n<li><strong>Data modeling và pipeline: </strong>Biết cách tổ chức dữ liệu, xây dựng pipeline ETL/ELT và xử lý dữ liệu batch vs streaming.</li>\n<li><strong>Orchestration và Cloud: </strong>Làm quen với các công cụ như Airflow, Dagster và các nền tảng cloud (AWS, GCP, Azure) để vận hành hệ thống dữ liệu.</li>\n</ul>\n\n<h2 class="wp-block-heading" id="h-cơ-hội-nghề-nghiệp-của-scala-developer"><span class="ez-toc-section" id="Co_hoi_nghe_nghiep_cua_Scala_Developer"></span><strong>Cơ hội nghề nghiệp của Scala Developer</strong><span class="ez-toc-section-end"></span></h2>\n\n<h3 class="wp-block-heading" id="h-linh-vực-phat-triển-nghề-nghiệp-cho-scala-developer"><strong>Lĩnh vực phát triển nghề nghiệp cho Scala Developer</strong></h3>\n\n<p>So với các ngôn ngữ phổ biến như Java, Python hay JavaScript, Scala không phải là lựa chọn xuất hiện với tần suất dày đặc trong các tin tuyển dụng. Tuy nhiên, trên thực tế, thị trường việc làm Scala có thể được nhìn nhận theo hướng “không quá rộng về số lượng, nhưng tập trung ở những hệ thống quan trọng”.</p>\n\n<p>Các vị trí liên quan đến Scala thường xuất hiện trong những môi trường như hệ thống backend quy mô lớn, nền tảng xử lý dữ liệu, hoặc các hệ thống phân tán cần khả năng mở rộng và xử lý đồng thời tốt. Vì vậy, dù không phải là lựa chọn phổ biến cho mọi dự án, Scala vẫn có chỗ đứng trong những bài toán kỹ thuật phức tạp.</p>\n\n<p>Xét về định hướng nghề nghiệp, Scala Developer thường xuất hiện trong các lĩnh vực cụ thể như:</p>\n\n<ul class="wp-block-list">\n<li>Backend và hệ thống phân tán, nơi Scala được sử dụng để xây dựng các dịch vụ có khả năng xử lý nhiều request và dễ mở rộng.</li>\n\n<li>Data engineering và xử lý dữ liệu, đặc biệt khi làm việc với các nền tảng như Spark hoặc các hệ thống pipeline dữ liệu.</li>\n\n<li>Platform engineering, nơi developer xây dựng các hệ thống nền tảng phục vụ cho các team khác.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-tinh-chất-cong-việc-của-scala-developer"><strong>Tính chất công việc của Scala Developer</strong></h3>\n\n<p>Một điểm đáng chú ý là dù số lượng cơ hội việc làm không quá nhiều, nhưng các vị trí Scala thường mang tính chuyên môn hóa cao. Điều này có nghĩa là lập trình viên không chỉ làm việc với ngôn ngữ, mà còn phải hiểu về cách hệ thống vận hành, cách dữ liệu được xử lý và cách các thành phần trong hệ thống tương tác với nhau.</p>\n\n<p>Chính vì vậy, Scala Developer thường có cơ hội tham gia vào những hệ thống lớn và có độ phức tạp cao hơn so với nhiều dự án thông thường.</p>\n\n<h3 class="wp-block-heading" id="h-thu-nhập-của-scala-developer"><strong>Thu nhập của Scala Developer</strong></h3>\n\n<p>Về mặt thu nhập và lộ trình phát triển, các vị trí Scala thường yêu cầu kinh nghiệm nhất định, đặc biệt là hiểu biết về hệ thống, dữ liệu hoặc lập trình hàm. Do đó, các cơ hội việc làm thường tập trung nhiều hơn ở mức mid-level hoặc senior thay vì entry-level.</p>\n\n<p>Điều này cũng lý giải vì sao Scala đôi khi được xem là một lựa chọn phù hợp hơn khi bạn đã có nền tảng lập trình vững và muốn đi sâu vào các hệ thống kỹ thuật phức tạp.</p>\n\n<h2 class="wp-block-heading" id="h-cau-hỏi-thường-gặp-về-scala-developer"><span class="ez-toc-section" id="Cau_hoi_thuong_gap_ve_Scala_Developer"></span><strong>Câu hỏi thường gặp về Scala Developer</strong><span class="ez-toc-section-end"></span></h2>\n\n<h3 class="wp-block-heading" id="h-scala-developer-co-cần-biết-java-khong"><strong>Scala Developer có cần biết Java không?</strong></h3>\n\n<p>Không bắt buộc, nhưng biết Java sẽ là một lợi thế rất lớn khi làm việc với Scala. Scala chạy trên JVM (Java Virtual Machine) nên có thể sử dụng trực tiếp hầu hết các thư viện và framework của Java. Vì vậy, việc hiểu Java giúp Scala Developer dễ dàng đọc tài liệu, sử dụng thư viện trong hệ sinh thái JVM và tích hợp Scala với các hệ thống Java sẵn có.</p>\n\n<p>Trong nhiều dự án thực tế, các hệ thống backend thường kết hợp cả Java và Scala, nên kiến thức Java sẽ giúp lập trình viên làm việc hiệu quả hơn.</p>\n\n<h3 class="wp-block-heading" id="h-co-nen-học-scala-dể-trở-thanh-data-engineer-khong"><strong>Có nên học Scala để trở thành Data Engineer không?</strong></h3>\n\n<p>Có. Scala được xem là một trong những ngôn ngữ khá quan trọng trong lĩnh vực Data Engineering, đặc biệt khi làm việc với các công cụ Big Data như Apache Spark. Spark được viết chủ yếu bằng Scala và nhiều API gốc của Spark cũng được thiết kế tối ưu cho Scala. Vì vậy, việc hiểu Scala có thể giúp Data Engineer xây dựng các pipeline xử lý dữ liệu, xử lý streaming data và tối ưu các job xử lý dữ liệu hiệu quả hơn.</p>\n\n<h3 class="wp-block-heading" id="h-cơ-hội-việc-lam-scala-developer-tại-việt-nam-như-thế-nao"><strong>Cơ hội việc làm Scala Developer tại Việt Nam như thế nào?</strong></h3>\n\n<p>Số lượng việc làm Scala tại Việt Nam không nhiều, nhưng thường xuất hiện trong các công ty làm sản phẩm, fintech hoặc các dự án data. Nhiều vị trí liên quan đến làm việc với hệ thống quốc tế hoặc client nước ngoài.</p>\n\n<h2 class="wp-block-heading" id="h-tổng-kết"><span class="ez-toc-section" id="Tong_ket"></span><strong>Tổng kết</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Scala Developer là một vai trò quan trọng trong hệ sinh thái backend và Big Data. Để trở thành Scala Developer, bạn cần nắm vững nền tảng lập trình, hiểu cách hoạt động của Scala và hệ sinh thái JVM, đồng thời làm quen với các công nghệ liên quan như hệ thống backend, hệ thống phân tán và các công cụ xử lý dữ liệu như Apache Spark. Khi kết hợp được những kỹ năng này, Scala Developer có thể tham gia phát triển nhiều hệ thống công nghệ phức tạp trong các lĩnh vực như fintech, data platform hoặc các nền tảng Big Data.</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle: 'Scala Developer là gì: Kỹ năng yêu cầu và cơ hội nghề nghiệp',
      metaDescription:
        'Scala Developer là gì? Tìm hiểu vai trò, kỹ năng cần có, các công cụ phổ biến, lộ trình học và sự khác biệt giữa Scala Dev và Java Dev ngay.',
      viewCount: 7430,
      tags: ['Career Path', 'Developer', 'Phỏng vấn IT'],
    },
    {
      id: postSeedId(204),
      title:
        'Muốn AI tạo ra giá trị dài hạn, doanh nghiệp cần chuẩn bị những gì: Bài học từ GoTymeX',
      slug: 'tu-ai-poc-den-production-bai-hoc-tu-gotymex',
      imageUrl:
        'https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 34,
      content:
        '<h1 class="page-title">Muốn AI tạo ra giá trị dài hạn, doanh nghiệp cần chuẩn bị những gì: Bài học từ GoTymeX</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/podcast-phong-van-chuyen-gia/"><span>Podcast Phỏng vấn chuyên gia</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Mo_rong_AI_khong_bat_dau_bang_viec_xay_nhieu_AI_Agent_ma_bang_viec_chon_dung_bai_toan" >Mở rộng AI không bắt đầu bằng việc xây nhiều AI Agent, mà bằng việc chọn đúng bài toán</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#AI_chi_co_the_mo_rong_khi_du_lieu_quy_trinh_va_cach_van_hanh_cua_doanh_nghiep_da_san_sang" >AI chỉ có thể mở rộng khi dữ liệu, quy trình và cách vận hành của doanh nghiệp đã sẵn sàng</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-3" href="#Thach_thuc_lon_nhat_cua_AI_khong_nam_o_cong_nghe_ma_o_con_nguoi" >Thách thức lớn nhất của AI không nằm ở công nghệ, mà ở con người</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-4" href="#Ket_luan" >Kết luận</a></li></ul>\n\n</nav></div>\n\n<p>Trong vài năm qua, nhiều doanh nghiệp đã bắt đầu ứng dụng trí tuệ nhân tạo (AI) vào công việc hằng ngày. Tuy nhiên, khoảng cách giữa việc xây dựng một proof-of-concept (POC) thành công và vận hành AI ở quy mô doanh nghiệp vẫn còn rất lớn. Khi AI bước vào các quy trình cốt lõi, doanh nghiệp không chỉ đối mặt với những thách thức về công nghệ mà còn phải giải quyết các vấn đề về dữ liệu, quy trình, quản trị thay đổi và phát triển nhân sự. Đây cũng là lý do nhiều dự án AI tạo được kết quả ấn tượng trong giai đoạn thử nghiệm nhưng không thể mở rộng thành năng lực vận hành thực sự của tổ chức.</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p><em>Nội dung dưới đây được tổng hợp từ phần chia sẻ của </em><strong><em>Andrew Pfaff</em></strong><em> &#8211; AI Product Manager tại GoTymeX, trong buổi trò chuyện cùng UpNext.</em></p>\n\n<p><em>Từ kinh nghiệm triển khai AI tại trung tâm công nghệ của tập đoàn ngân hàng số GoTyme phục vụ hơn 20 triệu khách hàng tại Nam Phi và Philippines, ông chia sẻ cách doanh nghiệp từng bước đưa AI từ những thử nghiệm nhỏ trở thành một phần của hệ thống vận hành</em>.</p>\n\n</blockquote>\n\n<h2 class="wp-block-heading" id="h-mở-rộng-ai-khong-bắt-dầu-bằng-việc-xay-nhiều-ai-agent-ma-bằng-việc-chọn-dung-bai-toan"><span class="ez-toc-section" id="Mo_rong_AI_khong_bat_dau_bang_viec_xay_nhieu_AI_Agent_ma_bang_viec_chon_dung_bai_toan"></span><strong>Mở rộng AI không bắt đầu bằng việc xây nhiều AI Agent, mà bằng việc chọn đúng bài toán</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Một trong những ngộ nhận phổ biến khi triển khai AI là cho rằng càng xây nhiều AI Agent thì doanh nghiệp càng tạo ra nhiều giá trị. Thực tế, nếu mọi bài toán đều được giải quyết bằng một dự án AI riêng, doanh nghiệp rất dễ phân tán nguồn lực và tạo ra những hệ thống khó quản trị. Vì vậy, trước khi nghĩ đến việc mở rộng AI, điều quan trọng hơn là xác định đâu là những vấn đề thực sự đáng để đầu tư.</p>\n\n<p>GoTymeX tiếp cận vấn đề này bằng cách chia AI thành hai hướng triển khai song song. Những tác vụ mang tính cá nhân hoặc có phạm vi ảnh hưởng nhỏ được giải quyết bằng các công cụ AI phổ biến như ChatGPT hay Claude, giúp nhân viên tự động hóa công việc hằng ngày mà không cần doanh nghiệp phát triển thêm hệ thống riêng. Trong khi đó, các bài toán tạo ra điểm nghẽn cho toàn tổ chức, chẳng hạn như KYC, chống gian lận hay vận hành hệ thống, mới được giao cho các nhóm AI chuyên trách xây dựng các agent tùy chỉnh.</p>\n\n<p>Andrew Pfaff mô tả cách tiếp cận này bằng hai khái niệm “horizontal leverage” và “vertical depth”: “Một bên là những tác vụ nhỏ có thể được tự động hóa, còn bên kia là những điểm nghẽn lớn của tổ chức”. Thay vì xem AI là một giải pháp duy nhất áp dụng cho mọi trường hợp, GoTymeX coi AI là một danh mục đầu tư, trong đó mức độ đầu tư phụ thuộc vào quy mô tác động của từng vấn đề.</p>\n\n<p>Triết lý này cũng thể hiện rõ trong cách GoTymeX bắt đầu hành trình AI. Đội ngũ của ông Andrew ban đầu chỉ gồm ba người, tập trung thực hiện các POC nhỏ nhằm chứng minh giá trị của AI đối với từng bài toán cụ thể. Khi những kết quả đầu tiên đủ sức thuyết phục ban lãnh đạo, đội ngũ mới từng bước mở rộng lên hơn 35 kỹ sư và chuyên gia quản lý sản phẩm, đồng thời đưa AI vào các nghiệp vụ có ảnh hưởng lớn hơn. Điều này cho thấy việc mở rộng AI không phải là kết quả của một quyết định đầu tư duy nhất mà là quá trình tích lũy thông qua nhiều thành công nhỏ.</p>\n\n<h2 class="wp-block-heading" id="h-ai-chỉ-co-thể-mở-rộng-khi-dữ-liệu-quy-trinh-va-cach-vận-hanh-của-doanh-nghiệp-da-sẵn-sang"><span class="ez-toc-section" id="AI_chi_co_the_mo_rong_khi_du_lieu_quy_trinh_va_cach_van_hanh_cua_doanh_nghiep_da_san_sang"></span><strong>AI chỉ có thể mở rộng khi dữ liệu, quy trình và cách vận hành của doanh nghiệp đã sẵn sàng</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Khi AI bắt đầu được triển khai ở quy mô lớn, thách thức lúc này chuyển sang việc tạo ra một nền tảng đủ vững để AI có thể hoạt động ổn định, được quản trị hiệu quả và dễ dàng mở rộng sang nhiều quy trình khác nhau. Nói cách khác, AI chỉ thực sự phát huy giá trị khi doanh nghiệp xem nó là một phần của hệ thống thay vì một công cụ độc lập.</p>\n\n<p>Để đạt được điều đó, GoTymeX xây dựng nền tảng dựa trên ba yếu tố:</p>\n\n<ul class="wp-block-list">\n<li><em>Thứ nhất</em> là dữ liệu, được tổ chức theo các lớp Bronze, Silver và Gold nhằm bảo đảm dữ liệu được làm sạch, chuẩn hóa và có thể được AI sử dụng một cách nhất quán.</li>\n\n<li><em>Thứ hai</em> là ngữ cảnh tổ chức, nơi các tài liệu, quy trình, quyết định và tri thức được tập trung trên các nền tảng như Confluence và Slack để AI có thể truy cập đúng thông tin thay vì phụ thuộc vào kiến thức của từng cá nhân.</li>\n\n<li><em>Cuối cùng</em> là chuẩn hóa cách các nhóm làm việc thông qua mô hình pod, giúp các quy trình có cấu trúc thống nhất và đủ rõ ràng để AI có thể tham gia vào quá trình vận hành.</li>\n</ul>\n\n<p>Theo Andrew Pfaff, “Nếu mọi nhóm đều làm việc theo những cách hoàn toàn khác nhau thì sẽ rất khó để tích hợp AI Agent vào các quy trình đó và tự động hóa chúng”. Nhận định này phản ánh một thực tế mà nhiều doanh nghiệp thường bỏ qua: AI không thể khắc phục sự thiếu nhất quán trong quy trình vận hành. Ngược lại, càng chuẩn hóa được dữ liệu và cách làm việc, doanh nghiệp càng dễ triển khai AI ở quy mô lớn mà không phải xây dựng lại từ đầu cho từng phòng ban.</p>\n\n<p>Từ góc nhìn này, có thể hiểu rằng khi nền tảng đã đủ vững, mỗi dự án AI mới sẽ không còn là một nỗ lực độc lập mà trở thành một phần của hệ thống có thể tiếp tục mở rộng trong tương lai.</p>\n\n<h2 class="wp-block-heading" id="h-thach-thức-lớn-nhất-của-ai-khong-nằm-ở-cong-nghệ-ma-ở-con-người"><span class="ez-toc-section" id="Thach_thuc_lon_nhat_cua_AI_khong_nam_o_cong_nghe_ma_o_con_nguoi"></span><strong>Thách thức lớn nhất của AI không nằm ở công nghệ, mà ở con người</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Nhiều doanh nghiệp đầu tư đáng kể vào mô hình, hạ tầng và dữ liệu nhưng vẫn gặp khó khăn khi triển khai AI trên diện rộng. Kinh nghiệm của GoTymeX cho thấy nguyên nhân thường không xuất phát từ công nghệ mà đến từ việc con người chưa sẵn sàng thay đổi cách làm việc.</p>\n\n<p>Thay vì bắt đầu bằng các khóa đào tạo lý thuyết, GoTymeX yêu cầu mọi nhân viên tự xây dựng một AI Agent trong chương trình “Minimum Standard Program”. Mục tiêu của chương trình không phải để tất cả đều trở thành kỹ sư AI, mà để mỗi người trực tiếp trải nghiệm cách AI hoạt động và tự khám phá những cơ hội ứng dụng trong công việc của mình.</p>\n\n<p>Giải thích lý do vì sao, ông Andrew Pfaff chia sẻ: “Chúng tôi chọn cách tiếp cận dựa trên trải nghiệm. Khi tự tay xây dựng một AI Agent, bạn sẽ nhận ra có rất nhiều phần trong công việc của mình có thể được áp dụng AI và trải nghiệm cảm giác wow đó”.</p>\n\n<p>Sự thay đổi còn thể hiện rõ trong cách các chuyên gia nghiệp vụ làm việc với AI. Giờ đây, nhiều chuyên gia không còn là người làm chuyên môn mà đang dần chuyển sang vai trò đánh giá và giám sát kết quả do AI tạo ra. Đây không chỉ là sự thay đổi về quy trình mà còn là sự thay đổi về trách nhiệm và tư duy nghề nghiệp.</p>\n\n<p>Một bài học đáng chú ý khác đến từ dự án AI trong phòng chống rửa tiền (AML). Ban đầu, hệ thống bị đánh giá là có độ chính xác chưa đạt kỳ vọng. Tuy nhiên, khi phân tích sâu hơn, GoTymeX phát hiện các chuyên gia cấp cao thường đưa ra kết luận rất gần với AI, trong khi những chuyên viên ít kinh nghiệm lại có mức độ bất đồng đáng kể với nhau. Điều đó cho thấy vấn đề không hoàn toàn nằm ở mô hình mà còn nằm ở chính cách doanh nghiệp xác định “đáp án đúng”. Từ kinh nghiệm này, GoTymeX áp dụng quy trình đánh giá double-blind và lựa chọn người đánh giá cẩn thận hơn trước khi kết luận về chất lượng của hệ thống AI.</p>\n\n<p>Những thay đổi đó cũng dẫn đến cách tiếp cận mới trong tuyển dụng. GoTymeX đánh giá cao những ứng viên sở hữu khả năng học hỏi có hệ thống, biết chọn lọc thông tin và thử nghiệm nhanh. Trong một lĩnh vực thay đổi gần như mỗi tuần, năng lực học tập liên tục và khả năng thích nghi được xem là nền tảng quan trọng hơn bất kỳ kỹ năng kỹ thuật cụ thể nào.</p>\n\n<h2 class="wp-block-heading" id="h-kết-luận"><span class="ez-toc-section" id="Ket_luan"></span><strong>Kết luận</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Hành trình của GoTymeX cho thấy việc đưa AI từ POC đến production không phải là quá trình mở rộng công nghệ, mà là quá trình trưởng thành của cả doanh nghiệp. Việc lựa chọn đúng bài toán, xây dựng nền tảng dữ liệu và quy trình đủ vững, chuẩn bị con người cho những vai trò mới và thiết lập phương pháp đánh giá phù hợp đều quan trọng không kém việc lựa chọn mô hình AI.</p>\n\n<p>Khi những yếu tố này được phát triển đồng thời, AI sẽ không còn là một dự án thử nghiệm riêng lẻ mà trở thành một năng lực cốt lõi có thể liên tục tạo ra giá trị cho tổ chức.</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'tin-tuc-upnext',
      metaTitle:
        'Muốn AI tạo ra giá trị dài hạn, doanh nghiệp cần chuẩn bị những gì: Bài học từ GoTymeX',
      metaDescription:
        'Khám phá cách GoTymeX đưa AI từ POC đến production với những bài học thực tế về chiến lược AI, dữ liệu, xây dựng AI as a System và thay đổi quản trị.',
      viewCount: 23985,
      tags: ['Tin tức UpNext', 'Xu hướng công nghệ', 'Developer'],
    },
    {
      id: postSeedId(205),
      title: 'Vì sao nhiều dự án Cloud vẫn thất bại dù doanh nghiệp đã đầu tư hàng triệu USD?',
      slug: 'vi-sao-nhieu-du-an-cloud-that-bai',
      imageUrl:
        'https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 119,
      content:
        '<h1 class="page-title">Vì sao nhiều dự án Cloud vẫn thất bại dù doanh nghiệp đã đầu tư hàng triệu USD?</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/xu-huong-cong-nghe/"><span>Xu hướng công nghệ</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Sai_lam_1_Xem_Cloud_la_du_an_ha_tang_thay_vi_nen_tang_tao_ra_gia_tri_kinh_doanh" >Sai lầm 1: Xem Cloud là dự án hạ tầng thay vì nền tảng tạo ra giá trị kinh doanh</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#Sai_lam_2_Chuyen_he_thong_len_Cloud_nhung_giu_nguyen_mo_hinh_van_hanh" >Sai lầm 2: Chuyển hệ thống lên Cloud nhưng giữ nguyên mô hình vận hành</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-3" href="#Sai_lam_3_Xem_Compliance_la_%E2%80%9Cdiem_kiem_tra_cuoi%E2%80%9D_thay_vi_tich_hop_ngay_tu_dau" >Sai lầm 3: Xem Compliance là &#8220;điểm kiểm tra cuối&#8221; thay vì tích hợp ngay từ đầu</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-4" href="#Sai_lam_4_Phu_thuoc_vao_phe_duyet_thu_cong_de_quan_tri_rui_ro" >Sai lầm 4: Phụ thuộc vào phê duyệt thủ công để quản trị rủi ro</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-5" href="#Sai_lam_5_Dau_tu_AI_nhung_chua_xay_dung_nen_tang_quan_tri_phu_hop" >Sai lầm 5: Đầu tư AI nhưng chưa xây dựng nền tảng quản trị phù hợp</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-6" href="#Ket_luan" >Kết luận</a></li></ul>\n\n</nav></div>\n\n<p><strong><em>Cloud đang bước sang một giai đoạn trưởng thành mới, không còn được xem đơn thuần là hạ tầng công nghệ mà đã trở thành nền tảng thúc đẩy đổi mới, AI và tăng trưởng. Theo báo cáo Make Cloud Your Advantage: From Digital Transformation to Breakthrough Performance của UpNext, chỉ khoảng một nửa doanh nghiệp thực sự đạt được mức độ trưởng thành để khai thác giá trị kinh doanh từ Cloud. Khoảng cách này không nằm ở bản thân công nghệ, mà đến từ mô hình vận hành, kiến trúc hệ thống và năng lực tổ chức. Dựa trên những phân tích trong báo cáo cùng góc nhìn của anh Phúc Đặng, Cloud Architect tại GoTymeX, bài viết sẽ chỉ ra những sai lầm phổ biến khiến nhiều dự án Cloud chưa thể tạo ra giá trị như kỳ vọng.</em></strong></p>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p><em>Tải miễn phí báo cáo </em><a href="https://marketing.UpNext.com/makecloudyouradvantage" target="_blank" rel="noreferrer noopener"><strong><em>Make Cloud Your Advantage: From Digital Transformation to Breakthrough Performance</em></strong></a><em> để khám phá đầy đủ những xu hướng mới nhất về Cloud, đồng thời đọc trọn vẹn các chia sẻ của ông Phúc Đặng cùng nhiều chuyên gia hàng đầu trong lĩnh vực Cloud và AI.</em></p>\n\n</blockquote>\n\n<h2 class="wp-block-heading" id="h-sai-lầm-1-xem-cloud-la-dự-an-hạ-tầng-thay-vi-nền-tảng-tạo-ra-gia-trị-kinh-doanh"><span class="ez-toc-section" id="Sai_lam_1_Xem_Cloud_la_du_an_ha_tang_thay_vi_nen_tang_tao_ra_gia_tri_kinh_doanh"></span><strong>Sai lầm 1: Xem Cloud là dự án hạ tầng thay vì nền tảng tạo ra giá trị kinh doanh</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Một trong những kết luận quan trọng của báo cáo <strong><em>Make Cloud Your Advantage: From Digital Transformation to Breakthrough Performance</em></strong> là giá trị lớn nhất của Cloud không đến từ việc tiết kiệm chi phí hạ tầng. Phần lớn giá trị kinh tế mà Cloud tạo ra đến từ đổi mới sản phẩm, AI, dữ liệu và khả năng mở rộng doanh nghiệp. Nói cách khác, Cloud chỉ thực sự phát huy hiệu quả khi trở thành nền tảng phục vụ chiến lược tăng trưởng.</p>\n\n<p>Nếu doanh nghiệp chỉ coi Cloud là một dự án &#8220;lift-and-shift&#8221;, hình thức chuyển hệ thống từ máy chủ vật lý lên Cloud, thì họ mới chỉ thay đổi nơi đặt hạ tầng, chứ chưa thay đổi cách tạo ra giá trị. Đó cũng là lý do nhiều tổ chức đã &#8220;lên Cloud&#8221; nhưng tốc độ phát triển sản phẩm, khả năng triển khai AI hay hiệu quả vận hành vẫn gần như không thay đổi.</p>\n\n<h2 class="wp-block-heading" id="h-sai-lầm-2-chuyển-hệ-thống-len-cloud-nhưng-giữ-nguyen-mo-hinh-vận-hanh"><span class="ez-toc-section" id="Sai_lam_2_Chuyen_he_thong_len_Cloud_nhung_giu_nguyen_mo_hinh_van_hanh"></span><strong>Sai lầm 2: Chuyển hệ thống lên Cloud nhưng giữ nguyên mô hình vận hành</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Theo báo cáo <strong><em>Make Cloud Your Advantage: From Digital Transformation to Breakthrough Performance</em></strong>, rào cản lớn nhất của Cloud hiện nay không còn là triển khai công nghệ mà là mức độ trưởng thành của mô hình vận hành. Nhiều doanh nghiệp vẫn quản lý Cloud theo tư duy công nghệ truyền thống: Dev và Ops tách biệt, quy trình phê duyệt nhiều tầng và phụ thuộc nhiều vào thao tác thủ công.</p>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p>Quan điểm này cũng được anh Phúc Đặng nhấn mạnh: <em>“Điểm nghẽn thực sự của nhiều tổ chức tài chính không còn nằm ở việc triển khai kỹ thuật, mà ở mô hình vận hành của tổ chức.”</em></p>\n\n</blockquote>\n\n<p>Theo anh, khi quy mô Cloud ngày càng lớn, câu hỏi quan trọng không còn là “triển khai như thế nào”, mà là “đang áp dụng những tiêu chuẩn quản trị nào, ai ra quyết định và các nhóm phối hợp với nhau ra sao”.</p>\n\n<p>Để minh họa cho cách tiếp cận này, anh chia sẻ rằng tại GoTymeX, đội ngũ Platform Engineering tập trung xây dựng Internal Developer Platform (IDP) nhằm giúp các Product Team có thể tự triển khai và sử dụng các dịch vụ hạ tầng mà không phải phụ thuộc vào Platform Team. Đồng thời, các tiêu chuẩn về bảo mật, giám sát hệ thống và quản trị cũng được tích hợp sẵn, giúp rút ngắn thời gian triển khai mà vẫn đảm bảo tuân thủ.</p>\n\n<h2 class="wp-block-heading" id="h-sai-lầm-3-xem-compliance-la-diểm-kiểm-tra-cuối-thay-vi-tich-hợp-ngay-từ-dầu"><span class="ez-toc-section" id="Sai_lam_3_Xem_Compliance_la_%E2%80%9Cdiem_kiem_tra_cuoi%E2%80%9D_thay_vi_tich_hop_ngay_tu_dau"></span><strong>Sai lầm 3: Xem Compliance là &#8220;điểm kiểm tra cuối&#8221; thay vì tích hợp ngay từ đầu</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Một nguyên nhân khác khiến nhiều dự án Cloud chậm tiến độ là doanh nghiệp vẫn xem compliance như một bước kiểm duyệt cuối cùng. Điều này khiến mỗi lần triển khai đều phải trải qua nhiều vòng kiểm tra thủ công, kéo dài thời gian đưa sản phẩm ra thị trường và làm giảm tốc độ đổi mới.</p>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p><em>“Các môi trường Cloud hiện đại không còn chỉ chọn một trong hai: tốc độ hoặc bảo mật. Khi các cơ chế quản trị được tích hợp ngay trong nền tảng, chúng sẽ trở thành hai năng lực bổ trợ và củng cố lẫn nhau.”</em> &#8211; anh Phúc Đặng chia sẻ.</p>\n\n</blockquote>\n\n<p>Thay vì xử lý compliance sau khi hoàn thành hệ thống, anh cho biết doanh nghiệp nên tích hợp các cơ chế quản trị ngay từ nền tảng thông qua mô hình Guardrails-as-Code. Khi các chính sách bảo mật, quy định và tiêu chuẩn được mã hóa và tự động thực thi trong pipeline CI/CD, hạ tầng sẽ trở thành &#8220;compliant by design&#8221;. Engineering Team có thể triển khai nhanh hơn mà vẫn duy trì khả năng kiểm soát cần thiết.</p>\n\n<p>Đây cũng là xu hướng được báo cáo nhấn mạnh khi quản trị Cloud ngày càng trở thành yếu tố quyết định khả năng khai thác giá trị lâu dài của Cloud.</p>\n\n<h2 class="wp-block-heading" id="h-sai-lầm-4-phụ-thuộc-vao-phe-duyệt-thủ-cong-dể-quản-trị-rủi-ro"><span class="ez-toc-section" id="Sai_lam_4_Phu_thuoc_vao_phe_duyet_thu_cong_de_quan_tri_rui_ro"></span><strong>Sai lầm 4: Phụ thuộc vào phê duyệt thủ công để quản trị rủi ro</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Không ít doanh nghiệp tin rằng càng nhiều bước phê duyệt thì hệ thống càng an toàn. Trên thực tế, báo cáo <strong><em>Make Cloud Your Advantage: From Digital Transformation to Breakthrough Performance</em></strong> cho thấy phần lớn sự cố bảo mật trên Cloud không đến từ nhà cung cấp dịch vụ mà xuất phát từ phía doanh nghiệp, đặc biệt là các lỗi cấu hình và quản trị. Điều đó đồng nghĩa việc bổ sung thêm quy trình thủ công chưa chắc giúp giảm rủi ro.</p>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p>Anh Phúc Đặng cho rằng: <em>“An toàn trong vận hành ngày càng phụ thuộc vào việc tự động hóa các cơ chế quản trị một cách liên tục, thay vì dựa vào các đợt kiểm soát thủ công.”</em></p>\n\n</blockquote>\n\n<p>Theo anh, các lần triển khai nhỏ, thường xuyên và được kiểm soát bằng cơ chế tự động thường an toàn hơn nhiều so với những đợt phát hành lớn dựa trên hàng loạt bước phê duyệt thủ công. Tại GoTymeX, automation được sử dụng để giảm thiểu lỗi do con người gây ra, đồng thời giúp phát hiện và xử lý vấn đề sớm hơn trong toàn bộ vòng đời phát triển phần mềm.</p>\n\n<h2 class="wp-block-heading" id="h-sai-lầm-5-dầu-tư-ai-nhưng-chưa-xay-dựng-nền-tảng-quản-trị-phu-hợp"><span class="ez-toc-section" id="Sai_lam_5_Dau_tu_AI_nhung_chua_xay_dung_nen_tang_quan_tri_phu_hop"></span><strong>Sai lầm 5: Đầu tư AI nhưng chưa xây dựng nền tảng quản trị phù hợp</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Cloud và AI đang ngày càng gắn kết chặt chẽ. Báo cáo <strong><em>Make Cloud Your Advantage: From Digital Transformation to Breakthrough Performance</em></strong> chỉ ra rằng AI sẽ tạo ra phần lớn giá trị kinh tế của Cloud trong những năm tới, đồng thời AI cũng được sử dụng để tối ưu chính môi trường Cloud thông qua tự động hóa, tối ưu chi phí và vận hành thông minh hơn. Tuy nhiên, AI không thể phát huy hiệu quả nếu thiếu nền tảng quản trị.</p>\n\n<p>Theo anh Phúc Đặng, tại GoTymeX, AI được sử dụng để hỗ trợ tối ưu kiến trúc hạ tầng, phân tích chi phí Cloud, kiểm tra cấu hình và hỗ trợ điều tra sự cố. Tuy nhiên, mọi quyết định cuối cùng vẫn thuộc về con người và toàn bộ quá trình đều được lưu vết để đảm bảo khả năng kiểm toán và tuân thủ.</p>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p><em>“Cũng như năng lực của mô hình AI, việc triển khai AI có trách nhiệm còn phụ thuộc vào mô hình quản trị và thiết kế vận hành.” &#8211; anh Phúc Đặng chia sẻ.</em></p>\n\n</blockquote>\n\n<p>Điều này phản ánh một nguyên tắc quan trọng: AI có thể tăng tốc quá trình ra quyết định, nhưng chỉ quản trị mới giúp doanh nghiệp mở rộng AI một cách an toàn và bền vững.</p>\n\n<h2 class="wp-block-heading" id="h-kết-luận"><span class="ez-toc-section" id="Ket_luan"></span><strong>Kết luận</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Theo những chia sẻ của anh Phúc Đặng, yếu tố quyết định nằm ở khả năng xây dựng mô hình vận hành phù hợp, thiết lập các cơ chế quản trị Cloud ngay từ đầu, phát triển năng lực Platform Engineering, FinOps và AI, đồng thời giúp các nhóm kỹ thuật có thể triển khai nhanh mà vẫn đảm bảo tính ổn định và tuân thủ. Cloud không còn là câu chuyện của hạ tầng. Cloud đang trở thành bài toán về tổ chức, con người và cách doanh nghiệp vận hành để liên tục tạo ra giá trị.</p>\n\n<p>Đó cũng là thông điệp xuyên suốt mà báo cáo <strong><em>Make Cloud Your Advantage: From Digital Transformation to Breakthrough Performance</em></strong> muốn gửi tới các nhà lãnh đạo công nghệ và doanh nghiệp: chuyển đổi Cloud chỉ thực sự thành công khi tổ chức đồng thời chuyển đổi mô hình vận hành của chính mình.</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'tin-tuc-upnext',
      metaTitle: 'Vì sao nhiều dự án Cloud vẫn thất bại dù doanh nghiệp đã đầu tư hàng triệu USD?',
      metaDescription:
        'Vì sao nhiều dự án Cloud chưa tạo ra giá trị? Khám phá những nguyên nhân phổ biến qua góc nhìn từ ông Phúc Đặng - Cloud Architect, GoTymeX.',
      viewCount: 18270,
      tags: ['Tin tức UpNext', 'Xu hướng công nghệ', 'Developer'],
    },
    {
      id: postSeedId(206),
      title: 'Power BI Template: Best practices làm báo cáo Power BI hiệu quả',
      slug: 'power-bi-template',
      imageUrl:
        'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 305,
      content:
        '<h1 class="page-title">Power BI Template: Best practices làm báo cáo Power BI hiệu quả</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/chuyen-mon-it/"><span>Chuyên môn IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<h2 class="wp-block-heading" id="h-power-bi-template-nbsp-pbit-co-lợi-ich-gi"><span class="ez-toc-section" id="Power_BI_template_pbit_co_loi_ich_gi"></span><strong>Power BI template&nbsp; (.pbit) có lợi ích gì?</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Việc dùng Power BI template mang lại các lợi ích:</p>\n\n<ul class="wp-block-list">\n<li>Tái sử dụng báo cáo: Power BI template giúp làm báo cáo nhanh và gọn hơn bằng cách tạo sẵn một mẫu báo cáo từ một file có trước. Khi dùng template, bạn đã có sẵn layout báo cáo, mô hình dữ liệu và các truy vấn. Mẫu này có thể được bạn hoặc người khác trong cùng tổ chức dùng lại như một điểm bắt đầu, thay vì phải làm mọi thứ từ đầu.</li>\n</ul>\n\n<ul class="wp-block-list">\n<li>Tối ưu dung lượng: File Power BI report template có dung lượng nhỏ hơn nhiều so với file Power BI Desktop report vì template không chứa dữ liệu thực tế, giúp hệ thống vận hành mượt mà, dễ dàng chia sẻ.</li>\n\n<li>Chuẩn hóa quy mô lớn: Tái sử dụng báo cáo cho nhiều bộ dữ liệu, giúp đồng nhất dashboard trong toàn doanh nghiệp.</li>\n\n<li>Bảo mật tối đa: Loại bỏ rủi ro lộ dữ liệu nhạy cảm khi cần chia sẻ cấu trúc báo cáo ra bên ngoài.</li>\n</ul>\n\n<h2 class="wp-block-heading" id="h-sử-dụng-power-bi-template-như-thế-nao"><span class="ez-toc-section" id="Su_dung_Power_BI_template_nhu_the_nao"></span><strong>Sử dụng Power BI template như thế nào?</strong><span class="ez-toc-section-end"></span></h2>\n\n<h3 class="wp-block-heading" id="h-tạo-power-bi-template"><strong>Tạo Power BI Template</strong></h3>\n\n<ul class="wp-block-list">\n<li>Để tạo một report template với Power BI Desktop, bạn chọn File → Export → Power BI template trên bảng menu.&nbsp;</li>\n\n<li>Power BI sẽ mở một cửa sổ yêu cầu bạn nhập mô tả cho template nhằm giúp người khác hiểu mục đích và cách sử dụng của file.</li>\n\n<li>Sau khi chọn OK, Power BI sẽ yêu cầu bạn chọn vị trí lưu file .pbit.</li>\n\n<li>Khi hoàn tất bước này, Power BI report template sẽ được tạo tại thư mục bạn đã chỉ định, với phần mở rộng .pbit.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-mở-va-sử-dụng-file-pbit-thế-nao"><strong>Mở và sử dụng file .pbit thế nào?</strong></h3>\n\n<p>Có hai cách để mở file .pbit:</p>\n\n<ul class="wp-block-list">\n<li>Duble-click trực tiếp vào file .pbit, Power BI Desktop sẽ tự động được mở và load template.</li>\n\n<li>Hoặc mở Power BI Desktop, sau đó chọn File → Import → Power BI template.</li>\n</ul>\n\n<p>Khi mở template, Power BI có thể hiển thị một hộp thoại yêu cầu bạn nhập giá trị cho các parameter đã được định nghĩa trong báo cáo gốc.&nbsp;</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</figure>\n\n<p>Sau khi nhập đầy đủ các parameter cần thiết, Power BI sẽ yêu cầu bạn chỉ định nguồn dữ liệu tương ứng với báo cáo. Tại bước này, người tạo báo cáo có thể kết nối dữ liệu dựa trên quyền truy cập và thông tin đăng nhập của mình.</p>\n\n<p>Khi parameter và nguồn dữ liệu đã được xác định, Power BI sẽ tạo ra một report mới <strong>ở định dạng .pbix</strong>. Report này chứa đầy đủ các trang báo cáo, biểu đồ, mô hình dữ liệu và Power Query giống với báo cáo gốc dùng để tạo template.</p>\n\n<p><strong>Chỉ khi file .pbit được mở và chuyển thành .pbix</strong>, bạn mới có thể chỉnh sửa report như một file Power BI thông thường, bao gồm chỉnh sửa dữ liệu, mô hình dữ liệu và giao diện.</p>\n\n<h2 class="wp-block-heading" id="h-kinh-nghiệm-tạo-powerbi-template-hiệu-quả"><span class="ez-toc-section" id="Kinh_nghiem_tao_PowerBI_template_hieu_qua"></span><strong>Kinh nghiệm tạo PowerBI template hiệu quả</strong><span class="ez-toc-section-end"></span></h2>\n\n<ul class="wp-block-list">\n<li><strong>Thiết kế data model ổn định trước khi tạo template</strong>: Template chỉ thực sự phát huy hiệu quả khi mô hình dữ liệu có tính ổn định cao. Trước khi xuất .pbit, cần đảm bảo schema dữ liệu đã được thống nhất, quan hệ bảng rõ ràng, không chồng chéo và tránh phụ thuộc vào cột hoặc bảng tạm thời. Một template được xây dựng trên mô hình dữ liệu thiếu ổn định sẽ rất khó tái sử dụng và thường phát sinh lỗi khi áp dụng cho nguồn dữ liệu mới.</li>\n\n<li><strong>Ưu tiên star schema trong mọi template</strong>: Star schema là mô hình được khuyến nghị mạnh mẽ trong Power BI vì nó giúp đơn giản hóa quan hệ dữ liệu, giảm độ phức tạp của DAX, giúp cải thiện hiệu năng truy vấn và dễ mở rộng, bảo trì. Khi xây dựng template, các bảng fact và dimension nên được phân tách rõ ràng, tránh thiết kế snowflake hoặc many-to-many nếu không thực sự cần thiết.</li>\n\n<li><strong>Tách biệt rõ các tầng dữ liệu &#8211; mô hình &#8211; báo cáo</strong>: Một Power BI Template tốt nên phản ánh rõ kiến trúc ba tầng:\n\n<ul class="wp-block-list">\n<li>Data layer: Power Query, làm sạch và chuẩn hóa dữ liệu</li>\n\n<li>Semantic layer: Data model và DAX</li>\n\n<li>Report layer<strong>:</strong> Visual và layout</li>\n</ul>\n\n</li>\n</ul>\n\n<ul class="wp-block-list">\n<li><strong>Sử dụng parameter thay cho giá trị hard-code</strong>: Các giá trị như đường dẫn file, server name, database name, thời gian báo cáo và mã chi nhánh không nên được ghi cứng trong Power Query. Thay vào đó, nên sử dụng Power BI Parameters để tăng tính linh hoạt cho template và giảm phụ thuộc môi trường.</li>\n\n<li><strong>Chuẩn hóa cách đặt tên bảng, cột và measure:</strong> Một template tốt cần có naming convention rõ ràng như:\n\n<ul class="wp-block-list">\n<li>Bảng dimension bắt đầu bằng Dim_</li>\n\n<li>Bảng fact bắt đầu bằng Fact_</li>\n\n<li>Measure đặt trong bảng riêng như Measures</li>\n\n<li>Tên measure phản ánh ý nghĩa nghiệp vụ, không mô tả kỹ thuật</li>\n</ul>\n\n</li>\n</ul>\n\n<p>Việc chuẩn hóa này giúp người dùng mới dễ tiếp cận và hạn chế hiểu nhầm logic phân tích.</p>\n\n<h2 class="wp-block-heading" id="h-cau-hỏi-thường-gặp-về-power-bi-template"><span class="ez-toc-section" id="Cau_hoi_thuong_gap_ve_Power_BI_Template"></span><strong>Câu hỏi thường gặp về Power BI Template</strong><span class="ez-toc-section-end"></span></h2>\n\n<h3 class="wp-block-heading" id="h-power-bi-report-template-pbit-dung-dể-lam-gi"><strong>Power BI report template (.pbit) dùng để làm gì?</strong></h3>\n\n<p>Power BI report template được dùng để chia sẻ và tái sử dụng cấu trúc báo cáo, bao gồm layout, mô hình dữ liệu và Power Query, mà không kèm dữ liệu thực tế.</p>\n\n<h3 class="wp-block-heading" id="h-file-pbit-co-chứa-dữ-liệu-khong"><strong>File .pbit có chứa dữ liệu không?</strong></h3>\n\n<p>Không. File .pbit không chứa dữ liệu thật hay cache dữ liệu. File này chỉ lưu lại cấu trúc và logic của báo cáo.</p>\n\n<h3 class="wp-block-heading" id="h-power-bi-template-co-lưu-thong-tin-dang-nhập-dữ-liệu-khong"><strong>Power BI template có lưu thông tin đăng nhập dữ liệu không?</strong></h3>\n\n<p>Không. File .pbit không lưu thông tin đăng nhập như username, password hay token. Người dùng phải nhập lại thông tin kết nối khi mở template.</p>\n\n<h3 class="wp-block-heading" id="h-template-co-giữ-lại-power-query-va-dax-khong"><strong>Template có giữ lại Power Query và DAX không?</strong></h3>\n\n<p>Có. File .pbit giữ lại toàn bộ Power Query, các bước transform dữ liệu, measure, calculated column và công thức DAX.</p>\n\n<h3 class="wp-block-heading" id="h-khi-nao-nen-dung-pbit-thay-vi-pbix"><strong>Khi nào nên dùng .pbit thay vì .pbix?</strong></h3>\n\n<p>Nên dùng .pbit khi bạn muốn chia sẻ cấu trúc cho nhiều người hoặc nhiều bộ dữ liệu khác nhau, và tránh chia sẻ dữ liệu nhạy cảm.</p>\n\n<h3 class="wp-block-heading" id="h-toi-co-thể-tạo-file-pbit-từ-file-pbix-khong"><strong>Tôi có thể tạo file .pbit từ file .pbix không?</strong></h3>\n\n<p>Có. Bạn có thể tạo file .pbit bằng cách chọn File → Export → Power BI template trong Power BI Desktop.</p>\n\n<p id="h-toi-co-thể-tải-power-bi-template-ở-dau-bạn-co-thể-tham-khảo-va-tải-cac-mẫu-bao-cao-power-bi-từ-cộng-dồng-chinh-thức-của-microsoft-tại-trang-data-stories-gallery-trang-nay-tập-hợp-rất-nhiều-bao-cao-thực-tế-do-cộng-dồng-chia-sẻ-phu-hợp-dể-học-layout-cach-kể-chuyện-bằng-dữ-liệu-va-thiết-kế-dashboard"><strong>Tôi có thể tải Power BI template ở đâu?<br></strong>Bạn có thể tham khảo và tải các mẫu báo cáo Power BI từ cộng đồng chính thức của Microsoft tại trang <a href="https://community.fabric.microsoft.com/t5/Data-Stories-Gallery/bd-p/DataStoriesGallery" target="_blank" rel="noreferrer noopener">Data Stories Gallery</a>. Trang này tập hợp rất nhiều báo cáo thực tế do cộng đồng chia sẻ, phù hợp để học layout, cách kể chuyện bằng dữ liệu và thiết kế dashboard.</p>\n\n<p>Điểm cần lưu ý là các báo cáo trên trang này được chia sẻ dưới dạng file .pbix, không phải .pbit. Điều này có nghĩa là khi tải về, bạn sẽ nhận được một file Power BI report hoàn chỉnh, có thể mở, chỉnh sửa và phân tích trực tiếp trong Power BI Desktop.</p>\n\n<h2 class="wp-block-heading" id="h-tổng-kết"><span class="ez-toc-section" id="Tong_ket"></span><strong>Tổng kết</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Power BI Template (.pbit) không phải là file báo cáo hoàn chỉnh, nó đơn thuần là file định nghĩa logic, cấu trúc báo cáo. Khi được xây dựng dựa trên mô hình dữ liệu ổn định và tuân thủ các best practices, Power BI Template giúp doanh nghiệp và chuyên gia dữ liệu chuẩn hóa logic phân tích, giảm chi phí phát triển báo cáo và hạn chế rủi ro sai lệch số liệu giữa các phòng ban.</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Power BI Template: Best practices làm báo cáo Power BI hiệu quả',
      metaDescription:
        'Tìm hiểu Power BI Template (.pbit) là gì, cách hoạt động, cấu trúc, các loại template phổ biến và best practices xây dựng báo cáo Power BI.',
      viewCount: 6198,
      tags: ['Backend & Architecture', 'AI & Data', 'Cloud & AWS'],
    },
    {
      id: postSeedId(207),
      title:
        'BUILD YOU THEN BUILD IMPACT: Định hướng cam kết của UpNext trong việc xây dựng Chất riêng sự nghiệp và tạo Dấu ấn công nghệ lớn hơn tại Việt Nam',
      slug: 'itviec-build-you-then-build-impact-ban-tieng-viet',
      imageUrl:
        'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 24,
      content:
        '<h1 class="page-title">BUILD YOU THEN BUILD IMPACT: Định hướng cam kết của UpNext trong việc xây dựng Chất riêng sự nghiệp và tạo Dấu ấn công nghệ lớn hơn tại Việt Nam</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/danh-cho-nha-tuyen-dung-it/"><span>Dành cho Nhà tuyển dụng IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Vuot_ra_ngoai_Ky_nang_hay_Quy_mo_doi_nhom_huong_toi_Chat_rieng_su_nghiep_va_Dau_an_cong_nghe" >Vượt ra ngoài Kỹ năng hay Quy mô đội nhóm, hướng tới Chất riêng sự nghiệp và Dấu ấn công nghệ</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#Cam_ket_cua_UpNext_trong_viec_tao_dau_an_lon_hon_voi_nen_tang_su_nghiep_cong_nghe" >Cam kết của UpNext trong việc tạo dấu ấn lớn hơn với nền tảng sự nghiệp công nghệ</a></li></ul>\n\n</nav></div>\n\n<p class="has-text-align-right"><em><a href="https://UpNext.com/blog/UpNext-build-you-then-build-impact" target="_blank" rel="noreferrer noopener">Read the English version here</a></em></p>\n\n<p>Trong nhiều năm, thành công trong sự nghiệp công nghệ thường được đo bằng những cột mốc quen thuộc: mức lương cao hơn, chức danh cao cấp hơn, hay quy mô đội nhóm lớn hơn.</p>\n\n<p>Những thước đo đó vẫn quan trọng. Tuy nhiên, trong một thế giới nơi AI đang nhanh chóng tái định hình cách chúng ta làm việc và công nghệ phát triển với tốc độ chưa từng thấy, chỉ vậy thôi là chưa đủ.</p>\n\n<p>Ngày nay, thành công bền vững trong ngành công nghệ không chỉ nằm ở việc <strong><em><mark  class="has-inline-color has-palette-color-9-color">bạn làm gì</mark></em></strong>, mà còn ở việc <strong><em><mark  class="has-inline-color has-palette-color-9-color">bạn là ai &#8211; và dấu ấn bạn tạo ra thông qua công nghệ</mark></em></strong>.</p>\n\n<p>Đây chính là sự chuyển dịch đang diễn ra: vượt ra ngoài kỹ năng và quy mô đội nhóm, hướng tới những danh tính công nghệ mở rộng và dấu ấn lớn hơn.</p>\n\n<h2><span class="ez-toc-section" id="Vuot_ra_ngoai_Ky_nang_hay_Quy_mo_doi_nhom_huong_toi_Chat_rieng_su_nghiep_va_Dau_an_cong_nghe"></span><strong><strong>Vượt ra ngoài Kỹ năng hay Quy mô đội nhóm, hướng tới Chất riêng sự nghiệp và Dấu ấn công nghệ</strong></strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Developer, Engineer, Tester, Data Analyst, Product Owner, Designer &#8211; những chức danh này phản ánh kỹ năng thật, nỗ lực thật và những hành trình nghề nghiệp rất thật.<br>Tuy nhiên, chỉ riêng chúng vẫn chưa thể phản ánh đầy đủ cách con người tạo ra giá trị trong thế giới công nghệ ngày nay.</p>\n\n<p><em><em>UpNext tin rằng, đằng sau mỗi vai trò còn là chất riêng sự nghiệp. Đó là:</em></em></p>\n\n<ul class="wp-block-list">\n<li><em><strong><em>Builder</em></strong><em> – những người biến ý tưởng thành hiện thực</em></em></li>\n\n<li><em><strong><em>Architect</em></strong><em> – những người kiến trúc sư thiết kế hệ thống ổn định và mở rộng</em></em></li>\n\n<li><em><strong><em>Connector</em></strong><em> – những người kết nối con người và công nghệ</em></em></li>\n\n<li><em><strong><em>Enabler</em></strong><em> – những người giúp đội ngũ và tổ chức tiến về phía trước</em></em></li>\n</ul>\n\n<ul class="wp-block-list"></ul>\n\n<p>Trong một thế giới công nghệ vận hành mạnh mẽ với AI, những chất riêng này không chỉ là chức danh công việc mà trở thành nền tảng để cá nhân phát triển, đội ngũ đồng bộ và doanh nghiệp tạo ra dấu ấn ảnh hưởng bền vững, có ý nghĩa trong dài hạn.</p>\n\n<p><em><em>Với doanh nghiệp:</em></em></p>\n\n<ul class="wp-block-list">\n<li><em>Tăng trưởng không còn là cuộc đua tuyển thật nhiều người.</em></li>\n\n<li><em>Tăng trưởng là xây dựng những đội ngũ linh hoạt, mở rộng mạng lưới, nuôi dưỡng khả năng kết nối giữa “kỹ năng chuyên môn” và “kỹ năng mềm” &#8211; giữa con người và công nghệ.</em></li>\n</ul>\n\n<p>Đây cũng chính là bức tranh ngành công nghệ của hiện tại: rộng lớn, phức tạp và kết nối với nhau một cách sâu sắc.&nbsp;</p>\n\n<p>Nhân tài công nghệ ngày càng chịu nhiều áp lực hơn trong việc thích nghi, phát triển năng lực và duy trì tính cạnh tranh. Doanh nghiệp đối mặt với kỳ vọng ngày càng cao trong việc xây dựng đội ngũ vững vàng, đồng thời vẫn đảm bảo tốc độ và chất lượng.</p>\n\n<p>Trước mức độ phức tạp ngày càng tăng, việc điều hướng hiệu quả đòi hỏi sự kết nối và đồng hành chặt chẽ hơn giữa các bên trong hệ sinh thái.</p>\n\n<h2><span class="ez-toc-section" id="Cam_ket_cua_UpNext_trong_viec_tao_dau_an_lon_hon_voi_nen_tang_su_nghiep_cong_nghe"></span><strong><strong>Cam kết của UpNext trong việc tạo dấu ấn lớn hơn với nền tảng sự nghiệp công nghệ</strong></strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Từ những ngày đầu thành lập, UpNext đã là một nền tảng tuyển dụng chuyên biệt cho ngành công nghệ tại Việt Nam, tập trung vào chất lượng kết nối, insight đáng tin cậy và sự thấu hiểu sâu sắc thị trường IT.</p>\n\n<p>Với định hướng thương hiệu mới “Build You Then Build Impact”, UpNext tái khẳng định cam kết dài hạn trong việc phát triển hệ sinh thái sự nghiệp và tuyển dụng bền vững, song hành cùng sự thay đổi của thị trường, thông qua việc:</p>\n\n<ul class="wp-block-list">\n<li>Hỗ trợ nhân tài công nghệ xây dựng và thể hiện bản thân rõ nét hơn theo thời gian</li>\n\n<li>Kết nối nhân tài công nghệ chất lượng cao với doanh nghiệp thông qua hệ sinh thái sự nghiệp thông minh, lấy con người làm trung tâm</li>\n\n<li>Đồng hành cùng doanh nghiệp trong việc định hình thương hiệu tuyển dụng chân thực, giúp tạo ảnh hưởng dài hạn bằng cách thu hút đúng người, đúng thời điểm</li>\n</ul>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p><em><em>“Build You Then Build Impact không chỉ là một thông điệp, mà là định hướng chúng tôi cam kết theo đuổi,” </em><strong><em>ông Naoto Iijima, Tổng Giám Đốc của UpNext, chia sẻ</em></strong><em>. “UpNext cam kết đồng hành cùng nhân tài công nghệ trong việc xây dựng chất riêng sự nghiệp vượt ra ngoài chức danh hay kỹ năng, đồng thời giúp doanh nghiệp tạo ra dấu ấn ảnh hưởng mà họ mong muốn với nhân tài phù hợp nhất. Khi danh tính sự nghiệp được củng cố và mở rộng, dấu ấn công nghệ có ý nghĩa sẽ được tích lũy và lan tỏa ở quy mô lớn hơn.”</em></em></p>\n\n</blockquote>\n\n<p>Niềm tin này được thể hiện trọn vẹn trong video thương hiệu mới nhất của UpNext với định hướng mới: <strong><mark  class="has-inline-color has-palette-color-9-color">Build You Then Build Impact</mark></strong><em>.</em></p>\n\n<p>UpNext trân trọng mời cộng đồng nhân tài công nghệ và các doanh nghiệp cùng xem video và bắt đầu hành trình xây dựng Chất riêng sự nghiệp &#8211; Dấu ấn công nghệ đầy ý nghĩa cùng nhau.</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n<h3 class="wp-block-heading" id="h-kham-pha-hệ-sinh-thai-sự-nghiệp-cong-nghệ-của-UpNext">👉 <strong>Khám phá hệ sinh thái sự nghiệp công nghệ của UpNext:</strong></h3>\n\n<p>🔗 UpNext.com: <a href="https://UpNext.com" target="_blank" rel="noreferrer noopener">https://UpNext.com</a><br>🔗 UpNext Story Hub: <a href="https://UpNext.com/story-hub" target="_blank" rel="noreferrer noopener">https://UpNext.com/story-hub</a><br>🔗 UpNext Blog: <a href="https://UpNext.com/blog" target="_blank" rel="noreferrer noopener">https://UpNext.com/blog</a><br>🔗 UpNext CV Template: <a href="https://UpNext.com/cv-templates-introduction" target="_blank" rel="noreferrer noopener">https://UpNext.com/cv-templates-introduction</a><br>🔗 AI, Data Segment: <a href="https://UpNext.com/segments/viec-lam-ai-data" target="_blank" rel="noreferrer noopener">https://UpNext.com/segments/viec-lam-ai-data</a></p>\n\n<h3 class="wp-block-heading" id="h-theo-doi-UpNext-tren-cac-nền-tảng">👉 <strong>Theo dõi UpNext trên các nền tảng:</strong></h3>\n\n<p>🔗 YouTube: <a href="https://www.youtube.com/UpNext" target="_blank" rel="noreferrer noopener">https://www.youtube.com/UpNext</a><br>🔗 Facebook: <a href="https://www.facebook.com/UpNext" target="_blank" rel="noreferrer noopener">https://www.facebook.com/UpNext</a><br>🔗 LinkedIn: <a href="https://www.linkedin.com/company/UpNext" target="_blank" rel="noreferrer noopener">https://www.linkedin.com/company/UpNext</a><br>🔗 TikTok: <a href="https://www.tiktok.com/@UpNext.official" target="_blank" rel="noreferrer noopener">https://www.tiktok.com/@UpNext.official</a><br>🔗 Threads: <a href="https://www.threads.com/@UpNext.official" target="_blank" rel="noreferrer noopener">https://www.threads.com/@UpNext.official</a></p>\n\n<p class="has-text-align-right"><strong>UpNext | Build You Then Build Impact</strong></p>\n\n<p></p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle:
        'BUILD YOU THEN BUILD IMPACT: Định hướng cam kết của ITviec trong việc xây dựng Chất riêng sự nghiệp và tạo Dấu ấn công nghệ lớn hơn tại Việt Nam',
      metaDescription:
        'Với định hướng thương hiệu mới “Build You Then Build Impact”, UpNext tái khẳng định cam kết dài hạn trong việc phát triển hệ sinh thái sự nghiệp bền vững, song hành cùng sự thay đổi của thị trường',
      viewCount: 31540,
      tags: ['Career Path', 'Developer', 'Phỏng vấn IT'],
    },
    {
      id: postSeedId(208),
      title: 'Học Power BI hiệu quả: Lộ trình và tài liệu phù hợp cho người mới',
      slug: 'lo-trinh-hoc-power-bi',
      imageUrl:
        'https://images.unsplash.com/photo-1523966211575-eb4a01e7dd51?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 174,
      content:
        '<h1 class="page-title">Học Power BI hiệu quả: Lộ trình và tài liệu phù hợp cho người mới</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/chuyen-mon-it/"><span>Chuyên môn IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Vi_sao_nen_hoc_Power_BI" >Vì sao nên học Power BI?</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#Can_chuan_bi_gi_truoc_khi_hoc_Power_BI" >Cần chuẩn bị gì trước khi học Power BI?</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-3" href="#Lo_trinh_hoc_Power_BI_tu_co_ban_den_nang_cao" >Lộ trình học Power BI từ cơ bản đến nâng cao</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-4" href="#Loi_khuyen_de_hoc_Power_BI_hieu_qua" >Lời khuyên để học Power BI hiệu quả</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-5" href="#Cac_cau_hoi_thuong_gap_ve_hoc_Power_BI" >Các câu hỏi thường gặp về học Power BI</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-6" href="#Ket_luan" >Kết luận</a></li></ul>\n\n</nav></div>\n\n</blockquote>\n\n<h2 class="wp-block-heading" id="h-cần-chuẩn-bị-gi-trước-khi-học-power-bi"><span class="ez-toc-section" id="Can_chuan_bi_gi_truoc_khi_hoc_Power_BI"></span><strong>Cần chuẩn bị gì trước khi học Power BI?</strong><span class="ez-toc-section-end"></span></h2>\n\n</blockquote>\n\n<h3 class="wp-block-heading" id="h-giai-doạn-2-cac-chủ-dề-power-bi-trung-cấp"><strong>Giai đoạn 2: Các chủ đề Power BI trung cấp</strong></h3>\n\n</blockquote>\n\n<h3 class="wp-block-heading" id="h-học-power-bi-co-kho-dối-với-người-mới-khong"><strong>Học Power BI có khó đối với người mới không?</strong></h3>\n\n<p>Học Power BI không quá khó đối với người mới nếu bạn có nền tảng Excel cơ bản và tư duy làm việc với dữ liệu. Công cụ này có giao diện trực quan, nhiều tính năng kéo-thả nên người bắt đầu có thể tạo báo cáo đơn giản chỉ sau thời gian ngắn làm quen. Tuy nhiên, để học Power BI nâng cao như viết DAX hay xây dựng mô hình dữ liệu tối ưu, bạn cần luyện tập thường xuyên và đi theo lộ trình rõ ràng.</p>\n\n<h3 class="wp-block-heading" id="h-mất-bao-lau-dể-học-power-bi"><strong>Mất bao lâu để học Power BI?</strong></h3>\n\n<p>Học Power BI mất bao lâu phụ thuộc vào mức độ kỹ năng bạn muốn đạt được và thời gian bạn dành ra để học, nhưng nhìn chung nhiều chuyên gia ước tính bạn có thể làm chủ các tính năng cơ bản trong khoảng 1–2 tháng với việc học đều đặn. Trong vài tuần đầu, bạn có thể tự tin tạo báo cáo, trực quan hóa dữ liệu và hiểu các công cụ chính, nhưng để thành thạo các kỹ thuật nâng cao như DAX và mô hình dữ liệu có thể cần thêm thời gian và luyện tập.</p>\n\n<p>Vì vậy, nếu bạn học đều đặn mỗi tuần, khoảng 1–2 tháng là một mốc hợp lý để cảm thấy vững vàng với Power BI trong công việc.</p>\n\n<h3 class="wp-block-heading" id="h-học-power-bi-co-thể-lam-những-vị-tri-nao"><strong>Học Power BI có thể làm những vị trí nào?</strong></h3>\n\n<p>Khi lựa chọn học Power BI, bạn đang hướng đến nhóm công việc liên quan trực tiếp đến phân tích dữ liệu và Business Intelligence – những lĩnh vực đang có nhu cầu tuyển dụng cao trên thị trường. Theo tổng hợp từ DataCamp và Dataquest, Power BI không chỉ dành cho Data Analyst mà còn xuất hiện trong nhiều vai trò như:</p>\n\n<ul class="wp-block-list">\n<li>Power BI Analyst: Xây dựng dashboard, báo cáo tương tác, phân tích dữ liệu từ nhiều nguồn và hỗ trợ phòng ban ra quyết định.</li>\n\n<li>Business Intelligence (BI) Analyst: Khai thác dữ liệu để tìm insight, đề xuất chiến lược kinh doanh dựa trên hệ thống báo cáo trực quan.</li>\n\n<li>Data Analyst: Làm sạch dữ liệu, phân tích xu hướng và sử dụng Power BI để trình bày kết quả một cách trực quan, dễ hiểu.</li>\n\n<li>Power BI Developer: Xây dựng kiến trúc dữ liệu, phát triển mô hình dữ liệu, viết DAX nâng cao, quản trị Fabric/Workspace, tối ưu hiệu suất và triển khai hệ thống BI cho doanh nghiệp.</li>\n\n<li>Data Visualization Specialist: Tập trung thiết kế báo cáo và dashboard có tính thẩm mỹ, tối ưu trải nghiệm người dùng.</li>\n\n<li>Power BI Consultant: Tư vấn triển khai, tích hợp và tối ưu giải pháp Power BI cho tổ chức.</li>\n</ul>\n\n<p>Những vị trí này cho thấy việc học Power BI không chỉ phù hợp với dân kỹ thuật mà còn hữu ích cho các ngành như tài chính, marketing, vận hành và quản trị doanh nghiệp.</p>\n\n<h2 class="wp-block-heading" id="h-kết-luận"><span class="ez-toc-section" id="Ket_luan"></span><strong>Kết luận</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Trong môi trường làm việc ngày càng dựa trên số liệu, học Power BI là một cách thiết thực để nâng cấp kỹ năng và mở rộng cơ hội nghề nghiệp. Khi biết cách khai thác và trình bày dữ liệu hiệu quả, bạn không chỉ làm việc nhanh hơn mà còn tạo được giá trị rõ ràng trong tổ chức. Nếu đầu tư nghiêm túc và học đúng hướng, Power BI hoàn toàn có thể trở thành một lợi thế dài hạn trong hành trình phát triển của bạn.</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Học Power BI hiệu quả: Lộ trình và tài liệu phù hợp cho người mới',
      metaDescription:
        'Khám phá chi tiết lộ trình học Power BI, cách học hiệu quả, tài liệu tổng quan và những sai lầm khi học Power BI cần tránh cho người mới.',
      viewCount: 5614,
      tags: ['Backend & Architecture', 'AI & Data', 'Cloud & AWS'],
    },
    {
      id: postSeedId(209),
      title:
        'BUILD YOU THEN BUILD IMPACT: UpNext’s committed direction to help build broader Tech Identities and Tech Impact in Vietnam',
      slug: 'itviec-build-you-then-build-impact',
      imageUrl:
        'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 61,
      content:
        '<h1 class="page-title">BUILD YOU THEN BUILD IMPACT: UpNext’s committed direction to help build broader Tech Identities and Tech Impact in Vietnam</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/danh-cho-nha-tuyen-dung-it/"><span>Dành cho Nhà tuyển dụng IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Beyond_Skills_and_Team_Size_toward_Tech_Identities_and_Tech_Impact" >Beyond Skills and Team Size, toward Tech Identities and Tech Impact</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#UpNexts_commitment_to_build_bigger_impact_in_tech_career_ecosystem" >UpNext’s commitment to build bigger impact in tech career ecosystem</a></li></ul>\n\n</nav></div>\n\n<p class="has-text-align-right"><em><a href="https://UpNext.com/blog/UpNext-build-you-then-build-impact-ban-tieng-viet" target="_blank" rel="noreferrer noopener">Đọc bản tiếng Việt tại đây</a></em></p>\n\n<p>For many years, success in tech careers was often measured by familiar milestones: higher salary, more senior title, or bigger team size.</p>\n\n<p>Those markers still matter. But in a world where AI is rapidly reshaping how we work and technology evolves at unprecedented speed, they are no longer enough.</p>\n\n<p>Today, sustainable success in tech is not only about <strong><em><mark class="has-inline-color has-palette-color-9-color" >what you do</mark></em></strong>, but also <strong><em><mark class="has-inline-color has-palette-color-9-color" >who you are &#8211; and the impact you create with technology</mark></em></strong>.</p>\n\n<h2><span class="ez-toc-section" id="Beyond_Skills_and_Team_Size_toward_Tech_Identities_and_Tech_Impact"></span><strong>Beyond Skills and Team Size, toward Tech Identities and Tech Impact</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Developers, Engineers, Testers, Data Analysts, Product Owners, Designers &#8211; these titles reflect real skills, real effort, and real journeys. But they do not fully capture how people create value in today’s tech world.</p>\n\n<p><em>UpNext believes that behind every role, there is a unique tech identity, they are:</em></p>\n\n<ul class="wp-block-list">\n<li><strong><em>Builders</em></strong><em> &#8211; who turn ideas into reality.</em></li>\n\n<li><strong><em>Architects</em></strong><em> &#8211; who design systems that scale.</em></li>\n\n<li><strong><em>Connectors</em></strong><em> &#8211; who bridge people and technology.</em></li>\n\n<li><strong><em>Enablers</em></strong><em> &#8211; who help teams and organizations move forward.</em></li>\n</ul>\n\n<p>In an AI-powered tech world, these identities are not just job titles. They become the foundation upon which individuals can grow, teams can align, and businesses can create meaningful, long-term tech impact.</p>\n\n<p><em>For companies:</em></p>\n\n<ul class="wp-block-list">\n<li><em>Growth is not a race to hire more.&nbsp;</em></li>\n\n<li><em>Growth is about building flexible teams, expanding networks, and cultivating skills that connect the hard with the soft, the human with tech.</em></li>\n</ul>\n\n<p>This is also today’s tech landscape: vast, complex, and deeply connected.&nbsp;</p>\n\n<p>Tech talent faces increasing pressure to adapt, develop specialty, and stay competitive. Companies face rising expectations to build resilient teams while maintaining speed and quality.</p>\n\n<p>As the level of complexity continues to increase, navigating today’s IT landscape effectively requires closer connection and stronger collaboration across multiple sides of the ecosystem.</p>\n\n<h2><span class="ez-toc-section" id="UpNexts_commitment_to_build_bigger_impact_in_tech_career_ecosystem"></span><strong>UpNext’s commitment to build bigger impact in tech career ecosystem</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Since its founding, UpNext has been built as a tech-focused job platform, centered on quality matching, trusted insights, and deep understanding of the IT market.</p>\n\n<p>With the new brand tagline “Build You Then Build Impact”, UpNext reaffirms its long-term commitment to the sustainable growth of tech career and hiring ecosystem, alongside the evolving tech market needs by:</p>\n\n<ul class="wp-block-list">\n<li>Helping tech professionals build and express broader Tech Identities over time</li>\n\n<li>Connecting high-quality tech talent and companies through a smart, human-centered career ecosystem</li>\n\n<li>Supporting companies in articulating authentic tech employer brands that sustain long-term impact by attracting the right talent</li>\n</ul>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p><em>“Build You Then Build Impact is not just a message — it is the direction we are committing to,” </em><strong><em>said Mr. Naoto Iijima, General Director of UpNext. </em></strong><em>“UpNext is committed to helping tech professionals build who they are beyond titles or skills, and helping companies build the kind of impact they want to create in their businesses, together with the right talent. When tech identities are strong and broadened, meaningful tech impact will be accumulated at scale.”</em></p>\n\n</blockquote>\n\n<p>This belief lies at the heart of UpNext’s latest brand film launched with the new tagline: <strong><mark class="has-inline-color has-palette-color-9-color" >Build You Then Build Impact</mark>.</strong></p>\n\n<p>UpNext warmly invites tech professionals and companies to watch the brand film and begin building meaningful Tech Identity &#8211; Tech Impact together.</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n<h3 class="wp-block-heading" id="h-explore-tech-career-and-hiring-platforms-from-UpNext">👉 Explore tech career and hiring platforms from UpNext<strong>:</strong></h3>\n\n<p>🔗 UpNext.com: <a href="https://UpNext.com" target="_blank" rel="noreferrer noopener">https://UpNext.com</a><br>🔗 UpNext Story Hub: <a href="https://UpNext.com/story-hub" target="_blank" rel="noreferrer noopener">https://UpNext.com/story-hub</a><br>🔗 UpNext Blog: <a href="https://UpNext.com/blog" target="_blank" rel="noreferrer noopener">https://UpNext.com/blog</a><br>🔗 UpNext CV Template: <a href="https://UpNext.com/cv-templates-introduction" target="_blank" rel="noreferrer noopener">https://UpNext.com/cv-templates-introduction</a><br>🔗 AI, Data Segment: <a href="https://UpNext.com/segments/viec-lam-ai-data" target="_blank" rel="noreferrer noopener">https://UpNext.com/segments/viec-lam-ai-data</a></p>\n\n<h3 class="wp-block-heading" id="h-connect-with-us-on-social">👉 <strong>Connect with us on social:</strong></h3>\n\n<p>🔗 YouTube: <a href="https://www.youtube.com/UpNext" target="_blank" rel="noreferrer noopener">https://www.youtube.com/UpNext</a><br>🔗 Facebook: <a href="https://www.facebook.com/UpNext" target="_blank" rel="noreferrer noopener">https://www.facebook.com/UpNext</a><br>🔗 LinkedIn: <a href="https://www.linkedin.com/company/UpNext" target="_blank" rel="noreferrer noopener">https://www.linkedin.com/company/UpNext</a><br>🔗 TikTok: <a href="https://www.tiktok.com/@UpNext.official" target="_blank" rel="noreferrer noopener">https://www.tiktok.com/@UpNext.official</a><br>🔗 Threads: <a href="https://www.threads.com/@UpNext.official" target="_blank" rel="noreferrer noopener">https://www.threads.com/@UpNext.official</a></p>\n\n<p class="has-text-align-right"><strong>UpNext | Build You Then Build Impact</strong></p>\n\n<p>&nbsp;</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle:
        'BUILD YOU THEN BUILD IMPACT: ITviec’s committed direction to help build broader Tech Identities and Tech Impact in Vietnam',
      metaDescription:
        'With the new brand tagline “Build You Then Build Impact”, UpNext reaffirms its long-term commitment to the sustainable growth of tech career ecosystem, alongside the evolving tech market needs',
      viewCount: 12489,
      tags: ['Career Path', 'Developer', 'Phỏng vấn IT'],
    },
    {
      id: postSeedId(210),
      title: 'Tổng hợp 20+ tài liệu Power BI từ cơ bản đến nâng cao',
      slug: 'tai-lieu-power-bi',
      imageUrl:
        'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 346,
      content:
        '<h1 class="page-title">Tổng hợp 20+ tài liệu Power BI từ cơ bản đến nâng cao</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/chuyen-mon-it/"><span>Chuyên môn IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Power_BI_la_gi_Lam_the_nao_de_tim_tai_lieu_Power_BI_hieu_qua" >Power BI là gì? Làm thế nào để tìm tài liệu Power BI hiệu quả?</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#Cac_tai_lieu_Power_BI_chinh_thuc_tu_Microsoft" >Các tài liệu Power BI chính thức từ Microsoft</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-3" href="#Cac_tai_lieu_khoa_hoc_Power_BI_co_tra_phi" >Các tài liệu &amp; khóa học Power BI có trả phí</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-4" href="#Cac_tai_lieu_Power_BI_dang_sach_e-book" >Các tài liệu Power BI dạng sách &amp; e-book</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-5" href="#Tai_lieu_Power_BI_dang_video_Youtube" >Tài liệu Power BI dạng video Youtube</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-6" href="#Tai_lieu_Power_BI_dang_BlogWebsite" >Tài liệu Power BI dạng Blog/Website</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-7" href="#Tai_lieu_Power_BI_tu_CommunityForum" >Tài liệu Power BI từ Community/Forum</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-8" href="#Cac_cau_hoi_thuong_gap_ve_tai_lieu_Power_BI" >Các câu hỏi thường gặp về tài liệu Power BI</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-9" href="#Ket_luan" >Kết luận</a></li></ul>\n\n</nav></div>\n\n</blockquote>\n\n<h3 class="wp-block-heading" id="h-cach-tim-tai-liệu-power-bi-hiệu-quả"><strong>Cách tìm tài liệu Power BI hiệu quả</strong></h3>\n\n<p>Nhiều người khi bắt đầu học thường tải rất nhiều tài liệu nhưng không biết nên học từ đâu. Cách tốt nhất là bạn dựa trên những thành phần chính của Power BI và các năng lực cốt lõi mà Power BI yêu cầu trong thực tế công việc để tìm tài liệu phù hợp.</p>\n\n<p>Trước hết, bạn cần hiểu các thành phần chính trong hệ sinh thái Power BI, vì đây là nền tảng để xác định mình đang học phần nào của quy trình. Trong hệ sinh thái Power BI, có một số thành phần chính thường được sử dụng trong quá trình xây dựng và chia sẻ báo cáo:</p>\n\n<ul class="wp-block-list">\n<li>Power BI Desktop: Ứng dụng cài trên máy tính giúp kết nối dữ liệu, xử lý và mô hình hóa dữ liệu cũng như tạo các báo cáo và biểu đồ tương tác.</li>\n\n<li>Power BI Service: Dịch vụ trực tuyến trên nền tảng web nơi người dùng có thể lưu trữ, chia sẻ và cộng tác trên các báo cáo và dashboard.</li>\n\n<li>Power BI Mobile: Ứng dụng dành cho thiết bị di động giúp truy cập và xem báo cáo bất cứ khi nào.</li>\n\n<li>Ngoài ra, bộ Power BI còn tích hợp các công cụ như Power Query để làm sạch và chuyển đổi dữ liệu, Power Pivot và Power View để mô hình hóa và trực quan hóa dữ liệu.</li>\n</ul>\n\n<p>Dựa trên cấu trúc đó, khi tìm tài liệu bạn nên ưu tiên các nhóm nội dung sau</p>\n\n<ul class="wp-block-list">\n<li>Kết nối và nhập dữ liệu</li>\n\n<li>Power Query và xử lý dữ liệu</li>\n\n<li>Data modeling</li>\n\n<li>DAX</li>\n\n<li>Visualization và dashboard design</li>\n\n<li>Publish và chia sẻ</li>\n</ul>\n\n<p>Cách tiếp cận hợp lý là học theo trình tự xử lý dữ liệu → mô hình hóa → tính toán → trực quan hóa → chia sẻ. Khi học theo trình tự này, bạn sẽ hiểu cách các thành phần liên kết với nhau thay vì chỉ biết thao tác từng tính năng riêng lẻ. Từ đó hiểu bản chất công cụ và áp dụng được vào các dự án thực tế.</p>\n\n<h2 class="wp-block-heading" id="h-cac-tai-liệu-power-bi-chinh-thức-từ-microsoft"><span class="ez-toc-section" id="Cac_tai_lieu_Power_BI_chinh_thuc_tu_Microsoft"></span><strong>Các tài liệu Power BI chính thức từ Microsoft</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Khi tìm tài liệu Power BI, nguồn từ Microsoft luôn là điểm xuất phát đáng tin cậy nhất bởi độ chính xác, độ cập nhật và tính hệ thống cao. Dưới đây là các tài nguyên chính thức bạn nên tham khảo:</p>\n\n<h3 class="wp-block-heading" id="h-microsoft-learn-lộ-trinh-tự-học-power-bi"><a href="https://learn.microsoft.com/vi-vn/training/powerplatform/power-bi" target="_blank" rel="noreferrer noopener"><strong>Microsoft Learn</strong></a><strong> – Lộ trình tự học Power BI</strong></h3>\n\n<p>Microsoft Learn cung cấp lộ trình học Power BI theo từng bước cho người học ở mọi trình độ, từ cơ bản đến nâng cao. Nội dung được chia theo module, từng bước hướng dẫn bạn từ cách kết nối dữ liệu đến xử lý, mô hình hóa và trực quan hóa dữ liệu.</p>\n\n<p>Thông tin chi tiết:</p>\n\n<ul class="wp-block-list">\n<li>Cấp độ: Sơ cấp &#8211; Trung cấp &#8211; Cao cấp</li>\n\n<li>Độ khó: Dễ tiếp cận ở bước đầu, tăng dần khi đi sâu vào Data Modeling và DAX</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-power-bi-community-diễn-dan-chinh-thức-của-microsoft"><a href="https://community.fabric.microsoft.com/t5/Power-BI-forums/ct-p/powerbi?wt.mc_id=DXLEX_EDX_DAT207X" target="_blank" rel="noreferrer noopener"><strong>Power BI Community</strong></a><strong> – Diễn đàn chính thức của Microsoft</strong></h3>\n\n<p>Diễn đàn này là nơi chuyên gia, người dùng và kỹ sư Microsoft trao đổi tài liệu, giải pháp và mẹo học Power BI. Bạn có thể tìm được bài hướng dẫn chi tiết, câu trả lời cho các vấn đề cụ thể và nhiều nguồn tham khảo khác.</p>\n\n<h3 class="wp-block-heading" id="h-power-bi-blog-cập-nhật-tinh-nang-amp-hướng-dẫn-sử-dụng"><a href="https://powerbi.microsoft.com/en-us/blog/category/features/" target="_blank" rel="noreferrer noopener"><strong>Power BI Blog</strong></a><strong> – Cập nhật tính năng &amp; hướng dẫn sử dụng</strong></h3>\n\n<p>Blog chính thức của Power BI cung cấp các bài viết cập nhật tính năng mới, hướng dẫn cách sử dụng theo từng bản cập nhật và những tips hữu ích. Đây là nguồn tài liệu phù hợp để theo dõi xu hướng Power BI mới nhất và đọc những hướng dẫn từ đội ngũ phát triển.</p>\n\n<ul class="wp-block-list">\n<li>Cấp độ: Trung cấp &#8211; Cao cấp</li>\n</ul>\n\n<h2 class="wp-block-heading" id="h-cac-tai-liệu-amp-khoa-học-power-bi-co-trả-phi"><span class="ez-toc-section" id="Cac_tai_lieu_khoa_hoc_Power_BI_co_tra_phi"></span><strong>Các tài liệu &amp; khóa học Power BI có trả phí</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Nếu bạn gặp khó khăn trong việc tự học, bạn có thể tham khảo và đầu tư vào các khóa học Power BI có trả phí dưới đây:&nbsp;</p>\n\n<h3 class="wp-block-heading" id="h-học-power-bi-cung-microsoft-certified-trainer-udemy"><strong>Học Power BI cùng </strong><a href="https://www.udemy.com/course/microsoft-power-bi-vietnam/" target="_blank" rel="noreferrer noopener"><strong>Microsoft Certified Trainer</strong></a><strong> (Udemy)</strong></h3>\n\n<p>Đây là khóa học Power BI bằng tiếng Việt được nhiều người dùng chọn để học nhanh và tổng quan các kỹ năng chính trong Power BI bao gồm Power Query, mô hình dữ liệu, DAX và trực quan hóa. Khóa học phù hợp cho người mới bắt đầu và những ai muốn có nền tảng bài bản.</p>\n\n<ul class="wp-block-list">\n<li>Chi phí: 399.000đ</li>\n\n<li>Cấp độ: Sơ cấp &#8211; Trung cấp</li>\n\n<li>Thời lượng học: Khóa thường gồm 8 phần với khoảng 55 bài giảng, tổng thời gian học khoảng 5–10 giờ (tuy không ghi chi tiết trên Udemy nhưng số bài giảng khá ngắn và dễ hoàn tất trong vài buổi).</li>\n\n<li>Ưu điểm: Có bài tập thực hành, dễ tiếp cận và phù hợp để học nhanh.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-cac-khoa-học-power-bi-khac-tren-udemy-da-dạng-theo-nhu-cầu"><strong>Các khóa học Power BI khác trên </strong><a href="https://www.udemy.com/vi/topic/microsoft-power-bi/" target="_blank" rel="noreferrer noopener"><strong>Udemy</strong></a><strong> (đa dạng theo nhu cầu)</strong></h3>\n\n<p>Udemy cung cấp hàng trăm khóa học Power BI từ cơ bản đến nâng cao như <a href="https://www.udemy.com/course/mspowerbi/" target="_blank" rel="noreferrer noopener">Power BI A-Z</a>, <a href="https://www.udemy.com/course/microsoft-power-bi-up-running-with-power-bi-desktop/" target="_blank" rel="noreferrer noopener">Power BI Desktop for Business Intelligence</a> hay <a href="https://www.udemy.com/course/70-778-analyzing-and-visualizing-data-with-power-bi/" target="_blank" rel="noreferrer noopener">Power BI Data Analyst Associate (PL-300)</a>. Bạn có thể lựa chọn theo nhu cầu cụ thể như học DAX chuyên sâu, xây dashboard cho doanh nghiệp hoặc chuẩn bị chứng chỉ.</p>\n\n<ul class="wp-block-list">\n<li>Chi phí: Dao động khoảng 10–200 USD mỗi khóa, tùy nội dung và chương trình giảm giá. </li>\n\n<li>Cấp độ: Từ sơ cấp đến cao cấp.</li>\n\n<li>Ưu điểm: Có thể học theo từng module và được truy cập trọn đời sau khi mua.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-microsoft-power-bi-data-analyst-professional-certificate-coursera"><a href="https://www.coursera.org/professional-certificates/microsoft-power-bi-data-analyst" target="_blank" rel="noreferrer noopener"><strong>Microsoft Power BI Data Analyst Professional Certificate</strong></a><strong> (Coursera)</strong></h3>\n\n<p>Đây là chương trình chứng chỉ chuyên nghiệp do Microsoft cung cấp trên Coursera, xây dựng lộ trình toàn diện từ nhập môn đến kỹ năng phân tích dữ liệu nâng cao. Khóa học hướng đến việc chuẩn bị cho kỳ thi PL-300, phù hợp nếu bạn muốn có chứng chỉ chính thức khi ứng tuyển vị trí Data Analyst hoặc BI Analyst.</p>\n\n<ul class="wp-block-list">\n<li>Chi phí:\n\n<ul class="wp-block-list">\n<li>Có thể học miễn phí ở chế độ audit nhưng không nhận chứng chỉ.</li>\n\n<li>Gói đầy đủ kèm chứng chỉ thường từ $49–$79/tháng, hoặc nếu bạn mua Coursera Plus (~$199–$399/năm) thì có thể học nhiều khóa trên Coursera.</li>\n</ul>\n\n</li>\n<li>Cấp độ: Sơ cấp &#8211; Trung cấp</li>\n<li>Thời lượng học: Tổng nội dung khoảng 200 giờ bao gồm video và bài tập.</li>\n<li>Ưu điểm: Lộ trình rõ ràng, định hướng nghề nghiệp cụ thể và chứng chỉ được công nhận rộng rãi.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-linkedin-learning-goi-khoa-học-power-bi-theo-chuyen-dề"><a href="https://www.linkedin.com/learning/topics/power-bi" target="_blank" rel="noreferrer noopener"><strong>LinkedIn Learning</strong></a><strong> – Gói khóa học Power BI theo chuyên đề</strong></h3>\n\n<p>LinkedIn Learning cung cấp nhiều khoá học theo chủ đề như <a href="https://www.linkedin.com/learning/power-bi-essential-training-25882735" target="_blank" rel="noreferrer noopener">Power BI Essential Training</a>, <a href="https://www.linkedin.com/learning/learning-power-bi-desktop-25612913" target="_blank" rel="noreferrer noopener">Power BI Desktop</a> hay các bài học mô hình dữ liệu và dashboard. Đây là lựa chọn phù hợp nếu bạn muốn học theo mảng chuyên biệt thay vì một khoá đơn lẻ.</p>\n\n<ul class="wp-block-list">\n<li>Chi phí: ~$39.99/tháng hoặc ~$239.88/năm (truy cập không giới hạn toàn bộ khoá học trên nền tảng)</li>\n\n<li>Cấp độ: Sơ cấp &#8211; Trung cấp</li>\n\n<li>Ưu điểm: Mua một gói là có thể truy cập nhiều nội dung khác nhau và đa chủ đề, phù hợp cho người mới hoặc người cần củng cố kiến thức</li>\n</ul>\n\n<h2 class="wp-block-heading" id="h-cac-tai-liệu-power-bi-dạng-sach-amp-e-book"><span class="ez-toc-section" id="Cac_tai_lieu_Power_BI_dang_sach_e-book"></span><strong>Các tài liệu Power BI dạng sách &amp; e-book</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Bên cạnh các khóa học, sách và e-book là nguồn tham khảo quý giá giúp bạn học sâu về Power BI, từ nền tảng tới các kỹ thuật nâng cao.&nbsp;</p>\n\n<p>Dưới đây là 6 đầu sách &amp; e-book Power BI nên có trong thư viện học của bạn:</p>\n\n<p><em>* Giá dưới đây mang tính tham khảo toàn cầu (USD) vì giá cụ thể thay đổi theo nơi bán và thời điểm.</em></p>\n\n<h3 class="wp-block-heading" id="h-microsoft-power-bi-for-dummies"><a href="https://www.amazon.com/s?k=Microsoft+Power+BI+For+Dummies&amp;crid=376XDLQAQYG&amp;sprefix=microsoft+power+bi+for+dummies%2Caps%2C374&amp;ref=nb_sb_noss_1" target="_blank" rel="noreferrer noopener"><strong>Microsoft Power BI For Dummies</strong></a></h3>\n\n<ul class="wp-block-list">\n<li>Phù hợp với: Người mới bắt đầu muốn tài liệu Power BI dễ tiếp cận.</li>\n\n<li>Giá mua (tham khảo): khoảng $20 – $30 (bản paperback / Kindle trên Amazon)</li>\n\n<li>Nội dung: Cuốn sách cơ bản dành cho người mới hoàn toàn, trình bày dễ hiểu về cách Power BI hoạt động và cách tạo báo cáo/dashboard từ dữ liệu.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-m-is-for-data-monkey"><a href="https://www.amazon.com/Data-Monkey-Guide-Language-Excel/dp/1615470344" target="_blank" rel="noreferrer noopener"><strong>M Is for (Data) Monkey</strong></a></h3>\n\n<ul class="wp-block-list">\n<li>Phù hợp với: Người đã quen với Power BI cơ bản muốn nâng cao kỹ năng xử lý dữ liệu.</li>\n\n<li>Giá mua (tham khảo): khoảng $25 – $40 trên Amazon</li>\n\n<li>Nội dung: Tập trung vào Power Query và ngôn ngữ M, rất quan trọng để xử lý dữ liệu trước khi phân tích trong Power BI.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-power-pivot-and-power-bi-the-excel-user-s-guide"><a href="https://books.google.com.gt/books?id=KvctCwAAQBAJ&amp;printsec=frontcover" target="_blank" rel="noreferrer noopener"><strong>Power Pivot and Power BI: The Excel User’s Guide</strong></a></h3>\n\n<ul class="wp-block-list">\n<li>Phù hợp với: Người dùng Excel muốn sang Power BI.</li>\n\n<li>Giá mua (tham khảo): khoảng $30 – $40 bản paperback</li>\n\n<li>Nội dung: Sách dành cho người chuyển từ Excel sang Power BI, giải thích Power Pivot, DAX và Power Query theo cách dễ hiểu với người Excel.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-the-definitive-guide-to-dax"><a href="https://www.amazon.com/Definitive-Guide-Dax-Business-Skills/dp/0138244723" target="_blank" rel="noreferrer noopener"><strong>The Definitive Guide to DAX</strong></a></h3>\n\n<ul class="wp-block-list">\n<li>Phù hợp với: Người muốn đi sâu vào tính toán nâng cao với DAX.</li>\n\n<li>Giá mua (tham khảo): khoảng $40 – $50</li>\n\n<li>Nội dung: Đây là tài liệu chuyên sâu về ngôn ngữ DAX và mô hình dữ liệu trong Power BI, thường được các chuyên gia BI sử dụng như reference.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-microsoft-power-bi-quick-start-guide-packt"><a href="https://www.amazon.com/Microsoft-Power-Quick-Start-Guide/dp/1800561571" target="_blank" rel="noreferrer noopener"><strong>Microsoft Power BI Quick Start Guide (Packt)</strong></a></h3>\n\n<ul class="wp-block-list">\n<li>Phù hợp: Phù hợp với người mới bắt đầu và người ở mức trung cấp</li>\n\n<li>Giá mua (Tham khảo):\n\n<ul class="wp-block-list">\n<li>Bản e-book ~ $31.99 trên Apple Books</li>\n\n<li>Bản paperback ~ $70 – $99 trên Packt Publishing</li>\n</ul>\n\n</li>\n<li>Nội dung: E-book này cung cấp hướng dẫn từ cơ bản đến trung cấp về cách xây dựng báo cáo, trực quan hóa và tạo mô hình dữ liệu trong Power BI.</li>\n</ul>\n\n<h2 class="wp-block-heading" id="h-tai-liệu-power-bi-dạng-video-youtube"><span class="ez-toc-section" id="Tai_lieu_Power_BI_dang_video_Youtube"></span><strong>Tài liệu Power BI dạng video Youtube</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>YouTube là một trong những nguồn học Power BI miễn phí được nhiều người lựa chọn vì dễ tiếp cận và có demo trực quan. Dưới đây là những kênh YouTube nổi bật mà bạn nên theo dõi, kèm mô tả ngắn giúp bạn chọn đúng nội dung theo trình độ của mình.</p>\n\n<h3 class="wp-block-heading" id="h-guy-in-a-cube"><a href="https://www.youtube.com/guyinacube" target="_blank" rel="noreferrer noopener"><strong>Guy in a Cube</strong></a><strong> </strong></h3>\n\n<p>Đây là một trong những kênh nổi tiếng nhất về Power BI, được dẫn dắt bởi hai chuyên gia BI là Adam Saxton và Patrick LeBlanc. Nội dung phù hợp từ trình độ trung cấp đến nâng cao.</p>\n\n<p>Kênh Youtube này có ưu điểm:</p>\n\n<ul class="wp-block-list">\n<li>Nội dung cập nhật thường xuyên và bám sát các tính năng mới của Microsoft.</li>\n\n<li>Chia sẻ nhiều mẹo hay giúp tối ưu báo cáo, xử lý lỗi, cải thiện hiệu suất</li>\n\n<li>Có nhiều nội dung chuyên sâu về DAX, Power BI Service và triển khai thực tế.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-power-bi-tutorial-for-beginners-kevin-stratvert"><a href="https://youtu.be/NNSHu0rkew8?si=AKWJRyTni7Xkj6T3" target="_blank" rel="noreferrer noopener"><strong>Power BI Tutorial for Beginners – Kevin Stratvert</strong></a></h3>\n\n<p>Kevin Stratvert là YouTuber chuyên chia sẻ các hướng dẫn về Microsoft Office, Excel và Power BI theo phong cách ngắn gọn, dễ hiểu. Các video trên kênh này có ưu điểm là giúp người mới làm quen nhanh với công cụ trong thời gian ngắn.</p>\n\n<p>Nội dung video “Power BI Tutorial for Beginners” tập trung vào các bước cơ bản như import dữ liệu, tạo biểu đồ và xuất báo cáo.&nbsp;</p>\n\n<p>Phù hợp với người mới bắt đầu hoặc những ai muốn ôn lại kiến thức nền tảng trong thời gian ngắn.</p>\n\n<h3 class="wp-block-heading" id="h-enterprise-dna"><a href="https://www.youtube.com/@EnterpriseDNA" target="_blank" rel="noreferrer noopener"><strong>Enterprise DNA</strong></a></h3>\n\n<p>Enterprise DNA là kênh chuyên sâu về phân tích dữ liệu và Business Intelligence, tập trung mạnh vào Power BI trong bối cảnh ứng dụng thực tế tại doanh nghiệp. Nội dung nhấn mạnh tư duy phân tích và cách xây dựng giải pháp dữ liệu hoàn chỉnh.</p>\n\n<p>Các video về Power BI thường đi sâu vào:</p>\n\n<ul class="wp-block-list">\n<li>DAX nâng cao, data modeling, tối ưu hiệu suất báo cáo và thiết kế dashboard theo chuẩn chuyên nghiệp. </li>\n\n<li>Ngoài ra, còn khai thác nhiều tình huống thực tế, giúp người học hiểu cách áp dụng Power BI vào bài toán kinh doanh cụ thể thay vì chỉ học công thức.</li>\n</ul>\n\n<p>Phù hợp với người đã có nền tảng Power BI và muốn nâng cao kỹ năng phân tích, hoặc những ai đang làm Data Analyst, BI Developer và cần đào sâu tư duy giải quyết vấn đề bằng dữ liệu.</p>\n\n<h3 class="wp-block-heading" id="h-curbal"><a href="https://www.youtube.com/@CurbalEN" target="_blank" rel="noreferrer noopener"><strong>Curbal</strong></a></h3>\n\n<p>Curbal do chuyên gia Power BI người Thụy Điển điều hành, nổi bật với các video ngắn hướng dẫn giải quyết từng vấn đề kỹ thuật cụ thể như Power Query, DAX và visualization,&#8230; rất dễ tra cứu khi cần.</p>\n\n<p>Phù hợp với người đã có nền tảng và muốn tìm giải pháp nhanh cho một tính năng cụ thể.</p>\n\n<h2 class="wp-block-heading" id="h-tai-liệu-power-bi-dạng-blog-website"><span class="ez-toc-section" id="Tai_lieu_Power_BI_dang_BlogWebsite"></span><strong>Tài liệu Power BI dạng Blog/Website</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Bên cạnh tài liệu chính thức, các blog và website chuyên về Data &amp; Business Intelligence là nguồn tài liệu Power BI cực kỳ hữu ích để cập nhật kiến thức thực tế, kinh nghiệm triển khai và xu hướng ngành.</p>\n\n<h3 class="wp-block-heading" id="h-mastering-data-analytics"><a href="https://www.mastering-da.com/tong-hop-cac-nguon-tu-hoc-power-bi-mien-phi-uy-tin" target="_blank" rel="noreferrer noopener"><strong>Mastering Data Analytics</strong></a><strong> </strong></h3>\n\n<p>Website này chuyên chia sẻ kiến thức về Data Analytics, trong đó có nhiều bài viết tổng hợp tài liệu Power BI miễn phí và uy tín.</p>\n\n<p>Nội dung nổi bật:</p>\n\n<ul class="wp-block-list">\n<li>Tổng hợp nguồn học Power BI từ cơ bản đến nâng cao</li>\n\n<li>Gợi ý roadmap học Power BI cho người mới</li>\n\n<li>Danh sách website, khóa học, kênh YouTube chất lượng</li>\n</ul>\n\n<p>Ưu điểm:</p>\n\n<ul class="wp-block-list">\n<li>Nội dung hệ thống, dễ theo dõi</li>\n\n<li>Phù hợp với người mới bắt đầu</li>\n\n<li>Tập trung vào thực hành và định hướng nghề nghiệp</li>\n</ul>\n\n<p>Phù hợp với: Sinh viên, người chuyển ngành hoặc Data Analyst mới vào nghề.</p>\n\n<h3 class="wp-block-heading" id="h-simplilearn"><a href="https://www.simplilearn.com/power-bi-resources-article" target="_blank" rel="noreferrer noopener"><strong>Simplilearn</strong></a><strong> </strong></h3>\n\n<p>Simplilearn là nền tảng đào tạo công nghệ quốc tế, cung cấp nhiều bài viết chuyên sâu và tài liệu Power BI cập nhật theo xu hướng thị trường.</p>\n\n<p>Nội dung nổi bật:</p>\n\n<ul class="wp-block-list">\n<li>Bài hướng dẫn chi tiết về Power BI Desktop</li>\n\n<li>Giải thích DAX, Data Modeling, Visualization</li>\n\n<li>Tổng hợp tài nguyên học Power BI từ nhiều nguồn</li>\n</ul>\n\n<p>Ưu điểm:</p>\n\n<ul class="wp-block-list">\n<li>Nội dung bài bản, chuyên nghiệp</li>\n\n<li>Phù hợp cho người muốn nâng cao kỹ năng</li>\n\n<li>Cập nhật xu hướng và kỹ năng theo nhu cầu tuyển dụng</li>\n</ul>\n\n<p>Phù hợp với: Người đã có nền tảng cơ bản và muốn học chuyên sâu.</p>\n\n<h3 class="wp-block-heading" id="h-UpNext-blog"><a href="https://UpNext.com/blog/" target="_blank" rel="noreferrer noopener"><strong>UpNext Blog</strong></a><strong> </strong></h3>\n\n<p>UpNext Blog là nền tảng chia sẻ kiến thức chuyên môn và định hướng sự nghiệp trong lĩnh vực IT, trong đó có nhiều bài viết liên quan đến Power BI.</p>\n\n<p>Nội dung nổi bật:</p>\n\n<ul class="wp-block-list">\n<li><a href="https://UpNext.com/blog/power-bi-la-gi/" target="_blank" rel="noreferrer noopener">Tổng quan về Power BI</a></li>\n\n<li><a href="https://UpNext.com/blog/huong-dan-tai-power-bi/" target="_blank" rel="noreferrer noopener">Hướng dẫn tải và cài đặt</a></li>\n\n<li><a href="https://UpNext.com/blog/so-sanh-tableau-vs-power-bi/" target="_blank" rel="noreferrer noopener">So sánh Tableau và Power BI</a></li>\n\n<li><a href="https://UpNext.com/blog/power-bi-certification/" target="_blank" rel="noreferrer noopener">Thông tin về chứng chỉ Power BI</a></li>\n\n<li>Tổng hợp tài liệu Power BI</li>\n\n<li><a href="https://UpNext.com/blog/cach-su-dung-power-bi/" target="_blank" rel="noreferrer noopener">Cách sử dụng Power BI hiệu quả</a></li>\n</ul>\n\n<p>Ưu điểm: Nội dung tiếng Việt, dễ đọc, dễ hiểu và chọn lọc những thông tin thiết thực cho người học.</p>\n\n<p>Phù hợp với: Người mới bắt đầu tìm hiểu Power BI, người đang xây dựng lộ trình học bài bản hoặc ứng viên muốn hiểu rõ hơn về yêu cầu kỹ năng Power BI trên thị trường tuyển dụng IT.</p>\n\n<h2 class="wp-block-heading" id="h-tai-liệu-power-bi-từ-community-forum"><span class="ez-toc-section" id="Tai_lieu_Power_BI_tu_CommunityForum"></span><strong>Tài liệu Power BI từ Community/Forum</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Diễn đàn &amp; cộng đồng trực tuyến là nơi bạn có thể đặt câu hỏi, chia sẻ vấn đề gặp phải và học từ những người khác trong quá trình làm việc với Power BI. Dưới đây là các diễn đàn/nhóm nổi bật:</p>\n\n<h3 class="wp-block-heading" id="h-microsoft-power-platform-community"><a href="https://community.powerplatform.com/" target="_blank" rel="noreferrer noopener"><strong>Microsoft Power Platform Community</strong></a></h3>\n\n<p>Đây là diễn đàn chính thức do Microsoft vận hành dành cho các sản phẩm thuộc Power Platform, bao gồm Power BI. Người dùng có thể đặt câu hỏi, thảo luận tình huống thực tế và trao đổi tài nguyên với cộng đồng chuyên gia trên toàn cầu.</p>\n\n<p>Nội dung nổi bật:</p>\n\n<ul class="wp-block-list">\n<li>Boards thảo luận từ Power BI Service đến Power Query, DAX</li>\n\n<li>Bài viết hỗ trợ kỹ thuật và thủ thuật thực tế</li>\n</ul>\n\n<p>Ưu điểm lớn nhất là độ tin cậy cao vì được quản lý bởi Microsoft, đồng thời có sự tham gia của nhiều MVP và chuyên gia BI giàu kinh nghiệm.</p>\n\n<p>Phù hợp với người cần nguồn hỗ trợ chính thống, muốn cập nhật tính năng mới hoặc tìm lời giải cho các vấn đề kỹ thuật phức tạp trong quá trình làm việc với Power BI.</p>\n\n<h3 class="wp-block-heading" id="h-microsoft-power-bi-subreddit-r-powerbi"><a href="https://www.reddit.com/r/PowerBI/" target="_blank" rel="noreferrer noopener"><strong>Microsoft Power BI Subreddit (r/PowerBI)</strong></a></h3>\n\n<p>Subreddit này là một trong những cộng đồng lớn nhất dành cho người dùng Power BI trên Reddit, gồm cả người mới lẫn chuyên gia, chia sẻ dự án, hỏi đáp và mẹo học.</p>\n\n<p>Nội dung nổi bật:</p>\n\n<ul class="wp-block-list">\n<li>Câu hỏi &amp; giải pháp realtime cho các vấn đề cụ thể</li>\n\n<li>Chia sẻ nguồn học, tài nguyên, dashboard mẫu</li>\n</ul>\n\n<p>Ưu điểm: Cộng đồng tương tác rất năng động, Ppản hồi nhanh, đa dạng góc nhìn từ người dùng toàn cầu.</p>\n\n<p>Phù hợp: Người muốn học qua thảo luận thực tế và ví dụ ứng dụng.</p>\n\n<h3 class="wp-block-heading" id="h-enterprise-dna-forum"><a href="https://forum.enterprisedna.co/" target="_blank" rel="noreferrer noopener"><strong>Enterprise DNA Forum</strong></a></h3>\n\n<p>Diễn đàn Enterprise DNA tập trung vào Power BI từ góc độ chuyên sâu, phù hợp với người làm BI hoặc các consultant/UAT developer.</p>\n\n<p>Nội dung nổi bật:</p>\n\n<ul class="wp-block-list">\n<li>Thảo luận chuyên sâu về DAX, data modeling</li>\n\n<li>Case study dự án thực tế, phản hồi cao từ các chuyên gia</li>\n</ul>\n\n<p>Ưu điểm: Cộng đồng chất lượng và nội dung thảo luận kỹ thuật chuyên sâu hơn các forum khác.</p>\n\n<p>Phù hợp: Người đã có nền tảng và muốn nâng trình theo mô hình ứng dụng thực tế.</p>\n\n<h2 class="wp-block-heading" id="h-cac-cau-hỏi-thường-gặp-về-tai-liệu-power-bi"><span class="ez-toc-section" id="Cac_cau_hoi_thuong_gap_ve_tai_lieu_Power_BI"></span><strong>Các câu hỏi thường gặp về tài liệu Power BI</strong><span class="ez-toc-section-end"></span></h2>\n\n<h3 class="wp-block-heading" id="h-người-mới-nen-bắt-dầu-với-tai-liệu-power-bi-nao"><strong>Người mới nên bắt đầu với tài liệu Power BI nào?</strong></h3>\n\n<p>Người mới nên ưu tiên tài liệu Power BI chính thức từ Microsoft Learn để nắm vững kiến thức nền tảng như giao diện Power BI Desktop, cách kết nối dữ liệu và tạo báo cáo cơ bản.&nbsp;</p>\n\n<p>Sau đó, có thể kết hợp thêm video hướng dẫn trên YouTube hoặc các blog chuyên về Data để hiểu rõ hơn về trực quan hóa dữ liệu và tư duy phân tích. Khi đã có nền tảng, bạn có thể tiếp cận các tài liệu Power BI chuyên sâu hơn về DAX và Data Modeling để nâng cao kỹ năng thực hành thực tế.</p>\n\n<h3 class="wp-block-heading" id="h-học-power-bi-mất-bao-lau"><strong>Học Power BI mất bao lâu?</strong></h3>\n\n<p>Thời gian học Power BI phụ thuộc vào nền tảng sẵn có và cách bạn lựa chọn tài liệu Power BI để học. Thông thường, người mới có thể nắm được kiến thức cơ bản trong khoảng 4–6 tuần nếu học đều đặn.&nbsp;</p>\n\n<p>Nếu muốn sử dụng thành thạo DAX, Data Modeling và xây dựng dashboard chuyên nghiệp, bạn có thể cần từ 2–3 tháng thực hành liên tục với tài liệu Power BI nâng cao.&nbsp;</p>\n\n<p>Điều quan trọng là ban đầu, bạn xác định được lộ trình học rõ ràng và thực hành thường xuyên trên dữ liệu thực tế.</p>\n\n<h3 class="wp-block-heading" id="h-co-thể-tự-học-power-bi-khong"><strong>Có thể tự học Power BI không?</strong></h3>\n\n<p>Bạn hoàn toàn có thể tự học vì hiện nay có rất nhiều tài liệu Power BI miễn phí từ Microsoft, blog chuyên ngành và YouTube giúp người mới tiếp cận từ cơ bản đến nâng cao. Điều quan trọng là kết hợp giữa đọc tài liệu, xem hướng dẫn và thực hành trên dữ liệu thực tế để nâng cao kỹ năng nhanh hơn.</p>\n\n<h2 class="wp-block-heading" id="h-kết-luận"><span class="ez-toc-section" id="Ket_luan"></span><strong>Kết luận</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Việc lựa chọn đúng tài liệu Power BI sẽ giúp bạn rút ngắn thời gian học và xây dựng nền tảng phân tích dữ liệu vững chắc ngay từ đầu. Khi có định hướng rõ ràng và nguồn tài liệu Power BI phù hợp với trình độ, bạn sẽ dễ dàng nâng cao kỹ năng và ứng dụng vào công việc thực tế. Hãy bắt đầu với những tài liệu chất lượng, kiên trì thực hành và từng bước phát triển năng lực Business Intelligence của mình.</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Tổng hợp 20+ tài liệu Power BI từ cơ bản đến nâng cao',
      metaDescription:
        'Lưu danh sách tài liệu Power BI từ cơ bản đến nâng cao, nguồn từ Microsoft, khóa học, sách, YouTube đến cộng đồng giúp bạn học hiệu quả hơn.',
      viewCount: 18964,
      tags: ['Backend & Architecture', 'AI & Data', 'Cloud & AWS'],
    },
    {
      id: postSeedId(211),
      title: 'Hàm CALCULATE trong Power BI: Hướng dẫn sử dụng kèm ví dụ',
      slug: 'ham-calculate-trong-power-bi',
      imageUrl:
        'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 229,
      content:
        '<h1 class="page-title">Hàm CALCULATE trong Power BI: Hướng dẫn sử dụng kèm ví dụ</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/chuyen-mon-it/"><span>Chuyên môn IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<p>Nếu cần tính Doanh thu = Quantity × Unit Price, ta không thể dùng SUM đơn thuần mà cần SUMX để tính từng dòng rồi cộng lại:</p>\n\n<pre class="wp-block-code"><code>Total Revenue = \nSUMX(\n    Sales,\n    Sales&#91;Quantity] * Sales&#91;UnitPrice]\n)</code></pre>\n\n<p>Nếu chỉ dùng <code>SUM(Quantity) * SUM(UnitPrice)</code> thì sẽ sai logic vì phép nhân phải thực hiện theo từng dòng. Còn nếu ta muốn tính Doanh thu chỉ cho năm 2026, ta sẽ dùng CALCULATE để thêm điều kiện lọc năm:</p>\n\n<pre class="wp-block-code"><code>Revenue 2026 = \nCALCULATE(\n    &#91;Total Revenue],\n    Sales&#91;Year] = 2026\n)</code></pre>\n\n<h3 class="wp-block-heading" id="h-calculate-co-thay-dổi-dữ-liệu-gốc-trong-power-bi-khong">CALCULATE <strong>có thay đổi dữ liệu gốc trong Power BI không?</strong></h3>\n\n<p>CALCULATE không thay đổi, chỉnh sửa hay ghi đè dữ liệu gốc trong bảng. Hàm này chỉ thay đổi filter context tại thời điểm tính toán measure. Nói cách khác, CALCULATE chỉ ảnh hưởng đến cách dữ liệu được đánh giá, chứ không làm thay đổi dữ liệu vật lý trong mô hình.</p>\n\n<h3 class="wp-block-heading" id="h-việc-sử-dụng-calculate-co-ảnh-hưởng-dến-hiệu-nang-bao-cao-khong"><strong>Việc sử dụng CALCULATE có ảnh hưởng đến hiệu năng báo cáo không?</strong></h3>\n\n<p>Có thể, tùy cách sử dụng.<strong> </strong>Bản thân CALCULATE không phải là hàm “chậm”, nhưng nếu kết hợp với các hàm như FILTER trên bảng lớn hoặc loại bỏ filter quá rộng (ALL toàn bảng), nó có thể làm tăng khối lượng tính toán và khiến report chậm hơn. Hiệu năng phụ thuộc nhiều hơn vào:</p>\n\n<ul class="wp-block-list">\n<li>Mô hình dữ liệu</li>\n\n<li>Số lượng dòng dữ liệu</li>\n\n<li>Cách viết điều kiện filter</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-co-bắt-buộc-phải-dung-calculate-trong-mọi-measure-khong"><strong>Có bắt buộc phải dùng </strong>CALCULATE <strong>trong mọi measure không?</strong></h3>\n\n<p>Không bắt buộc. Nếu bạn chỉ cần phép tính đơn giản như dưới đây thì không cần dùng CALCULATE:</p>\n\n<pre class="wp-block-code"><code>Total Sales = SUM(Sales&#91;Amount])</code></pre>\n\n<p>CALCULATE chỉ thực sự cần thiết khi bạn muốn:</p>\n\n<ul class="wp-block-list">\n<li>Thêm hoặc thay đổi điều kiện lọc</li>\n\n<li>Loại bỏ filter</li>\n\n<li>Thực hiện Time Intelligence</li>\n\n<li>Tạo các phép tính động phức tạp</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-vi-sao-kết-quả-khi-dung-calculate-doi-khi-khong-giống-slicer"><strong>Vì sao kết quả khi dùng </strong>CALCULATE<strong> đôi khi “không giống slicer”?</strong></h3>\n\n<p>Nguyên nhân thường là vì CALCULATE đã:</p>\n\n<ul class="wp-block-list">\n<li>Ghi đè filter trên cùng một cột</li>\n\n<li>Hoặc loại bỏ filter bằng ALL/REMOVEFILTERS</li>\n</ul>\n\n<p>Điều này không phải lỗi của Power BI, mà là do filter context đã bị thay đổi theo logic của measure.</p>\n\n<h2 class="wp-block-heading" id="h-tổng-kết"><span class="ez-toc-section" id="Tong_ket"></span><strong>Tổng kết</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>CALCULATE không chỉ là một hàm bổ sung điều kiện lọc, mà là công cụ giúp bạn kiểm soát bối cảnh tính toán trong DAX. Từ việc thêm filter, ghi đè filter, xóa filter cho đến kết hợp với Time Intelligence, gần như mọi công thức DAX nâng cao đều xoay quanh CALCULATE.&nbsp;</p>\n\n<p>Khi bạn hiểu rõ cách CALCULATE hoạt động và mối liên hệ của nó với filter context, DAX sẽ không còn là tập hợp các công thức khó nhớ mà trở thành một hệ thống logic có thể kiểm soát được. Đây cũng là bước chuyển quan trọng giúp bạn đi từ mức “biết viết measure” sang mức “thực sự làm chủ Power BI” thông qua việc kiểm soát filter context một cách chủ động.</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Hàm CALCULATE trong Power BI: Hướng dẫn sử dụng kèm ví dụ',
      metaDescription:
        'Tìm hiểu chi tiết hàm CALCULATE trong Power BI: cách hoạt động, thay đổi filter context, ví dụ, Time Intelligence và những lỗi thường gặp.',
      viewCount: 12176,
      tags: ['Backend & Architecture', 'AI & Data', 'Cloud & AWS'],
    },
    {
      id: postSeedId(212),
      title: 'Substring Java: Cách dùng từ A-Z và lỗi thường gặp',
      slug: 'huong-dan-substring-trong-java',
      imageUrl:
        'https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 474,
      content:
        '</blockquote>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Substring Java: Cách dùng từ A-Z và lỗi thường gặp',
      metaDescription:
        'Trong phát triển ứng dụng Java, xử lý chuỗi là tác vụ phổ biến, từ việc trích xuất dữ liệu như tên miền email, mã định danh đến rút gọn nội dung hiển thị.',
      viewCount: 29315,
      tags: ['Backend & Architecture', 'AI & Data', 'Cloud & AWS'],
    },
    {
      id: postSeedId(213),
      title: 'Cách sử dụng Power BI hiệu quả và các best practices cần biết',
      slug: 'cach-su-dung-power-bi',
      imageUrl:
        'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 151,
      content:
        '<h1 class="page-title">Cách sử dụng Power BI hiệu quả và các best practices cần biết</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/chuyen-mon-it/"><span>Chuyên môn IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<h2 class="wp-block-heading" id="h-biến-dổi-dữ-liệu-với-power-query"><span class="ez-toc-section" id="Bien_doi_du_lieu_voi_Power_Query"></span><strong>Biến đổi dữ liệu với Power Query</strong><span class="ez-toc-section-end"></span></h2>\n\n</blockquote>\n\n<h2 class="wp-block-heading" id="h-publish-bao-cao-vao-power-bi-service"><span class="ez-toc-section" id="Publish_bao_cao_vao_Power_BI_Service"></span><strong>Publish báo cáo vào Power BI Service</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Sau khi hoàn thiện báo cáo trong Power BI Desktop, bước tiếp theo để đưa báo cáo vào môi trường sử dụng thực tế là publish lên Power BI Service.&nbsp;</p>\n\n<p>Power BI Service là nền tảng đám mây của Microsoft cho phép người dùng chia sẻ báo cáo, thiết lập lịch refresh dữ liệu và phân quyền truy cập cho nhiều người dùng trong tổ chức. Có thể hiểu là Power BI Desktop dùng để xây dựng báo cáo, còn Power BI Service dùng để triển khai, vận hành và phân phối báo cáo.</p>\n\n<h3 class="wp-block-heading" id="h-quy-trinh-publish-report-từ-power-bi-desktop"><strong>Quy trình publish report từ Power BI Desktop</strong></h3>\n\n<ol class="wp-block-list">\n<li>Người dùng đăng nhập Power BI Desktop bằng tài khoản Microsoft hoặc tài khoản doanh nghiệp (Microsoft 365).</li>\n\n<li>Nhấn nút <em>Publish</em> trên thanh công cụ.</li>\n\n<li>Chọn workspace trên Power BI Service để lưu báo cáo.</li>\n\n<li>Power BI tải file .pbix lên cloud và tự động tạo dataset đi kèm.</li>\n</ol>\n\n<p>Sau khi publish thành công, báo cáo sẽ xuất hiện trên Power BI Service dưới hai thành phần là Report &#8211; giao diện dashboard người dùng xem và Dataset (Semantic model) &#8211; nơi lưu dữ liệu, mô hình và DAX.</p>\n\n<h3 class="wp-block-heading" id="h-thiết-lập-refresh-dữ-liệu"><strong>Thiết lập refresh dữ liệu</strong></h3>\n\n<p>Một trong những bước quan trọng sau khi publish là cấu hình Scheduled Refresh. Việc refresh tự động giúp báo cáo luôn hiển thị dữ liệu mới mà không cần mở Power BI Desktop. Người dùng có thể thiết lập tần suất refresh hàng ngày hoặc nhiều lần trong ngày…, cấu hình thông tin đăng nhập nguồn dữ liệu và kết nối gateway nếu dữ liệu nằm trong hệ thống nội bộ.</p>\n\n<h3 class="wp-block-heading" id="h-phan-quyền-va-chia-sẻ-bao-cao"><strong>Phân quyền và chia sẻ báo cáo</strong></h3>\n\n<p>Power BI Service cho phép quản lý quyền truy cập rất linh hoạt với các lựa chọn:</p>\n\n<ul class="wp-block-list">\n<li><strong>Viewer</strong>: chỉ xem báo cáo</li>\n\n<li><strong>Contributor</strong>: chỉnh sửa report trong Service</li>\n\n<li><strong>Member / Admin</strong>: quản lý workspace</li>\n</ul>\n\n<p>Ngoài ra, báo cáo có thể được chia sẻ thông qua link trực tiếp, Power BI app, Embed vào SharePoint hoặc website nội bộ.</p>\n\n<h2 class="wp-block-heading" id="h-kinh-nghiệm-cach-sử-dụng-power-bi-hiệu-quả"><span class="ez-toc-section" id="Kinh_nghiem_cach_su_dung_Power_BI_hieu_qua"></span><strong>Kinh nghiệm cách sử dụng Power BI hiệu quả</strong><span class="ez-toc-section-end"></span></h2>\n\n<ul class="wp-block-list">\n<li><strong>Luôn làm sạch dữ liệu bằng Power Query trước khi phân tích: </strong>Power Query được sinh ra để xử lý dữ liệu đầu vào như xóa dòng rác, chuẩn hóa cột và định dạng dữ liệu. Nếu dữ liệu chưa sạch mà viết DAX ngay, công thức sẽ phức tạp và khó kiểm soát kết quả.</li>\n\n<li><strong>Thiết kế mô hình dữ liệu trước khi vẽ biểu đồ: </strong>Trước khi kéo bất kỳ visual nào, hãy xác định rõ bảng nào là dữ liệu chính (fact) và bảng nào là dữ liệu mô tả (dimension). Mô hình tốt giúp báo cáo chạy nhanh và DAX dễ viết hơn.</li>\n\n<li><strong>Ưu tiên dùng measure thay vì calculated column: </strong>Measure chỉ được tính khi người dùng xem báo cáo nên linh hoạt và nhẹ hơn. Calculated column chỉ nên dùng khi thực sự cần dữ liệu cố định theo từng dòng.</li>\n\n<li><strong>Đặt tên bảng và measure rõ ràng ngay từ đầu: </strong>Tên dễ hiểu và có ý nghĩa sẽ giúp bạn sau này khi đọc lại báo cáo sẽ không bị rối và cũng giúp người khác dễ tiếp nhận khi dùng chung file Power BI.</li>\n\n<li><strong>Không đưa quá nhiều visual vào một trang: </strong>Một trang dashboard nên trả lời một câu hỏi chính và quá nhiều biểu đồ sẽ làm người xem khó nắm được insight quan trọng.</li>\n\n<li><strong>Sử dụng màu sắc nhất quán trong toàn bộ báo cáo: </strong>Nên dùng một theme màu cố định để báo cáo trông chuyên nghiệp và tránh gây nhiễu thị giác cho người xem.</li>\n\n<li><strong>Luôn kiểm tra kiểu dữ liệu (data type): </strong>Việc sai data type là nguyên nhân phổ biến khiến DAX tính sai hoặc không chạy được, đặc biệt với cột ngày tháng và số.</li>\n\n<li><strong>Kiểm tra báo cáo với nhiều bộ lọc khác nhau: </strong>Trước khi publish, hãy thử lọc theo từng tháng, từng sản phẩm hoặc từng khu vực để đảm bảo số liệu luôn đúng trong mọi tình huống.</li>\n\n<li><strong>Lưu phiên bản báo cáo thường xuyên: </strong>Power BI chưa có version control tích hợp nên hãy lưu nhiều bản để dễ quay lại khi chỉnh sửa nhầm.</li>\n</ul>\n\n<h2 class="wp-block-heading" id="h-cau-hỏi-thường-gặp-về-cach-sử-dụng-power-bi"><span class="ez-toc-section" id="Cau_hoi_thuong_gap_ve_cach_su_dung_Power_BI"></span><strong>Câu hỏi thường gặp về cách sử dụng Power BI</strong><span class="ez-toc-section-end"></span></h2>\n\n<h3 class="wp-block-heading" id="h-power-bi-co-phu-hợp-cho-big-data-khong"><strong>Power BI có phù hợp cho Big Data không?</strong></h3>\n\n<p>Power BI có thể làm việc với Big Data, tuy nhiên không được thiết kế để lưu trữ hay xử lý Big Data trực tiếp. Trong thực tế, Power BI đóng vai trò là lớp phân tích và trực quan hóa nằm phía trên các hệ thống Big Data như Data Warehouse, Data Lake, Azure Synapse, BigQuery hay Snowflake. Khi kết hợp với các nền tảng này thông qua Import mode hoặc DirectQuery, Power BI có thể phân tích tập dữ liệu rất lớn mà vẫn đảm bảo hiệu năng. Vì vậy, Power BI phù hợp để khai thác và phân tích Big Data, chứ không thay thế các hệ thống xử lý Big Data ở tầng dữ liệu.</p>\n\n<h3 class="wp-block-heading" id="h-power-bi-co-thể-thay-thế-excel-khong"><strong>Power BI có thể thay thế Excel không?</strong></h3>\n\n<p>Power BI không hoàn toàn thay thế Excel mà hai công cụ này bổ trợ cho nhau. Excel mạnh ở việc xử lý dữ liệu nhỏ, thao tác linh hoạt và làm việc cá nhân. Trong khi đó, Power BI phù hợp hơn với dữ liệu lớn, báo cáo động, tự động refresh và chia sẻ trong doanh nghiệp. Trên thực tế, nhiều tổ chức vẫn sử dụng Excel để nhập liệu hoặc xử lý ban đầu, sau đó dùng Power BI để xây dựng dashboard và báo cáo tổng hợp. Vì vậy, Power BI nên được xem là bước nâng cấp của Excel trong phân tích dữ liệu, chứ không phải công cụ thay thế tuyệt đối.</p>\n\n<h3 class="wp-block-heading" id="h-power-bi-co-dễ-sử-dụng-khong"><strong>Power BI có dễ sử dụng không?</strong></h3>\n\n<p>Power BI được đánh giá là khá dễ tiếp cận đối với người mới học. Giao diện kéo-thả trực quan, nhiều thao tác tương tự Excel và hệ thống biểu đồ phong phú giúp người dùng nhanh chóng tạo được báo cáo cơ bản chỉ sau thời gian ngắn làm quen. Tuy nhiên, để xây dựng các dashboard chuyên nghiệp, tối ưu hiệu năng và viết DAX đúng chuẩn, người dùng vẫn cần thời gian học tập và thực hành. Nói cách khác, Power BI dễ bắt đầu nhưng cần rèn luyện để sử dụng thành thạo.</p>\n\n<h3 class="wp-block-heading" id="h-dể-sử-dụng-power-bi-co-cần-biết-code-khong"><strong>Để sử dụng Power BI có cần biết code không?</strong></h3>\n\n<p>Để sử dụng Power BI, người dùng không bắt buộc phải biết lập trình. Các thao tác cơ bản như kết nối dữ liệu, làm sạch dữ liệu và vẽ biểu đồ đều có thể thực hiện thông qua giao diện. Tuy nhiên, khi làm việc ở mức nâng cao, người dùng sẽ tiếp xúc với ngôn ngữ DAX và Power Query M. Đây không phải là lập trình truyền thống mà là ngôn ngữ công thức, tương đối dễ tiếp cận đối với người học phân tích dữ liệu. Vì vậy, Power BI có thể sử dụng mà không cần biết code, nhưng hiểu công thức và logic sẽ giúp bạn khai thác công cụ hiệu quả hơn rất nhiều.</p>\n\n<h2 class="wp-block-heading" id="h-tổng-kết"><span class="ez-toc-section" id="Tong_ket"></span><strong>Tổng kết</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Power BI không chỉ là công cụ vẽ biểu đồ mà còn là một nền tảng phân tích dữ liệu hoàn chỉnh, kết hợp giữa xử lý dữ liệu, mô hình hóa và phân tích động. Khi hiểu rõ vai trò của Power Query, DAX và Power BI Service, người dùng có thể xây dựng các báo cáo chính xác, dễ mở rộng và phù hợp với nhu cầu doanh nghiệp. UpNext hy vọng bài viết trên đã cung cấp cho bạn cái nhìn tổng quan về những khả năng và “tiềm năng” của Power BI.</p>\n\n</div>\n<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'backend-architecture',
      metaTitle: 'Cách sử dụng Power BI hiệu quả và các best practices cần biết',
      metaDescription:
        'Cách sử dụng Power BI từ cơ bản đến nâng cao: hướng dẫn tạo báo cáo, trực quan hóa dữ liệu, kết nối nguồn dữ liệu và phân tích hiệu quả.',
      viewCount: 8947,
      tags: ['Backend & Architecture', 'AI & Data', 'Cloud & AWS'],
    },
    {
      id: postSeedId(214),
      title:
        'Recap Swinburne Career Festival 2026: Khai phá “Thị trường việc làm ẩn” cùng UpNext và các chuyên gia',
      slug: 'recap-swinburne-career-festival-2026',
      imageUrl:
        'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 132,
      content:
        '<h1 class="page-title">Recap Swinburne Career Festival 2026: Khai phá &#8220;Thị trường việc làm ẩn&#8221; cùng UpNext và các chuyên gia</h1>\n\n<nav class="ct-breadcrumbs" data-source="default" ><span class="first-item"><a href="https://UpNext.com/blog/"><span>UpNext Blog</span></a><span class="ct-separator">/</span></span><span class="item-0"itemscope=""><a href="https://UpNext.com/blog/chuyen-mon-it/"><span>Chuyên môn IT</span></a><span class="ct-separator">/</span></span><span class="last-item" aria-current="page"><a href="https://UpNext.com/blog/chuyen-mon-it/su-kien-it/"><span>Sự kiện IT</span></a></span>\t\t\t</nav>\n</header>\n\t</div>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</div></figure>\n\n<div class="entry-content is-layout-flow">\n\t\t\t\n<nav>\n\n<ul class=\'ez-toc-list ez-toc-list-level-1 \' ><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-1" href="#Networking_%E2%80%9CInvisible_Job_Market%E2%80%9D_Khi_co_hoi_khong_nam_tren_job_board" >Networking &amp; “Invisible Job Market”: Khi cơ hội không nằm trên job board</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-2" href="#Hoat_dong_thuc_chien_CV_Check_Mock_Interview_va_Workshop_AI" >Hoạt động thực chiến: CV Check, Mock Interview và Workshop AI</a></li><li class=\'ez-toc-page-1 ez-toc-heading-level-2\'><a class="ez-toc-link ez-toc-heading-3" href="#Tong_ket_Thu_hep_khoang_cach_giua_Giang_duong_va_Doanh_nghiep" >Tổng kết: Thu hẹp khoảng cách giữa Giảng đường và Doanh nghiệp</a></li></ul>\n\n</nav></div>\n\n<p>Sự kiện <strong>Swinburne Career Festival 2026</strong> đã diễn ra đầy sôi động, thu hút hơn 200 sinh viên năm cuối thuộc các ngành Computer Science, Business và Media &amp; Communications vào ngày 27 tháng 3 vừa qua.&nbsp;</p>\n\n<p>Với sự góp mặt của 20 giảng viên cùng đại diện từ 19 doanh nghiệp hàng đầu, sự kiện không đơn thuần giúp sinh viên “tìm việc”, mà còn giúp họ hiểu cách thị trường vận hành và mình cần trở thành ai để bước vào đó.</p>\n\n<p>Cùng UpNext điểm lại những dấu ấn và bài học đắt giá từ sự kiện này:</p>\n\n<h2 class="wp-block-heading" id="h-networking-amp-invisible-job-market-khi-cơ-hội-khong-nằm-tren-job-board"><span class="ez-toc-section" id="Networking_%E2%80%9CInvisible_Job_Market%E2%80%9D_Khi_co_hoi_khong_nam_tren_job_board"></span><strong>Networking &amp; “Invisible Job Market”: Khi cơ hội không nằm trên job board</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Tâm điểm của buổi sáng là phiên thảo luận với chủ đề <strong>&#8220;Networking in the Invisible Job Market&#8221;</strong>. Các diễn giả đã thay đổi hoàn toàn định nghĩa về Networking: “không còn là những &#8220;giao dịch&#8221; ngắn hạn, mà là hành trình xây dựng một hệ sinh thái giá trị bền vững.”</p>\n\n<p>Thực tế cho thấy có đến <strong>80% cơ hội nghề nghiệp</strong> nằm ở &#8220;thị trường ẩn&#8221; &#8211; nơi các vị trí được lấp đầy thông qua sự tin tưởng và kết nối cá nhân trước khi được đăng tuyển công khai. Để bứt phá, sinh viên cần chuyển mình từ tâm thế thụ động sang tư duy của một <strong>&#8220;Người kiến tạo&#8221; (Builder)</strong>, lấy trải nghiệm thực tế làm nền tảng cho mọi mối quan hệ chuyên môn.</p>\n\n<h3 class="wp-block-heading" id="h-những-lời-khuyen-vang-từ-dan-diễn-giả"><strong>Những lời khuyên &#8220;vàng&#8221; từ dàn diễn giả:</strong></h3>\n\n<p>Ba góc nhìn &#8211; ba cách tiếp cận, nhưng cùng dẫn về một điểm chung:</p>\n\n<blockquote class="wp-block-quote is-layout-flow wp-block-quote-is-layout-flow">\n\n<p><strong>Networking là kỹ năng, không phải tính cách.</strong></p>\n\n</blockquote>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</figure>\n\n<ul class="wp-block-list">\n<li><strong>Anh Lê Tuấn Anh (Career Development Expert &#8211; Vietnam &amp; Asia-Pacific):</strong> <em>&#8220;Networking không phải là đặc quyền của những người hướng ngoại; đó là một kỹ năng mềm thiết yếu mà bất kỳ ai cũng cần làm chủ để mở ra những cánh cửa cơ hội mới, bất kể tính cách của bạn là gì.&#8221;</em></li>\n\n<li><strong>Chị Nguyễn Trần Diệu Hiếu (Career Service Provider):</strong> <em>&#8220;Đừng chỉ kết nối rộng, hãy học cách networking &#8216;thông minh.&#8217; Chìa khóa nằm ở việc dành thời gian nghiên cứu kỹ lưỡng và thấu hiểu đối phương để xây dựng một lộ trình tiếp cận cá nhân hóa.&#8221;</em></li>\n\n<li><strong>Anh Thắng Trần (Marketing Manager &#8211; UpNext):</strong> <em>&#8220;Mỗi lần gặp gỡ một chuyên gia là một cơ hội &#8216;vàng&#8217; trong 30 giây để thể hiện bản chất riêng. Đừng tìm kiếm kịch bản có sẵn; chính sự chân thành và tư duy sáng tạo mới giúp bạn gây ấn tượng mạnh mẽ với nhà tuyển dụng.&#8221;</em></li>\n</ul>\n\n<h2 class="wp-block-heading" id="h-hoạt-dộng-thực-chiến-cv-check-mock-interview-va-workshop-ai"><span class="ez-toc-section" id="Hoat_dong_thuc_chien_CV_Check_Mock_Interview_va_Workshop_AI"></span><strong>Hoạt động thực chiến: CV Check, Mock Interview và Workshop AI</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Bên cạnh những chia sẻ lý thuyết, sự kiện còn mang đến các khu vực trải nghiệm chuyên sâu, giúp sinh viên &#8220;chạm&#8221; gần hơn với yêu cầu thực tế của doanh nghiệp:</p>\n\n<h3 class="wp-block-heading" id="h-1-goc-tư-vấn-từ-UpNext-x-diaflow"><strong>1. Góc tư vấn từ UpNext x Diaflow</strong></h3>\n\n<p>Đội ngũ chuyên gia từ UpNext phối hợp cùng chị Mai Hương (AI Consultant, Account Manager tại Diaflow) đã tổ chức chuỗi hoạt động:</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</figure>\n\n<ul class="wp-block-list">\n<li><strong>CV Check &amp; Mock Interview:</strong> Chỉnh sửa hồ sơ năng lực và phỏng vấn thử, giúp các bạn sinh viên ngành Computer Science và Business tự tin hơn khi đối mặt với nhà tuyển dụng.</li>\n\n<li><strong>Workshop AI Automated Workflow:</strong> Giới thiệu cách ứng dụng AI vào quy trình làm việc tự động — một kỹ năng &#8220;sống còn&#8221; trong kỷ nguyên công nghệ số.</li>\n</ul>\n\n<h3 class="wp-block-heading" id="h-2-goc-tư-vấn-từ-topcv-x-doanh-nghiệp-mwg-amp-jollibee"><strong>2. Góc tư vấn từ TopCV x Doanh nghiệp (MWG &amp; Jollibee)</strong></h3>\n\n<p>Anh Nguyễn Minh Khôi (HR Specialist &#8211; MWG) và anh Nguyễn Minh Khoa (HRBP &#8211; Jollibee Vietnam) đã trực tiếp hướng dẫn sinh viên cách tối ưu hóa CV và chia sẻ những &#8220;insight&#8221; đắt giá về quy trình tuyển dụng tại các tập đoàn lớn.</p>\n\n<figure class="my-8 overflow-hidden rounded-xl shadow-md"><img src="https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1200&q=80" alt="UpNext Blog Illustration" class="w-full object-cover rounded-xl" /></figure>\n\n</figure>\n\n<h2 class="wp-block-heading" id="h-tổng-kết-thu-hẹp-khoảng-cach-giữa-giảng-dường-va-doanh-nghiệp"><span class="ez-toc-section" id="Tong_ket_Thu_hep_khoang_cach_giua_Giang_duong_va_Doanh_nghiep"></span><strong>Tổng kết: Thu hẹp khoảng cách giữa Giảng đường và Doanh nghiệp</strong><span class="ez-toc-section-end"></span></h2>\n\n<p>Swinburne Career Festival 2026 đã khép lại nhưng dư âm về tinh thần chủ động vẫn còn lan tỏa. Những câu chuyện &#8220;người thật việc thật&#8221; đã thắt chặt sợi dây liên kết giữa sinh viên Swinburne Vietnam và cộng đồng doanh nghiệp.</p>\n\n<p>Đối với các bạn sinh viên năm cuối, đây chính là &#8220;tấm vé thông hành&#8221; để tỏa sáng trong mắt các nhà tuyển dụng công nghệ. UpNext tự hào là cầu nối giúp các bạn không chỉ tìm thấy công việc mơ ước mà còn phát triển tư duy nghề nghiệp vững chắc trong thị trường đầy biến động.</p>\n\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n\n<p><strong>Về UpNext</strong>: UpNext là nền tảng tuyển dụng chuyên biệt cho ngành CNTT hàng đầu Việt Nam. Với sứ mệnh <em>&#8220;Excite the IT in Vietnam by Great Hiring&#8221;</em> và tầm nhìn <em>&#8220;Build you, then Build Impact&#8221;</em>, UpNext không chỉ kết nối nhân tài với những cơ hội nghề nghiệp tốt nhất mà còn đồng hành cùng cộng đồng IT thông qua các sự kiện, báo cáo thị trường và mạng lưới chuyên gia chuyên sâu.</p>\n\n<p>👉 <strong>Ghé thăm UpNext ngay để cập nhật các vị trí Tech mới nhất:</strong><a href="https://UpNext.com/"> https://UpNext.com/</a></p>\n\n</div>\n<div class="entry-tags is-width-constrained "><span class="ct-module-title">TAGS</span><div class="entry-tags-items"><a href="https://UpNext.com/blog/tag/career-path/" rel="tag"><span>#</span> Career Path</a><a href="https://UpNext.com/blog/tag/event/" rel="tag"><span>#</span> Event</a></div></div>\t\t\n\t\t\t\t\t\n\t\t<div class="ct-share-box is-width-constrained ct-hidden-sm" data-location="bottom" data-type="type-2" >\n\t\t\t<span class="ct-module-title">',
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'su-nghiep-developer',
      metaTitle:
        'Recap Swinburne Career Festival 2026: Khai phá “Thị trường việc làm ẩn” cùng ITviec và các chuyên gia',
      metaDescription:
        'Sự kiện Swinburne Career Festival 2026 đã diễn ra đầy sôi động, thu hút hơn 200 sinh viên năm cuối thuộc các ngành Computer Science, Business và Media',
      viewCount: 15826,
      tags: ['Career Path', 'Developer', 'Phỏng vấn IT'],
    },
    {
      id: postSeedId(215),
      title: 'Lộ trình 90 ngày để bước vào vai trò Data Analyst',
      slug: 'lo-trinh-90-ngay-data-analyst',
      content: buildArticle(
        'Lộ trình 90 ngày để bước vào vai trò Data Analyst',
        'Một lộ trình thực hành cho người mới muốn xây nền tảng dữ liệu, tạo portfolio và sẵn sàng ứng tuyển.',
        [
          {
            heading: '30 ngày đầu: xây nền SQL và dữ liệu sạch',
            body: 'Bắt đầu với SELECT, JOIN, window function và cách kiểm tra chất lượng dữ liệu. Mỗi tuần hãy hoàn thành một bài tập có dữ liệu thật để biến kiến thức thành phản xạ.',
          },
          {
            heading: 'Ngày 31–60: kể chuyện bằng dashboard',
            body: 'Chọn một câu hỏi kinh doanh rõ ràng, xác định chỉ số cần theo dõi và thiết kế dashboard ưu tiên khả năng ra quyết định thay vì chỉ nhiều biểu đồ.',
          },
          {
            heading: 'Ngày 61–90: hoàn thiện portfolio có ngữ cảnh',
            body: 'Mỗi case study nên nêu nguồn dữ liệu, giả định, cách xử lý, insight và hành động đề xuất. Đây là bằng chứng thuyết phục hơn một danh sách công cụ đã học.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ai-data-specialty',
      metaTitle: 'Lộ trình 90 ngày trở thành Data Analyst | UpNext',
      metaDescription:
        'Lộ trình thực hành 90 ngày gồm SQL, làm sạch dữ liệu, dashboard, portfolio và checklist ứng tuyển vị trí Data Analyst.',
      metaKeywords: 'data analyst, SQL, dashboard, portfolio dữ liệu, lộ trình data analyst',
      imageUrl:
        'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 45,
      viewCount: 15320,
      tags: ['AI & Data', 'Python', 'Big Data'],
    },
    {
      id: postSeedId(216),
      title: 'Checklist phỏng vấn System Design: từ làm rõ yêu cầu đến đánh đổi trade-off',
      slug: 'checklist-phong-van-system-design-2026',
      content: buildArticle(
        'Checklist phỏng vấn System Design',
        'Một khung trình bày trong 45 phút giúp bạn dẫn dắt cuộc trao đổi có cấu trúc thay vì vội vàng vẽ kiến trúc.',
        [
          {
            heading: 'Làm rõ bài toán trước khi thiết kế',
            body: 'Hỏi về người dùng, luồng chính, quy mô, độ trễ và những ràng buộc quan trọng. Một giả định đúng giúp phần còn lại của thiết kế nhất quán.',
          },
          {
            heading: 'Đi từ ước lượng đến kiến trúc',
            body: 'Ước lượng traffic, dữ liệu và tăng trưởng trước khi chọn cache, database hay hàng đợi. Hãy giải thích vì sao thành phần đó phù hợp với nhu cầu đã nêu.',
          },
          {
            heading: 'Nêu rõ trade-off và vận hành',
            body: 'Chủ động nói về consistency, điểm nghẽn, quan sát hệ thống, giới hạn chi phí và phương án mở rộng. Nhà tuyển dụng cần thấy cách bạn ra quyết định, không chỉ sơ đồ đẹp.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'phong-van-luong-thuong',
      metaTitle: 'Checklist phỏng vấn System Design cho Developer | UpNext',
      metaDescription:
        'Khung System Design từ làm rõ yêu cầu, ước lượng, kiến trúc đến trade-off và observability để tự tin hơn khi phỏng vấn.',
      metaKeywords: 'system design, phỏng vấn IT, kiến trúc hệ thống, trade-off',
      imageUrl:
        'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 16,
      viewCount: 27480,
      tags: ['Phỏng vấn IT', 'System Architecture', 'Developer'],
    },
    {
      id: postSeedId(217),
      title: 'Đàm phán lương IT khi nhận offer: 7 bước để tự tin và tôn trọng',
      slug: 'dam-phan-luong-it-khi-nhan-offer',
      content: buildArticle(
        'Đàm phán lương IT khi nhận offer',
        'Đàm phán hiệu quả không bắt đầu ở con số cuối cùng, mà ở dữ liệu, giá trị bạn tạo ra và một cuộc trao đổi minh bạch.',
        [
          {
            heading: 'Chuẩn bị một khoảng lương có cơ sở',
            body: 'Đối chiếu mặt bằng của vai trò, địa điểm, cấp độ và bộ kỹ năng. Hãy xác định mức kỳ vọng, mức chấp nhận được và các điều kiện khiến bạn linh hoạt.',
          },
          {
            heading: 'Định lượng impact thay vì chỉ liệt kê trách nhiệm',
            body: 'Nêu rõ sản phẩm, doanh thu, độ ổn định hay thời gian vận hành mà bạn đã cải thiện. Ví dụ cụ thể giúp đề xuất của bạn đáng tin cậy hơn.',
          },
          {
            heading: 'Trao đổi tổng đãi ngộ với tinh thần hợp tác',
            body: 'Lương cơ bản chỉ là một phần. Hãy cân nhắc thưởng, bảo hiểm, thời gian học, cổ phần và cơ hội phát triển trước khi phản hồi offer bằng email ngắn gọn, tích cực.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'phong-van-luong-thuong',
      metaTitle: 'Đàm phán lương IT khi nhận offer: 7 bước thực tế | UpNext',
      metaDescription:
        'Cách chuẩn bị range lương, trình bày giá trị, trao đổi total compensation và phản hồi offer chuyên nghiệp cho nhân sự IT.',
      metaKeywords: 'đàm phán lương IT, offer, lương developer, total compensation',
      imageUrl:
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 130,
      viewCount: 20175,
      tags: ['Lương IT', 'Career Path', 'Phỏng vấn IT'],
    },
    {
      id: postSeedId(218),
      title: 'Báo cáo thị trường IT: Kỹ năng được doanh nghiệp ưu tiên trong quý III/2026',
      slug: 'bao-cao-thi-truong-it-ky-nang-quy-3-2026',
      content: buildArticle(
        'Báo cáo thị trường IT quý III/2026',
        'Bức tranh nhu cầu tuyển dụng cho thấy AI/Data, Cloud và Backend tiếp tục là ba nhóm kỹ năng được quan tâm, nhưng doanh nghiệp đặt trọng tâm ngày càng lớn vào khả năng tạo tác động.',
        [
          {
            heading: 'AI/Data: từ công cụ đến năng lực giải quyết vấn đề',
            body: 'Các mô tả công việc không chỉ yêu cầu biết mô hình hay dashboard. Ứng viên cần cho thấy cách biến dữ liệu thành quyết định, có kiểm soát chất lượng và tuân thủ bảo mật.',
          },
          {
            heading: 'Cloud và Backend: ưu tiên độ tin cậy',
            body: 'Kinh nghiệm về observability, tối ưu chi phí, API đáng tin cậy và tự động hóa vận hành thường tạo khác biệt khi các đội ngũ cần mở rộng sản phẩm bền vững.',
          },
          {
            heading: 'Chọn kế hoạch upskill thực tế',
            body: 'Đọc JD để tìm phần giao nhau giữa nhu cầu thị trường và nền tảng hiện có của bạn. Chọn một năng lực có thể chứng minh bằng dự án thay vì học dàn trải quá nhiều công cụ.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.NEWS,
      categorySlug: 'bao-cao-thi-truong-it',
      metaTitle: 'Báo cáo thị trường IT quý III/2026 | UpNext',
      metaDescription:
        'Phân tích nhóm kỹ năng AI/Data, Cloud và Backend được doanh nghiệp ưu tiên, kèm gợi ý xây kế hoạch upskill có trọng tâm.',
      metaKeywords: 'thị trường IT 2026, tuyển dụng IT, kỹ năng AI, cloud, backend',
      imageUrl:
        'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 3,
      viewCount: 18965,
      tags: ['Báo cáo thị trường IT', 'Tuyển dụng IT', 'Xu hướng công nghệ'],
    },
    {
      id: postSeedId(219),
      title: 'Kubernetes production checklist: 12 điểm cần kiểm tra trước khi release',
      slug: 'kubernetes-production-checklist',
      content: buildArticle(
        'Kubernetes production checklist',
        'Release an toàn là kết quả của chuẩn bị kỹ trước khi triển khai, theo dõi sát trong lúc rollout và khả năng quay lui khi tín hiệu xấu xuất hiện.',
        [
          {
            heading: 'Thiết lập giới hạn và health check đúng',
            body: 'Khai báo request, limit, liveness và readiness dựa trên hành vi thực tế của dịch vụ. Những cấu hình này giúp scheduler hoạt động hợp lý và giảm rủi ro phát hành.',
          },
          {
            heading: 'Bảo vệ dữ liệu và bí mật',
            body: 'Kiểm tra backup, migration, secret rotation, phân quyền và đường lui của thay đổi schema trước khi đưa bản mới vào production.',
          },
          {
            heading: 'Quan sát rollout và chuẩn bị rollback',
            body: 'Theo dõi error rate, độ trễ, saturation và log nghiệp vụ. Rollback cần được diễn tập để đội ngũ có thể hành động nhanh thay vì tranh luận khi sự cố xảy ra.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'devops-cloud',
      metaTitle: 'Kubernetes production checklist trước khi release | UpNext',
      metaDescription:
        '12 điểm kiểm tra Kubernetes trước release: resource, health check, secret, backup, alerting, rollout và rollback.',
      metaKeywords: 'kubernetes, devops, production checklist, release, rollback',
      imageUrl:
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 64,
      viewCount: 8471,
      tags: ['DevOps', 'Cloud & AWS', 'System Architecture'],
    },
    {
      id: postSeedId(220),
      title: 'Tối ưu hiệu năng React: cách đọc và cải thiện Core Web Vitals',
      slug: 'toi-uu-hieu-nang-react-core-web-vitals',
      content: buildArticle(
        'Tối ưu hiệu năng React với Core Web Vitals',
        'Hiệu năng tốt cần được đo bằng trải nghiệm người dùng thật, sau đó cải thiện từng nút thắt có ảnh hưởng lớn nhất.',
        [
          {
            heading: 'Đọc LCP, INP và CLS theo hành trình người dùng',
            body: 'Không dừng ở một con số tổng. Hãy xác định trang, thiết bị và thao tác nào gây chậm để ưu tiên đúng vấn đề thay vì tối ưu mù quáng.',
          },
          {
            heading: 'Giảm JavaScript phải tải và thực thi',
            body: 'Tách bundle theo route, lazy load thành phần nặng, trì hoãn script không thiết yếu và kiểm tra dependency thường xuyên để giảm công việc của main thread.',
          },
          {
            heading: 'Đặt performance budget cho đội ngũ',
            body: 'Thiết lập ngưỡng cho bundle, ảnh và các chỉ số trải nghiệm trong CI. Khi hiệu năng trở thành tiêu chí chung, cải tiến sẽ bền hơn các đợt chữa cháy đơn lẻ.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'mobile-frontend',
      metaTitle: 'Tối ưu hiệu năng React và Core Web Vitals | UpNext',
      metaDescription:
        'Hướng dẫn đo và cải thiện LCP, INP, CLS với React: code splitting, lazy loading, tối ưu ảnh và performance budget.',
      metaKeywords: 'react performance, core web vitals, LCP, INP, CLS, frontend',
      imageUrl:
        'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 92,
      viewCount: 11604,
      tags: ['ReactJS', 'Developer', 'Agile & Scrum'],
    },
    {
      id: postSeedId(221),
      title: 'Hướng dẫn tối ưu hồ sơ UpNext để nhà tuyển dụng dễ tìm thấy bạn',
      slug: 'huong-dan-toi-uu-ho-so-upnext',
      content: buildArticle(
        'Hướng dẫn tối ưu hồ sơ UpNext',
        'Một hồ sơ rõ ràng giúp nhà tuyển dụng hiểu nhanh bạn đang làm gì, có thể tạo giá trị ở đâu và cách liên hệ phù hợp.',
        [
          {
            heading: 'Headline và kỹ năng phải phản ánh mục tiêu',
            body: 'Viết headline theo vai trò và thế mạnh cụ thể; chọn kỹ năng bạn đã sử dụng trong dự án thay vì liệt kê mọi công nghệ từng biết.',
          },
          {
            heading: 'Biến dự án thành bằng chứng năng lực',
            body: 'Mỗi dự án nên mô tả bài toán, phần việc của bạn, stack, kết quả và liên kết portfolio nếu có. Điều này giúp hồ sơ đáng tin cậy ngay cả khi kinh nghiệm còn ngắn.',
          },
          {
            heading: 'Cập nhật CV và quyền riêng tư định kỳ',
            body: 'Dùng phiên bản CV phù hợp vai trò đang tìm, kiểm tra trạng thái tìm việc và chỉ chia sẻ thông tin liên hệ theo mức riêng tư bạn mong muốn.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.FAQ,
      categorySlug: 'faq-huong-dan',
      metaTitle: 'Cách tối ưu hồ sơ UpNext để nhà tuyển dụng tìm thấy bạn',
      metaDescription:
        'FAQ tối ưu hồ sơ UpNext: headline, kỹ năng, dự án, CV, quyền riêng tư và trạng thái tìm việc.',
      metaKeywords: 'hồ sơ UpNext, CV IT, portfolio developer, tìm việc IT',
      imageUrl:
        'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 9,
      viewCount: 1879,
      tags: ['FAQ & Hướng dẫn', 'Tuyển dụng IT', 'Developer'],
    },
    {
      id: postSeedId(222),
      title: 'Recap UpNext Tech Career Day 2026: kết nối từ portfolio đến cơ hội việc làm',
      slug: 'recap-upnext-tech-career-day-2026',
      content: buildArticle(
        'Recap UpNext Tech Career Day 2026',
        'Một ngày hội nghề nghiệp nơi sinh viên và junior developer thực hành cách kể câu chuyện năng lực của mình thay vì chỉ gửi CV.',
        [
          {
            heading: 'Portfolio cần kể được quá trình giải quyết vấn đề',
            body: 'Các phiên workshop tập trung vào cách chọn dự án, mô tả quyết định kỹ thuật và trình bày kết quả có thể đo lường để người xem hiểu nhanh đóng góp cá nhân.',
          },
          {
            heading: 'Mock interview biến phản hồi thành kế hoạch luyện tập',
            body: 'Người tham gia nhận phản hồi về cách làm rõ yêu cầu, giao tiếp khi chưa biết câu trả lời và cách liên hệ kinh nghiệm thực tế với vị trí ứng tuyển.',
          },
          {
            heading: 'Networking bắt đầu bằng sự chuẩn bị',
            body: 'Năm bài học được nhắc lại là nghiên cứu trước, đặt câu hỏi cụ thể, ghi chú sau cuộc gặp, chia sẻ giá trị nhỏ và duy trì kết nối một cách tôn trọng.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.NEWS,
      categorySlug: 'su-kien-it-upnext',
      metaTitle: 'Recap UpNext Tech Career Day 2026 | UpNext',
      metaDescription:
        'Tổng kết UpNext Tech Career Day 2026 với workshop portfolio, mock interview và bài học networking cho nhân sự IT mới.',
      metaKeywords: 'UpNext Tech Career Day, sự kiện IT, portfolio, mock interview, networking',
      imageUrl:
        'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 27,
      viewCount: 6942,
      tags: ['Sự kiện IT', 'Tin tức UpNext', 'Career Path'],
    },
    {
      id: postSeedId(223),
      title: 'Từ Junior đến Tech Lead: kế hoạch phát triển năng lực trong 12 tháng',
      slug: 'tu-junior-den-tech-lead-trong-12-thang',
      content: buildArticle(
        'Từ Junior đến Tech Lead trong 12 tháng',
        'Thăng tiến bền vững đến từ năng lực kỹ thuật, ownership và khả năng giúp cả đội ra quyết định tốt hơn.',
        [
          {
            heading: 'Quý đầu: xây nền tảng và độ tin cậy',
            body: 'Hoàn thành công việc đúng hẹn, chủ động làm rõ yêu cầu, viết tài liệu ngắn và học cách theo dõi chất lượng sau khi tính năng được phát hành.',
          },
          {
            heading: 'Quý hai và ba: mở rộng ownership',
            body: 'Nhận trách nhiệm với một phần sản phẩm, đề xuất cải tiến có dữ liệu và hỗ trợ đồng đội thông qua review, pairing hay chia sẻ nội bộ.',
          },
          {
            heading: 'Quý cuối: chứng minh năng lực dẫn dắt',
            body: 'Kết nối ưu tiên kỹ thuật với mục tiêu kinh doanh, giao tiếp minh bạch với stakeholder và lưu lại minh chứng về tác động để trao đổi phát triển nghề nghiệp.',
          },
        ],
      ),
      status: PostStatus.PUBLISHED,
      type: PostType.BLOG,
      categorySlug: 'ung-tuyen-thang-tien',
      metaTitle: 'Lộ trình từ Junior đến Tech Lead trong 12 tháng | UpNext',
      metaDescription:
        'Kế hoạch phát triển kỹ thuật, ownership, mentoring và giao tiếp stakeholder cho mục tiêu trở thành Tech Lead.',
      metaKeywords: 'tech lead, career path, thăng tiến IT, mentoring, ownership',
      imageUrl:
        'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 184,
      viewCount: 14361,
      tags: ['Technical Lead', 'Career Path', 'Agile & Scrum'],
    },
    {
      id: postSeedId(224),
      title: 'Playbook onboarding developer trong 30 ngày đầu tiên',
      slug: 'playbook-onboarding-developer-30-ngay-dau',
      content: buildArticle(
        'Playbook onboarding developer trong 30 ngày đầu',
        'Bản nháp playbook giúp developer mới giảm thời gian bỡ ngỡ, có điểm kiểm tra rõ ràng và sớm tạo được giá trị cho đội ngũ.',
        [
          {
            heading: 'Tuần một: hiểu sản phẩm và thiết lập môi trường',
            body: 'Tạo bản đồ luồng người dùng, cài đặt môi trường phát triển, đọc tài liệu nền tảng và xác nhận kênh hỗ trợ khi gặp trở ngại.',
          },
          {
            heading: 'Tuần hai và ba: hoàn thành task đầu tiên',
            body: 'Chọn một task có phạm vi rõ, pair với đồng đội khi cần và ghi lại điều đã học từ review để rút ngắn vòng phản hồi tiếp theo.',
          },
          {
            heading: 'Tuần bốn: retrospective và kế hoạch 60 ngày',
            body: 'Cùng quản lý nhìn lại điều đã rõ, điều còn thiếu và mục tiêu tiếp theo. Onboarding tốt là cuộc đối thoại hai chiều, không phải danh sách việc phải đọc.',
          },
        ],
      ),
      status: PostStatus.DRAFT,
      type: PostType.BLOG,
      categorySlug: 'ky-nang-mem-dinh-huong',
      metaTitle: 'Playbook onboarding developer 30 ngày đầu | UpNext',
      metaDescription:
        'Bản nháp playbook onboarding 30/60/90 ngày cho developer: hiểu sản phẩm, thiết lập môi trường, task đầu tiên và feedback loop.',
      metaKeywords: 'onboarding developer, developer mới, 30 60 90 ngày, tech lead',
      imageUrl:
        'https://images.unsplash.com/photo-1515187029135-18ee286d815b?auto=format&fit=crop&w=1600&q=85',
      daysAgo: 12,
      viewCount: 0,
      tags: ['Developer', 'Technical Lead', 'Agile & Scrum'],
    },
  ];

  const postImageUrls = [
    ...postsData.map((post) => post.imageUrl),
    ...Object.values(HOME_POST_PRESENTATION_BY_SLUG).map((post) => post.imageUrl),
  ];
  if (new Set(postImageUrls).size !== postImageUrls.length) {
    throw new Error('Each seeded post must have a unique cover and thumbnail image.');
  }

  const upsertPostImage = async (slug: string, imageUrl: string) => {
    // A versioned filename refreshes old cached seed images without touching user uploads.
    const filename = `${slug}-${POST_IMAGE_SEED_VERSION}.jpg`;
    const filePath = path.join(uploadDir, filename);
    const canReuseLocalImage = fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
    const imageBuffer = canReuseLocalImage
      ? fs.readFileSync(filePath)
      : await fetchImageBuffer(imageUrl);

    console.log(`${canReuseLocalImage ? 'Reusing' : 'Downloading'} JPEG for: ${slug}`);
    if (!canReuseLocalImage) {
      fs.writeFileSync(filePath, imageBuffer);
    }

    return prisma.fileAsset.upsert({
      where: { id: uuidFromSeed(`post-thumbnail:${slug}`) },
      update: {
        ownerType: 'post_seed',
        ownerId: null,
        purpose: FilePurpose.POST_THUMBNAIL,
        visibility: FileVisibility.PUBLIC,
        storageKey: `uploads/posts/${filename}`,
        originalName: filename,
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(imageBuffer.length),
        publicUrl: `${appBackendUrl}/uploads/posts/${filename}`,
      },
      create: {
        id: uuidFromSeed(`post-thumbnail:${slug}`),
        ownerType: 'post_seed',
        purpose: FilePurpose.POST_THUMBNAIL,
        visibility: FileVisibility.PUBLIC,
        storageKey: `uploads/posts/${filename}`,
        originalName: filename,
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(imageBuffer.length),
        publicUrl: `${appBackendUrl}/uploads/posts/${filename}`,
      },
    });
  };

  let countCreated = 0;
  for (let idx = 0; idx < postsData.length; idx++) {
    const postItem = postsData[idx];
    const catInfo = categoriesMap[postItem.categorySlug];
    if (!catInfo) {
      throw new Error(`Missing post category for slug: ${postItem.categorySlug}`);
    }

    const tagIds = postItem.tags.map((tn) => tagsMap[tn]).filter(Boolean);
    if (tagIds.length !== postItem.tags.length) {
      const missingTags = postItem.tags.filter((tagName) => !tagsMap[tagName]);
      throw new Error(`Missing post tags: ${missingTags.join(', ')}`);
    }

    const daysAgo = postItem.daysAgo;
    const createdAt = addDays(seedReferenceDate, -daysAgo);
    const updatedAt = addDays(createdAt, Math.min(7, Math.floor(daysAgo / 30)));

    const imageUrl = postItem.imageUrl;
    console.log(`[${idx + 1}/${postsData.length}]`);
    const thumbnailFileAsset = await upsertPostImage(postItem.slug, imageUrl);

    await prisma.post.upsert({
      where: { slug: postItem.slug },
      update: {
        title: postItem.title,
        content: postItem.content,
        status: postItem.status,
        type: postItem.type,
        categoryId: catInfo.id,
        adminId: admin.id,
        thumbnailFileId: thumbnailFileAsset.id,
        coverImageFileId: thumbnailFileAsset.id,
        metaTitle: postItem.metaTitle,
        metaDescription: postItem.metaDescription,
        metaKeywords: postItem.metaKeywords ?? null,
        viewCount: postItem.viewCount ?? 0,
        createdAt,
        updatedAt,
        postTags: {
          deleteMany: {},
          create: tagIds.map((tid) => ({ tagId: tid })),
        },
      },
      create: {
        id: postItem.id,
        title: postItem.title,
        slug: postItem.slug,
        content: postItem.content,
        status: postItem.status,
        type: postItem.type,
        categoryId: catInfo.id,
        adminId: admin.id,
        thumbnailFileId: thumbnailFileAsset.id,
        coverImageFileId: thumbnailFileAsset.id,
        metaTitle: postItem.metaTitle,
        metaDescription: postItem.metaDescription,
        metaKeywords: postItem.metaKeywords ?? null,
        viewCount: postItem.viewCount ?? 0,
        createdAt,
        updatedAt,
        postTags: {
          create: tagIds.map((tid) => ({ tagId: tid })),
        },
      },
    });
    countCreated++;
  }

  const homePostImageSeeds = Object.entries(HOME_POST_PRESENTATION_BY_SLUG).map(
    ([slug, presentation]) => ({ slug, imageUrl: presentation.imageUrl }),
  );

  let demoPostsWithImages = 0;
  for (const homePostImageSeed of homePostImageSeeds) {
    const homePost = await prisma.post.findUnique({
      where: { slug: homePostImageSeed.slug },
      select: { id: true },
    });

    if (!homePost) continue;

    const imageFile = await upsertPostImage(homePostImageSeed.slug, homePostImageSeed.imageUrl);
    await prisma.post.update({
      where: { id: homePost.id },
      data: {
        thumbnailFileId: imageFile.id,
        coverImageFileId: imageFile.id,
      },
    });
    demoPostsWithImages++;
  }

  console.log(
    `\n✅ Đã khởi tạo thành công ${countCreated} bài viết cùng FileAsset thumbnail JPEG thực tế (${appBackendUrl}/uploads/posts/\${slug}-${POST_IMAGE_SEED_VERSION}.jpg) cho cả 3 danh mục cha!`,
  );
  console.log(`✅ Đã bổ sung thumbnail và cover cho ${demoPostsWithImages} bài viết demo.`);
  console.log('\n🎉 🎉 HOÀN THÀNH SEED BÀI VIẾT (POST SEED COMPLETED) 🎉 🎉');
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
