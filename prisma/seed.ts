/* eslint-disable */
import {
  ActorType,
  ApplicationStatus,
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
  Prisma,
  PrismaClient,
  ProfileVisibility,
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
    const reputationScore = index === 0 ? '95' : index === 1 ? '15' : index === 2 ? '35' : index === 3 ? '10' : '60';

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
    const coverUrl = Array.isArray(item.environmentImages) ? item.environmentImages[0] : null;

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
        publicUrl: coverUrl || 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=700&fit=crop&q=80',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
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

  throw new Error('prisma/data/companies_50_real_logo_dev.json is required for seeding real companies.');
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
      'Join us as a Data Engineer to design, construct, and maintain reliable data pipelines (ETL/ELT). You will help establish our data lakehouse to power analytics and LLM matching engines.',
    requirements:
      '- 3+ years of experience in data engineering.\n- Proficient in Python, SQL, and big data technologies (Spark/Hadoop).\n- Experience with AWS services (S3, Redshift, Glue).',
    benefits:
      '- Continuous learning sponsorship.\n- Hybrid working mode.\n- 15 days of annual leave.',
  },
  'Cloud QA Specialist': {
    description:
      'We are looking for a QA Specialist with a cloud/infrastructure focus. You will build end-to-end automation test suites, integration tests, and performance load tests on AWS environments.',
    requirements:
      '- 3+ years in software quality assurance.\n- Strong automation experience with Cypress, Selenium, or Playwright.\n- Solid understanding of CI/CD pipelines & basic cloud networking.',
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
      'Design and deploy AI features into our core product. You will tune open-source LLMs, build RAG pipelines for resume matching, and optimize model inference times.',
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

  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);
  let htmlContent = '';
  let insideList = false;

  for (const line of lines) {
    if (line.startsWith('-')) {
      if (!insideList) {
        htmlContent += '<ul style="margin-top: 6px; margin-bottom: 6px; padding-left: 20px; list-style-type: disc;">';
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
      permissionCodes: ['jobs:moderate', 'jobs:view', 'reviews:moderate', 'posts:manage'],
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
      ],
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

  const companiesPath = path.join(__dirname, 'data/companies_detailed.json');
  let companiesWithLogo: any[] = [];
  if (fs.existsSync(companiesPath)) {
    try {
      const companiesData = JSON.parse(fs.readFileSync(companiesPath, 'utf-8')) as any[];
      companiesWithLogo = companiesData.filter(
        (item) => item.Slug && item.Name && item.Logo && typeof item.Logo === 'string' && item.Logo.trim() !== '',
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
      key
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
    updatedAt: new Date(asset.updatedAt)
  }));

  const existingCount = await prisma.fileAsset.count();
  console.log('FileAsset count in DB right before insert:', existingCount);
  if (existingCount > 0) {
    const existing = await prisma.fileAsset.findMany({ select: { id: true } });
    console.log('Existing FileAsset IDs in DB:', existing.map(x => x.id));
  }

  await prisma.fileAsset.createMany({
    data: fileAssetsData
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
    }))
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
    if (rec.email === 'hr@fptsoftware.com' || rec.email === 'admin@fptsoftware.com' || rec.email.includes('owner') || (!rec.email.includes('interviewer') && !rec.email.includes('recruiter@'))) {
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
    }))
  });

  const avatarUrls = [
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&q=80',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&q=80',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&q=80',
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
    })
  });

  await prisma.companyMember.createMany({
    data: recruiters.map((recruiter: any) => ({
      recruiterAccountId: recruiter.id,
      companyId: recruiter.companyId,
      roleId: seededRoles[recruiter.roleCode].id,
      createdAt: recruiter.createdAt,
      updatedAt: recruiter.createdAt,
    }))
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
    'Hoàng Kim Oanh'
  ];

  const candidates = Array.from({ length: 5 }, (_, index) => {
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

    const fullName = index < 10 ? detailedNames[index] : vietnameseNames[(index - 10) % vietnameseNames.length];
    return {
      index,
      accountId,
      profileId,
      cvId,
      cvVersionId,
      cvFileAssetId: null,
      fullName,
      email: index < 10
        ? `${SEED_EMAIL_PREFIX}${toAsciiUrl(fullName).replace(/[^a-z0-9]/g, '-')}.candidate@gmail.com`
        : `${SEED_EMAIL_PREFIX}${toAsciiUrl(fullName)}@gmail.com`,
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
        
        // Add FileAsset for candidate CV if present
        if (real.profile.cvFile) {
          const cvFile = real.profile.cvFile;
          fileAssetsToCreate.push({
            id: candidate.cvFileAssetId,
            ownerType: cvFile.ownerType,
            ownerId: candidate.accountId,
            purpose: 'CV',
            visibility: cvFile.visibility,
            storageKey: SEED_STORAGE_PREFIX + cvFile.storageKey,
            originalName: cvFile.originalName,
            mimeType: cvFile.mimeType,
            sizeBytes: BigInt(cvFile.sizeBytes),
            publicUrl: cvFile.publicUrl,
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
        description = 'Technical Lead với hơn 7 năm kinh nghiệm thiết kế hệ thống Microservices quy mô lớn. Có kiến thức chuyên sâu về Spring Boot, NestJS, gRPC, Message Broker (Kafka) và kiến trúc High Availability trên môi trường Cloud.';
        phoneNumber = '(+84) 93 444 5555';
        gender = Gender.MALE;
        birthdate = new Date('1994-02-18');
        jobSearchStatus = JobSearchStatus.NOT_LOOKING;
        address = 'Hồ Chí Minh, Việt Nam';
      } else if (idx === 6) {
        description = 'Engineering Manager có kỹ năng lãnh đạo xuất sắc và am hiểu Agile/Scrum. Quản lý thành công các dự án phần mềm đa quốc gia, tập trung vào nâng cao năng suất nhóm, phát triển con người và tối ưu hóa quy trình release.';
        phoneNumber = '(+84) 94 555 6666';
        gender = Gender.FEMALE;
        birthdate = new Date('1992-07-30');
        jobSearchStatus = JobSearchStatus.NOT_LOOKING;
        address = 'Hồ Chí Minh, Việt Nam';
      } else if (idx === 7) {
        description = 'QA Automation Engineer với 3 năm kinh nghiệm lập kịch bản test tự động bằng Selenium và Cypress. Chuyên sâu về API Testing, Performance Testing (JMeter) và tích hợp kiểm thử tự động vào quy trình CI/CD.';
        phoneNumber = '(+84) 95 666 7777';
        gender = Gender.MALE;
        birthdate = new Date('1997-09-08');
        jobSearchStatus = JobSearchStatus.OPEN_TO_WORK;
        address = 'Hà Nội, Việt Nam';
      } else if (idx === 8) {
        description = 'Mobile App Developer đam mê tạo ra các ứng dụng di động tuyệt đẹp và mượt mà trên iOS & Android. Thành thạo React Native, Flutter và Swift. Tích hợp tốt các dịch vụ RESTful API và lưu trữ offline.';
        phoneNumber = '(+84) 92 777 8888';
        gender = Gender.MALE;
        birthdate = new Date('1999-12-25');
        jobSearchStatus = JobSearchStatus.OPEN_TO_WORK;
        address = 'Hồ Chí Minh, Việt Nam';
      } else if (idx === 9) {
        description = 'Product Designer (UI/UX) với gu thẩm mỹ tinh tế và tư duy đặt người dùng làm trung tâm. Kinh nghiệm thực hiện nghiên cứu người dùng, thiết kế wireframes, prototypes và design systems đồng nhất trên Figma.';
        phoneNumber = '(+84) 98 888 9999';
        gender = Gender.FEMALE;
        birthdate = new Date('2000-05-14');
        jobSearchStatus = JobSearchStatus.OPEN_TO_WORK;
        address = 'Hồ Chí Minh, Việt Nam';
      } else {
        const roleIdx = idx % 8;
        if (roleIdx === 0) {
          description = 'Sinh viên năm cuối chuyên ngành Khoa học Máy tính, có kiến thức tốt về cấu trúc dữ liệu, giải thuật và lập trình backend (Node.js/Express). Đang tìm kiếm cơ hội thực tập để phát triển kỹ năng.';
        } else if (roleIdx === 1) {
          description = 'Frontend Developer mới tốt nghiệp. Đam mê thiết kế giao diện tinh tế, phản hồi nhanh và tối ưu hóa trải nghiệm người dùng. Thành thạo HTML, CSS, JavaScript và React.';
        } else if (roleIdx === 2) {
          description = 'Junior Fullstack Developer với hơn 1.5 năm kinh nghiệm thực tế phát triển các ứng dụng web bằng React và Node.js. Tư duy giải quyết vấn đề tốt và khả năng làm việc độc lập.';
        } else if (roleIdx === 3) {
          description = 'DevOps Engineer giàu kinh nghiệm trong thiết lập hạ tầng Cloud (AWS), tự động hóa quy trình CI/CD và triển khai ứng dụng bằng Docker/Kubernetes.';
        } else if (roleIdx === 4) {
          description = 'Senior AI & Data Engineer với hơn 5 năm kinh nghiệm. Chuyên sâu về Machine Learning, NLP và tích hợp các công nghệ Generative AI/LLMs vào sản phẩm thực tế.';
        } else if (roleIdx === 5) {
          description = 'Technical Lead với hơn 7 năm kinh nghiệm thiết kế kiến trúc hệ thống và dẫn dắt đội ngũ phát triển sản phẩm. Thế mạnh về Microservices, Cloud Computing và bảo mật.';
        } else if (roleIdx === 6) {
          description = 'Engineering Manager có kinh nghiệm quản lý và phát triển các đội nhóm kỹ thuật. Tối ưu hóa quy trình Agile/Scrum, kết nối các mục tiêu kinh doanh và công nghệ.';
        } else if (roleIdx === 7) {
          description = 'Chuyên viên QA/QC kiểm thử phần mềm, thành thạo lập kế hoạch test, viết test case, thực hiện cả Manual Testing và Automation Testing (Selenium, Cypress).';
        }
        phoneNumber = idx % 2 === 0 ? '(+84) 90 123 4567' : null;
        gender = idx % 2 === 0 ? Gender.MALE : Gender.FEMALE;
        birthdate = new Date(1996 + (idx % 8), idx % 12, (idx % 28) + 1);
        jobSearchStatus = idx % 3 === 0 ? JobSearchStatus.OPEN_TO_WORK : JobSearchStatus.NOT_LOOKING;
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
      source: candidate.realCandidate && candidate.realCandidate.profile.cvFile ? CvSource.UPLOAD : CvSource.BUILDER,
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
    5: ['TypeScript', 'React', 'NestJS', 'AWS', 'Node.js', 'SQL', 'PostgreSQL', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Java', 'Spring Boot'],
    6: ['Project Management', 'Agile/Scrum', 'TypeScript', 'React', 'NestJS', 'AWS', 'Docker', 'Git'],
    7: ['QA', 'QA Automation', 'Manual Testing', 'Cypress', 'Jest', 'TypeScript', 'JavaScript', 'Git', 'Postman'],
    8: ['React Native', 'Flutter', 'Swift', 'Java', 'Git', 'REST API', 'JavaScript', 'TypeScript'],
    9: ['Figma', 'UI/UX', 'Web Design', 'Mobile Design', 'Photoshop', 'Illustrator', 'HTML', 'CSS']
  };

  async function getOrCreateSkill(name: string, skillsMap: Record<string, any>, categories: Record<string, any>) {
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
        ['Hanoi University of Science and Technology', 'Hanoi University', 'Da Nang University of Technology'],
        ['Hanoi - Amsterdam High School for the Gifted', 'Le Hong Phong High School', 'Tran Dai Nghia High School']
      ];
      const majors = ['Software Engineering', 'Computer Science', 'Information Technology', 'Data Science & AI', 'UI/UX Design'];
      
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
          schoolName: idx % 2 === 0 ? 'FPT University' : 'Hanoi University of Science and Technology',
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

        const factor = sIdx === 0 ? 1.0 : sIdx === 1 ? 0.8 : sIdx === 2 ? 0.7 : sIdx === 3 ? 0.5 : 0.4;
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
          profLevel = maxProf === 'EXPERT' ? 'ADVANCED' : (maxProf === 'ADVANCED' ? 'INTERMEDIATE' : 'BEGINNER');
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
      const companiesList = ['FPT Software', 'VNG Corporation', 'Viettel Cyber Security', 'VinAI Research', 'One Mount Group', 'NashTech', 'Axon Active', 'CMC Global', 'Wayfu Studio'];
      const titlesList = ['Frontend Developer', 'Fullstack Developer', 'DevOps Engineer', 'AI Engineer', 'Senior Developer', 'Technical Lead', 'Scrum Master', 'QA Automation Engineer', 'Mobile Developer'];
      
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
          experienceSkillsToCreate.push({ id: randomUUID(), candidateExperienceId: expId, skillId: skillRecord.id });
        }
      });
    } else {
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
            description: `Designed microservices architectures, mentored junior developers, and streamlined CI/CD pipelines.`,
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
      const projectNames = ['Personal Portfolio Website', 'E-commerce Platform', 'Chat Realtime System', 'Smart IoT Dashboard', 'AI Smart Assistant'];
      projectsToCreate.push({
        id: randomUUID(),
        candidateProfileId: profileId,
        name: projectNames[idx % projectNames.length],
        role: idx === 9 ? 'UI/UX Designer' : 'Fullstack Developer',
        description: 'Dự án cá nhân nhằm áp dụng các công nghệ hiện đại để giải quyết bài toán quản lý và tối ưu hóa trải nghiệm người dùng.',
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

  const jobDefinitions = loadJobPostSeedData();

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
      create: { name: def.jobCategory.name }
    });

    // Upsert Experience Level
    const experienceLevel = await prisma.experienceLevel.upsert({
      where: { code: def.experienceLevel.code },
      update: { name: def.experienceLevel.name },
      create: { code: def.experienceLevel.code, name: def.experienceLevel.name }
    });

    // Upsert Employment Type
    const employmentType = await prisma.employmentType.upsert({
      where: { name: def.employmentType.name },
      update: {},
      create: { name: def.employmentType.name }
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
      createdAt: new Date(def.publishedAt) // set createdAt = publishedAt
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
      salaryMin: new Prisma.Decimal(job.salaryMin),
      salaryMax: new Prisma.Decimal(job.salaryMax),
      salaryCurrency: job.salaryCurrency,
      salaryPeriod: job.salaryPeriod as SalaryPeriod,
      salaryIsNegotiable: job.salaryIsNegotiable,
      salaryIsVisible: job.salaryIsVisible,
      vacanciesCount: job.vacanciesCount,
      status: job.status as JobStatus,
      moderationStatus: job.moderationStatus as ModerationStatus,
      moderationNote: job.moderationNote,
      reason: job.reason,
      publishedAt: job.publishedAt,
      expiredAt: job.expiredAt,
      createdAt: job.createdAt,
      updatedAt: job.createdAt
    }))
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
          address: loc.address
        }
      });
      await prisma.jobPostLocation.create({
        data: {
          jobPostId: job.id,
          jobLocationId: locId
        }
      });
    }
  }

  // Create Skills
  for (const job of jobs) {
    for (const sk of job.skills) {
      const skillRecord = await prisma.skill.upsert({
        where: { name: sk.name },
        update: {},
        create: { name: sk.name }
      });
      await prisma.jobPostSkill.create({
        data: {
          jobPostId: job.id,
          skillId: skillRecord.id,
          priority: (sk.priority === 'REQUIRED' ? 'REQUIRED' : 'NICE_TO_HAVE') as any,
          minYearsExperience: sk.minYearsExperience || null
        }
      });
    }
  }

  // Create Specializations
  for (const job of jobs) {
    for (const spec of job.specializations) {
      const specRecord = await prisma.specialization.upsert({
        where: { slug: spec.slug },
        update: { name: spec.name },
        create: { name: spec.name, slug: spec.slug }
      });
      await prisma.jobPostSpecialization.create({
        data: {
          jobPostId: job.id,
          specializationId: specRecord.id,
          isRequired: spec.isRequired
        }
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
        applicationId: hiredAlphaApp.id,
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
    (app) =>
      app.status === ApplicationStatus.INTERVIEWING && app.jobPost.companyId === gammaCompany.id,
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
    (app) => app.status === ApplicationStatus.HIRED && app.jobPost.companyId === deltaCompany.id,
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
    (app) =>
      app.status === ApplicationStatus.SUBMITTED && app.jobPost.companyId === deltaCompany.id,
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
    (app) => app.status === ApplicationStatus.REJECTED && app.jobPost.companyId === alphaCompany.id,
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
      createdAt: addDays(now, -5),
    },
  });

  const post2 = await prisma.post.create({
    data: {
      title: 'How AI is Revolutionizing Developer Hiring',
      slug: `${SEED_KEY}-how-ai-revolutionizing-hiring`,
      content:
        '<p>AI matching and mock interviews are transforming the recruitment pipeline, enabling companies to identify top technical talent more efficiently.</p>',
      status: 'PUBLISHED',
      type: 'NEWS',
      categoryId: hiringCategory.id,
      adminId: adminUser.id,
      metaTitle: 'How AI is Revolutionizing Developer Hiring | UpNext News',
      metaDescription:
        'Discover the latest trends in tech recruitment and how AI is helping recruiters find top developer talent.',
      metaKeywords: 'ai recruiting, developer hiring, recruitment automation',
      createdAt: addDays(now, -3),
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
      createdAt: addDays(now, -2),
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
      createdAt: addDays(now, -1),
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
      createdAt: addDays(now, -10),
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
      createdAt: addDays(now, -30),
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
      createdAt: addDays(now, -8),
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
      createdAt: addDays(now, -15),
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
    (item) => item.Slug && item.Name && item.Logo && typeof item.Logo === 'string' && item.Logo.trim() !== '',
  );
  const companiesToImport = companiesWithLogo.length >= 54
    ? companiesWithLogo.slice(4, 54)
    : companiesWithLogo.slice(0, Math.min(50, companiesWithLogo.length));

  console.log(`Loaded ${companiesData.length} companies. Importing ${companiesToImport.length} companies with logos and ${jobsData.jobs.length} jobs.`);

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
  const futureDeadline = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

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

    const urlParts = job.source.url.split('/');
    const jobSlug = urlParts[urlParts.length - 1];

    const jobDayOffset = (jobSlug.charCodeAt(0) || 0) % 30;
    const jobRecordDate = addDays(now, -jobDayOffset);

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
        publishedAt: jobRecordDate,
        createdAt: jobRecordDate,
        updatedAt: jobRecordDate,
        expiredAt: futureDeadline,
      },
    });

    if (job.locations && Array.isArray(job.locations)) {
      for (const location of job.locations) {
        let workingModel: WorkingModel = WorkingModel.ONSITE;
        if (location.workingModel === 'REMOTE') workingModel = WorkingModel.REMOTE;
        else if (location.workingModel === 'HYBRID') workingModel = WorkingModel.HYBRID;

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
    where: { slug: 'fpt-software' }
  });

  if (!fptSoftware) {
    console.log('[SEED] Warning: FPT Software company not found. Skipping custom seeding.');
    return;
  }

  const recruiterRole = await prisma.recruiterRole.findFirst({
    where: { code: 'OWNER' }
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
      companyId: fptSoftware.id,
      recruiterRoleId: recruiterRole.id,
    },
    create: {
      id: recruiterAccountId,
      email: 'duycc771@gmail.com',
      authProvider: 'GOOGLE',
      providerUserId: '105435843807834628979',
      companyId: fptSoftware.id,
      recruiterRoleId: recruiterRole.id,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    }
  });

  // 2. Create or link recruiter profile
  await prisma.recruiterProfile.upsert({
    where: { id: recruiterProfileId },
    update: {},
    create: {
      id: recruiterProfileId,
      recruiterAccountId: recruiterAccountId,
      fullName: 'Duy CC',
    }
  });

  // 3. Create or link company member
  await prisma.companyMember.upsert({
    where: {
      recruiterAccountId_companyId: {
        recruiterAccountId: recruiterAccountId,
        companyId: fptSoftware.id,
      }
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
    }
  });

  // 4. Update the original job post owner to duycc771
  const javaJob = await prisma.jobPost.findFirst({
    where: {
      companyId: fptSoftware.id,
      slug: 'fpt-software-senior-java-backend-engineer'
    }
  });

  const createdJobs = [];
  if (javaJob) {
    await prisma.jobPost.update({
      where: { id: javaJob.id },
      data: { createdByRecruiterId: recruiterAccountId }
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
    }
  ];

  for (const jobDef of customJobsData) {
    const category = await prisma.jobCategory.findFirst({ where: { name: jobDef.categoryName } });
    const expLevel = await prisma.experienceLevel.findFirst({ where: { code: jobDef.expCode } });
    const empType = await prisma.employmentType.findFirst({ where: { name: jobDef.empName } });
    const spec = await prisma.specialization.findFirst({ where: { slug: jobDef.specialization } });

    if (!category || !expLevel || !empType) {
      console.log(`[SEED] Warning: Relational metadata not found for job ${jobDef.title}. Skipping.`);
      continue;
    }

    let job = await prisma.jobPost.findUnique({
      where: { slug: jobDef.slug }
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
          salaryMin: new Prisma.Decimal(jobDef.salaryMin),
          salaryMax: new Prisma.Decimal(jobDef.salaryMax),
          salaryCurrency: 'VND',
          salaryPeriod: 'MONTH',
          salaryIsNegotiable: true,
          salaryIsVisible: true,
          vacanciesCount: 2,
          status: 'PUBLISHED',
          moderationStatus: 'APPROVED',
          publishedAt: new Date(),
          expiredAt: addDays(new Date(), 45),
        }
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
          workingModel: WorkingModel.HYBRID,
        }
      });

      await prisma.jobPostLocation.create({
        data: {
          jobPostId: job.id,
          jobLocationId: locId,
        }
      });

      // Create specialization
      if (spec) {
        await prisma.jobPostSpecialization.create({
          data: {
            jobPostId: job.id,
            specializationId: spec.id,
            isRequired: true,
          }
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
            categoryId: skillCategory ? skillCategory.id : (await prisma.skillCategory.findFirst())!.id,
          }
        });

        await prisma.jobPostSkill.create({
          data: {
            jobPostId: job.id,
            skillId: skill.id,
            priority: 'REQUIRED',
          }
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
  console.log(`[SEED] Loading ${candidatesData.length} static candidate records from candidates.json.`);

  const cvDir = path.join(process.cwd(), 'uploads', 'cv');
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
        where: { email: emailAddr }
      });

      if (!candidateAccount) {
        candidateAccount = await prisma.candidateAccount.create({
          data: {
            fullName,
            email: emailAddr,
            passwordHash,
            candidateAccountStatus: 'ACTIVE',
            emailVerifiedAt: new Date(),
          }
        });
      }

      let candidateProfile = await prisma.candidateProfile.findUnique({
        where: { candidateAccountId: candidateAccount.id }
      });

      if (!candidateProfile) {
        candidateProfile = await prisma.candidateProfile.create({
          data: {
            candidateAccountId: candidateAccount.id,
            jobSearchStatus: 'OPEN_TO_WORK',
            profileVisibility: 'PUBLIC',
          }
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
          purpose: FilePurpose.CV
        }
      });

      if (!fileAsset) {
        const publicUrl = `http://localhost:3001/uploads/cv/${cleanFileName}`;
        fileAsset = await prisma.fileAsset.create({
          data: {
            ownerType: 'candidate_cv',
            ownerId: candidateProfile.id,
            purpose: FilePurpose.CV,
            visibility: FileVisibility.PUBLIC,
            storageKey: `uploads/cv/${cleanFileName}`,
            originalName,
            mimeType: 'application/pdf',
            sizeBytes: BigInt(actualSize),
            publicUrl,
          }
        });
      }

      let cvRecord = await prisma.cV.findFirst({
        where: { candidateProfileId: candidateProfile.id }
      });

      if (!cvRecord) {
        cvRecord = await prisma.cV.create({
          data: {
            candidateProfileId: candidateProfile.id,
            title: `CV - ${fullName}`,
            source: CvSource.UPLOAD,
            status: CvStatus.ACTIVE,
            isDefault: true,
          }
        });
      }

      let cvVersion = await prisma.cVVersion.findFirst({
        where: { cvId: cvRecord.id }
      });

      if (!cvVersion) {
        cvVersion = await prisma.cVVersion.create({
          data: {
            cvId: cvRecord.id,
            sourceFileId: fileAsset.id,
            versionNo: 1,
            parsedText: parsedText || null,
          }
        });
      }

      seededCandidates.push({
        profileId: candidateProfile.id,
        cvVersionId: cvVersion.id,
        fullName
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
            candidateProfileId: candidate.profileId
          }
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
              submittedAt
            }
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
                recruiterNote: 'Phỏng vấn kỹ thuật trao đổi chi tiết'
              }
            });
            interviewCreatedCount++;
          }

          applicationSuccessCount++;
        }
      } catch (err) {
        console.error(`[SEED] Failed to create application for candidate ${candidate.fullName} and job ${job.title}:`, err);
      }
    }
  }

  console.log(`[SEED] Successfully seeded ${seededCandidates.length} candidate accounts.`);
  console.log(`[SEED] Successfully created ${applicationSuccessCount} applications across ${createdJobs.length} jobs.`);
  console.log(`[SEED] Successfully created ${interviewCreatedCount} mock interviews.`);
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
