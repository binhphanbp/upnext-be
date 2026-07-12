/* eslint-disable */
/**
 * Standalone seed: populate a rich, fully-usable RECRUITER identity for
 * pductoandev@gmail.com on the LOCAL dev database.
 *
 * Idempotent: re-running upserts the same records (fixed UUIDs / unique keys).
 * Run with:  pnpm tsx prisma/seed-toan.ts
 */
import {
  AccountStatus,
  ApplicationStatus,
  CompanyStatus,
  CompanyType,
  CompanyVerificationStatus,
  CvSource,
  CvStatus,
  Gender,
  InterviewResult,
  InterviewStatus,
  InterviewType,
  JobStatus,
  ModerationStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  SalaryPeriod,
  SkillPriority,
  SubscriptionStatus,
  WorkingModel,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import 'dotenv/config';

const TARGET_EMAIL = 'pductoandev@gmail.com';
const PASSWORD = 'Password123!';

/** Deterministic UUIDs so re-runs upsert instead of duplicating. */
const uid = (n: number) => `a0d70a11-0000-4000-8000-${String(n).padStart(12, '0')}`;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in the environment (.env).');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const addDays = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000);

async function main() {
  const now = new Date();
  const passwordHash = await hash(PASSWORD, 10);

  console.log(`Seeding data for recruiter: ${TARGET_EMAIL}`);

  // ── 1. Reference data (upsert by unique name/code) ────────────────────────
  const employmentType = await prisma.employmentType.upsert({
    where: { name: 'Toàn thời gian' },
    update: {},
    create: { name: 'Toàn thời gian' },
  });
  const experienceLevel = await prisma.experienceLevel.upsert({
    where: { code: 'mid' },
    update: {},
    create: { code: 'mid', name: 'Middle' },
  });
  const jobCategory = await prisma.jobCategory.upsert({
    where: { name: 'Backend Developer' },
    update: {},
    create: { name: 'Backend Developer' },
  });
  const ownerRole = await prisma.recruiterRole.upsert({
    where: { code: 'OWNER' },
    update: {},
    create: { code: 'OWNER', name: 'Chủ sở hữu' },
  });

  // ── 2. Company (VERIFIED + ACTIVE) ────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { slug: 'toan-dev-company' },
    update: {
      verificationStatus: CompanyVerificationStatus.VERIFIED,
      status: CompanyStatus.ACTIVE,
    },
    create: {
      id: uid(1),
      name: 'Toàn Dev Company',
      slug: 'toan-dev-company',
      type: CompanyType.PRODUCT,
      taxCode: '0101234567',
      address: '123 Đường Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
      email: 'contact@toandev.vn',
      phone: '02839999999',
      website: 'https://toandev.vn',
      description:
        'Toàn Dev Company là công ty công nghệ chuyên phát triển sản phẩm SaaS cho thị trường tuyển dụng.',
      benefits: 'Lương thưởng cạnh tranh, bảo hiểm đầy đủ, review lương 2 lần/năm, làm việc hybrid.',
      companySize: '50-100',
      workingDays: 'Thứ 2 - Thứ 6',
      verificationStatus: CompanyVerificationStatus.VERIFIED,
      status: CompanyStatus.ACTIVE,
    },
  });

  // ── 3. Recruiter account (login-able) + profile + membership ──────────────
  const recruiter = await prisma.recruiterAccount.upsert({
    where: { email: TARGET_EMAIL },
    update: {
      companyId: company.id,
      recruiterRoleId: ownerRole.id,
      status: AccountStatus.ACTIVE,
      emailVerifiedAt: now,
      passwordHash,
    },
    create: {
      id: uid(2),
      email: TARGET_EMAIL,
      companyId: company.id,
      recruiterRoleId: ownerRole.id,
      passwordHash,
      status: AccountStatus.ACTIVE,
      emailVerifiedAt: now,
    },
  });

  const recruiterProfile = await prisma.recruiterProfile.upsert({
    where: { recruiterAccountId: recruiter.id },
    update: { fullName: 'Phan Đức Toàn', phoneNumber: '0912345678', gender: Gender.MALE },
    create: {
      id: uid(3),
      recruiterAccountId: recruiter.id,
      fullName: 'Phan Đức Toàn',
      phoneNumber: '0912345678',
      gender: Gender.MALE,
    },
  });

  await prisma.companyMember.upsert({
    where: { id: uid(4) },
    update: { roleId: ownerRole.id, status: 'ACTIVE' },
    create: {
      id: uid(4),
      recruiterAccountId: recruiter.id,
      companyId: company.id,
      roleId: ownerRole.id,
      status: 'ACTIVE',
    },
  });

  // ── 4. Subscription plan + active subscription + paid invoice ─────────────
  let plan = await prisma.subscriptionPlan.findFirst({ where: { subscriptionName: 'Premium' } });
  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        id: uid(5),
        subscriptionName: 'Premium',
        price: 2_000_000,
        durationDays: 30,
        jobPostLimit: 50,
        boostCreditLimit: 10,
        status: SubscriptionStatus.ACTIVE,
      },
    });
  }

  await prisma.companySubscription.upsert({
    where: { id: uid(6) },
    update: { status: SubscriptionStatus.ACTIVE, expiredAt: addDays(now, 30) },
    create: {
      id: uid(6),
      planId: plan.id,
      companyId: company.id,
      jobPostLimit: 50,
      jobPostUsed: 0,
      boostCreditTotal: 10,
      startedAt: now,
      expiredAt: addDays(now, 30),
      status: SubscriptionStatus.ACTIVE,
    },
  });

  await prisma.invoice.upsert({
    where: { invoiceCode: 'INV-TOANDEV-0001' },
    update: { paymentStatus: PaymentStatus.PAID, paidAt: now },
    create: {
      id: uid(7),
      subscriptionPlanId: plan.id,
      companyId: company.id,
      invoiceCode: 'INV-TOANDEV-0001',
      amount: 2_000_000,
      paymentMethod: PaymentMethod.MOMO,
      paymentStatus: PaymentStatus.PAID,
      paidAt: now,
    },
  });

  // ── 5. Job posts (PUBLISHED) + location + skills ──────────────────────────
  const jobDefs = [
    {
      title: 'Senior Backend Engineer (NestJS)',
      slug: 'toandev-senior-backend-nestjs',
      salaryMin: 30_000_000,
      salaryMax: 45_000_000,
      skills: ['NestJS', 'PostgreSQL', 'TypeScript', 'Docker'],
    },
    {
      title: 'Frontend Developer (React/Next.js)',
      slug: 'toandev-frontend-react-next',
      salaryMin: 20_000_000,
      salaryMax: 35_000_000,
      skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
    },
    {
      title: 'DevOps Engineer',
      slug: 'toandev-devops-engineer',
      salaryMin: 28_000_000,
      salaryMax: 42_000_000,
      skills: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD'],
    },
    {
      title: 'Fullstack Developer',
      slug: 'toandev-fullstack-developer',
      salaryMin: 22_000_000,
      salaryMax: 38_000_000,
      skills: ['Node.js', 'React', 'Prisma', 'PostgreSQL'],
    },
    {
      title: 'QA Automation Engineer',
      slug: 'toandev-qa-automation',
      salaryMin: 18_000_000,
      salaryMax: 30_000_000,
      skills: ['Cypress', 'Selenium', 'JavaScript', 'JMeter'],
    },
  ];

  const jobPostIds: string[] = [];
  for (let i = 0; i < jobDefs.length; i++) {
    const def = jobDefs[i];
    const jobPostId = uid(100 + i);
    jobPostIds.push(jobPostId);

    await prisma.jobPost.upsert({
      where: { slug: def.slug },
      update: { status: JobStatus.PUBLISHED, moderationStatus: ModerationStatus.APPROVED },
      create: {
        id: jobPostId,
        createdByRecruiterId: recruiter.id,
        companyId: company.id,
        jobCategoryId: jobCategory.id,
        experienceLevelId: experienceLevel.id,
        employmentTypeId: employmentType.id,
        title: def.title,
        slug: def.slug,
        description: `Chúng tôi đang tìm kiếm ${def.title} tài năng gia nhập Toàn Dev Company.`,
        requirements: 'Có kinh nghiệm thực chiến, chủ động, teamwork tốt.',
        benefits: 'Lương thưởng hấp dẫn, môi trường trẻ, cơ hội phát triển.',
        salaryMin: def.salaryMin,
        salaryMax: def.salaryMax,
        salaryCurrency: 'VND',
        salaryPeriod: SalaryPeriod.MONTH,
        salaryIsVisible: true,
        vacanciesCount: 2,
        status: JobStatus.PUBLISHED,
        moderationStatus: ModerationStatus.APPROVED,
        publishedAt: now,
        expiredAt: addDays(now, 45),
      },
    });

    // location
    const locationId = uid(200 + i);
    await prisma.companyLocation.upsert({
      where: { id: locationId },
      update: {},
      create: {
        id: locationId,
        companyId: company.id,
        country: 'Vietnam',
        workingModel: WorkingModel.HYBRID,
        city: 'TP. Hồ Chí Minh',
        district: 'Quận 1',
        address: '123 Đường Nguyễn Huệ',
      },
    });
    await prisma.jobPostLocation.upsert({
      where: { jobPostId_jobLocationId: { jobPostId, jobLocationId: locationId } },
      update: {},
      create: { jobPostId, jobLocationId: locationId },
    });

    // skills
    for (const skillName of def.skills) {
      const skill = await prisma.skill.upsert({
        where: { name: skillName },
        update: {},
        create: { name: skillName },
      });
      await prisma.jobPostSkill.upsert({
        where: { jobPostId_skillId: { jobPostId, skillId: skill.id } },
        update: {},
        create: { jobPostId, skillId: skill.id, priority: SkillPriority.REQUIRED },
      });
    }
  }

  // ── 6. Candidate accounts + profiles + CVs (to power applications) ────────
  const candidateDefs = [
    { name: 'Nguyễn Văn An', email: 'candidate.an@seed.dev' },
    { name: 'Trần Thị Bình', email: 'candidate.binh@seed.dev' },
    { name: 'Lê Hoàng Cường', email: 'candidate.cuong@seed.dev' },
    { name: 'Phạm Thu Dung', email: 'candidate.dung@seed.dev' },
    { name: 'Đỗ Minh Đức', email: 'candidate.duc@seed.dev' },
  ];

  const candidateProfiles: { profileId: string; cvVersionId: string }[] = [];
  for (let i = 0; i < candidateDefs.length; i++) {
    const def = candidateDefs[i];
    const account = await prisma.candidateAccount.upsert({
      where: { email: def.email },
      update: { fullName: def.name, emailVerifiedAt: now },
      create: {
        id: uid(300 + i),
        fullName: def.name,
        email: def.email,
        passwordHash,
        candidateAccountStatus: AccountStatus.ACTIVE,
        emailVerifiedAt: now,
      },
    });

    const profile = await prisma.candidateProfile.upsert({
      where: { candidateAccountId: account.id },
      update: {},
      create: {
        id: uid(400 + i),
        candidateAccountId: account.id,
        phoneNumber: `09000000${String(i).padStart(2, '0')}`,
        gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
        address: 'TP. Hồ Chí Minh',
        description: `Ứng viên ${def.name}, đam mê công nghệ.`,
      },
    });

    const cvId = uid(500 + i);
    await prisma.cV.upsert({
      where: { id: cvId },
      update: {},
      create: {
        id: cvId,
        candidateProfileId: profile.id,
        title: `${def.name} - CV`,
        source: CvSource.BUILDER,
        status: CvStatus.ACTIVE,
        isDefault: true,
      },
    });

    const cvVersionId = uid(600 + i);
    await prisma.cVVersion.upsert({
      where: { id: cvVersionId },
      update: {},
      create: {
        id: cvVersionId,
        cvId,
        versionNo: 1,
        parsedText: `HỌ VÀ TÊN: ${def.name}\nĐịa chỉ: TP. Hồ Chí Minh\nKỹ năng: NestJS, React, PostgreSQL`,
      },
    });

    candidateProfiles.push({ profileId: profile.id, cvVersionId });
  }

  // ── 7. Applications across job posts with varied statuses ─────────────────
  const statuses: ApplicationStatus[] = [
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.VIEWED,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.INTERVIEWING,
    ApplicationStatus.HIRED,
    ApplicationStatus.REJECTED,
  ];

  let appCount = 0;
  const createdApplications: { id: string; status: ApplicationStatus }[] = [];
  for (let c = 0; c < candidateProfiles.length; c++) {
    // each candidate applies to the first 3 job posts
    for (let j = 0; j < 3; j++) {
      const cand = candidateProfiles[c];
      const jobPostId = jobPostIds[j];
      const status = statuses[(c + j) % statuses.length];
      const applicationId = uid(700 + appCount);

      await prisma.application.upsert({
        where: {
          candidateProfileId_jobPostId: { candidateProfileId: cand.profileId, jobPostId },
        },
        update: { status },
        create: {
          id: applicationId,
          jobPostId,
          candidateProfileId: cand.profileId,
          cvVersionId: cand.cvVersionId,
          coverLetter: 'Tôi rất mong muốn được gia nhập công ty.',
          status,
          submittedAt: addDays(now, -((c + j) % 10)),
        },
      });
      createdApplications.push({ id: applicationId, status });
      appCount++;
    }
  }

  // ── 8. Interviews for applications currently at the INTERVIEWING stage ────
  const interviewingApplications = createdApplications.filter(
    (app) => app.status === ApplicationStatus.INTERVIEWING,
  );

  let interviewCount = 0;
  for (const app of interviewingApplications) {
    const interviewId = uid(800 + interviewCount);
    const interviewDate = addDays(now, 3 + interviewCount);
    interviewDate.setHours(10, 0, 0, 0);
    const type = interviewCount % 2 === 0 ? InterviewType.ONLINE : InterviewType.ONSITE;

    await prisma.interview.upsert({
      where: { id: interviewId },
      update: {},
      create: {
        id: interviewId,
        recruiterProfileId: recruiterProfile.id,
        applicationId: app.id,
        interviewRound: 1,
        type,
        scheduledStartAt: interviewDate,
        scheduledEndAt: new Date(interviewDate.getTime() + 60 * 60 * 1000),
        meetingUrl: type === InterviewType.ONLINE ? 'https://meet.google.com/toandev-mock' : null,
        location:
          type === InterviewType.ONSITE ? '123 Đường Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh' : null,
        recruiterNote: 'Phỏng vấn vòng 1 với recruiter.',
        status: InterviewStatus.SCHEDULED,
        result: InterviewResult.PENDING,
      },
    });
    interviewCount++;
  }

  console.log('─────────────────────────────────────────────');
  console.log('✅ Seed hoàn tất cho', TARGET_EMAIL);
  console.log(`   Mật khẩu đăng nhập: ${PASSWORD}`);
  console.log(`   Công ty: ${company.name} (đã VERIFIED)`);
  console.log(`   Job posts: ${jobPostIds.length}`);
  console.log(`   Ứng viên: ${candidateProfiles.length} · Đơn ứng tuyển: ${appCount}`);
  console.log(`   Lịch phỏng vấn: ${interviewCount}`);
  console.log('─────────────────────────────────────────────');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
