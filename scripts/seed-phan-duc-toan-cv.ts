import {
  AuthProvider,
  CvSource,
  CvStatus,
  DiscoveryIndexStatus,
  FilePurpose,
  FileVisibility,
  Gender,
  JobSearchStatus,
  PrismaClient,
  ProfileVisibility,
  CandidateContactPreferenceStatus,
  ProficiencyLevel,
  WorkingModel,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const SOURCE_PDF =
  'C:\\Users\\toan\\.gemini\\antigravity-ide\\brain\\cb2b18dc-1416-4d31-a63e-a7fa4ae5a144\\.user_uploaded\\media_1788385304863.pdf';
const TARGET_DIR = path.resolve(process.cwd(), 'uploads', 'cv');
const TARGET_FILENAME = 'PhanDucToan_CV.pdf';
const TARGET_PATH = path.join(TARGET_DIR, TARGET_FILENAME);
const STORAGE_KEY = `uploads/cv/${TARGET_FILENAME}`;
const APP_BACKEND_URL = (process.env.APP_BACKEND_URL || 'http://localhost:3636').replace(/\/+$/, '');
const PUBLIC_URL = `${APP_BACKEND_URL}/${STORAGE_KEY}`;

async function main() {
  console.log('--- Seeding candidate: Phan Đức Toàn ---');

  // 1. Copy PDF to uploads/cv/
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  if (fs.existsSync(SOURCE_PDF)) {
    fs.copyFileSync(SOURCE_PDF, TARGET_PATH);
    console.log(`Copied ${SOURCE_PDF} -> ${TARGET_PATH}`);
  } else {
    console.warn(`Source PDF not found at ${SOURCE_PDF}, checking if target already exists...`);
    if (!fs.existsSync(TARGET_PATH)) {
      throw new Error(`Neither source PDF nor target PDF found.`);
    }
  }

  const fileStats = fs.statSync(TARGET_PATH);
  const sizeBytes = fileStats.size;

  // 2. Upsert CandidateAccount
  const email = 'pductoandev@gmail.com';
  const fullName = 'Phan Đức Toàn';
  const passwordHash = await hash('Password123!', 10);

  const account = await prisma.candidateAccount.upsert({
    where: { email },
    update: {
      fullName,
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      fullName,
      passwordHash,
      authProvider: AuthProvider.DEFAULT,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Account ID: ${account.id}`);

  // 3. Upsert CandidateProfile
  const profile = await prisma.candidateProfile.upsert({
    where: { candidateAccountId: account.id },
    update: {
      phoneNumber: '0916 110 241',
      gender: Gender.MALE,
      address: 'Quận Gò Vấp, TP.HCM',
      preferredSearchCity: 'Hồ Chí Minh',
      birthdate: new Date('2004-06-15'),
      description:
        'Định hướng Backend Developer với kinh nghiệm dự án qua PHP/Laravel và Vue.js. Sở hữu kỹ năng giải quyết vấn đề và tinh thần tự học cao. Mong muốn thực tập để đóng góp giá trị cho doanh nghiệp và đồng hành lâu dài cùng sự phát triển của công ty.',
      jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
      profileVisibility: ProfileVisibility.PUBLIC,
      updatedAt: new Date(),
    },
    create: {
      candidateAccountId: account.id,
      phoneNumber: '0916 110 241',
      gender: Gender.MALE,
      address: 'Quận Gò Vấp, TP.HCM',
      preferredSearchCity: 'Hồ Chí Minh',
      birthdate: new Date('2004-06-15'),
      description:
        'Định hướng Backend Developer với kinh nghiệm dự án qua PHP/Laravel và Vue.js. Sở hữu kỹ năng giải quyết vấn đề và tinh thần tự học cao. Mong muốn thực tập để đóng góp giá trị cho doanh nghiệp và đồng hành lâu dài cùng sự phát triển của công ty.',
      jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
      profileVisibility: ProfileVisibility.PUBLIC,
      updatedAt: new Date(),
    },
  });
  console.log(`Profile ID: ${profile.id}`);

  // 4. Create FileAsset for CV
  const existingFile = await prisma.fileAsset.findFirst({
    where: {
      storageKey: STORAGE_KEY,
    },
  });

  let fileAssetId = existingFile?.id;
  if (!existingFile) {
    const fileAsset = await prisma.fileAsset.create({
      data: {
        ownerType: 'CANDIDATE',
        ownerId: profile.id,
        purpose: FilePurpose.CV,
        visibility: FileVisibility.PUBLIC,
        storageKey: STORAGE_KEY,
        originalName: TARGET_FILENAME,
        mimeType: 'application/pdf',
        sizeBytes,
        publicUrl: PUBLIC_URL,
      },
    });
    fileAssetId = fileAsset.id;
  } else {
    await prisma.fileAsset.update({
      where: { id: existingFile.id },
      data: {
        publicUrl: PUBLIC_URL,
        sizeBytes,
        ownerId: profile.id,
      },
    });
  }

  // 5. Default CV record & CVVersion
  let cv = await prisma.cV.findFirst({
    where: { candidateProfileId: profile.id, isDefault: true },
  });

  if (!cv) {
    cv = await prisma.cV.create({
      data: {
        candidateProfileId: profile.id,
        title: 'CV Phan Đức Toàn - Backend Developer Intern',
        isDefault: true,
        source: CvSource.UPLOAD,
        status: CvStatus.ACTIVE,
      },
    });
  } else {
    await prisma.cV.update({
      where: { id: cv.id },
      data: {
        title: 'CV Phan Đức Toàn - Backend Developer Intern',
        status: CvStatus.ACTIVE,
      },
    });
  }

  const existingVersion = await prisma.cVVersion.findFirst({
    where: { cvId: cv.id },
    orderBy: { versionNo: 'desc' },
  });

  if (existingVersion) {
    await prisma.cVVersion.update({
      where: { id: existingVersion.id },
      data: {
        sourceFileId: fileAssetId,
      },
    });
  } else {
    await prisma.cVVersion.create({
      data: {
        cvId: cv.id,
        versionNo: 1,
        sourceFileId: fileAssetId,
      },
    });
  }
  console.log(`CV ID: ${cv.id}, Version linked to file: ${fileAssetId}`);

  // 6. CandidateJobPreference
  const internLevel = await prisma.experienceLevel.findFirst({
    where: { code: 'intern' },
  });

  await prisma.candidateJobPreference.upsert({
    where: { candidateProfileId: profile.id },
    update: {
      desiredPosition: 'Backend Developer Intern',
      desiredSalaryMin: 8000000,
      desiredSalaryMax: 15000000,
      salaryCurrency: 'VND',
      workingModel: WorkingModel.HYBRID,
      desiredLevelId: internLevel?.id ?? null,
      isRelocate: false,
      noticePeriodDays: 0,
    },
    create: {
      candidateProfileId: profile.id,
      desiredPosition: 'Backend Developer Intern',
      desiredSalaryMin: 8000000,
      desiredSalaryMax: 15000000,
      salaryCurrency: 'VND',
      workingModel: WorkingModel.HYBRID,
      desiredLevelId: internLevel?.id ?? null,
      isRelocate: false,
      noticePeriodDays: 0,
    },
  });

  // 7. Clear & re-seed Educations
  await prisma.candidateEducation.deleteMany({
    where: { candidateProfileId: profile.id },
  });

  await prisma.candidateEducation.create({
    data: {
      candidateProfileId: profile.id,
      schoolName: 'Cao đẳng FPT Polytechnic',
      degree: 'Cao đẳng',
      major: 'Lập trình web',
      startDate: new Date('2024-09-01'),
      endDate: new Date('2026-08-31'),
      isCurrent: true,
      gpa: 3.7,
      description: 'Chuyên ngành Lập trình web. Dự kiến tốt nghiệp: 08/2026. GPA: 3.7 / 4.',
      sortOrder: 0,
    },
  });

  // 8. Clear & re-seed Experiences
  await prisma.candidateExperience.deleteMany({
    where: { candidateProfileId: profile.id },
  });

  await prisma.candidateExperience.create({
    data: {
      candidateProfileId: profile.id,
      companyName: 'Công ty TNHH MTV TM&DV VNTECHTN',
      positionTitle: 'Freelance Frontend Developer',
      employmentType: 'Freelance',
      startDate: new Date('2025-11-01'),
      endDate: new Date('2026-01-31'),
      isCurrent: false,
      description:
        '• Refactor UI/UX: Phân tích và code lại toàn bộ giao diện mới cho website công ty.\n• Frontend & Responsive: Dùng HTML/CSS và Tailwind CSS xây dựng giao diện hoạt động tốt trên mọi thiết bị.\n• Xử lý tương tác: Dùng JavaScript thuần và AJAX để tạo hiệu ứng và gọi dữ liệu không cần tải lại trang.\n• Bài học kinh nghiệm: Củng cố nền tảng Frontend và rèn luyện kỹ năng làm việc độc lập, chốt yêu cầu trực tiếp với khách hàng.',
      technologies: 'HTML, CSS, Tailwind CSS, JavaScript, AJAX',
      sortOrder: 0,
    },
  });

  // 9. Clear & re-seed Projects
  await prisma.candidateProject.deleteMany({
    where: { candidateProfileId: profile.id },
  });

  await prisma.candidateProject.createMany({
    data: [
      {
        candidateProfileId: profile.id,
        name: 'WORKSHOP MANAGER (PRIVATE PROJECT)',
        role: 'Backend Developer',
        startDate: new Date('2026-02-01'),
        description:
          '• Phát triển API: Trực tiếp code RESTful API xử lý các nghiệp vụ của xưởng thực hành bằng NestJS.\n• Xử lý dữ liệu: Thực hiện các câu truy vấn và thao tác dữ liệu NoSQL trên MongoDB.\n• Bài học: Nâng cao kỹ năng code API thực tế, làm quen với framework NestJS và MongoDB.',
        technologies: 'NestJS, MongoDB, RESTful API',
        sortOrder: 0,
      },
      {
        candidateProfileId: profile.id,
        name: 'RUDOWATCH',
        role: 'Backend Developer',
        startDate: new Date('2025-11-01'),
        endDate: new Date('2025-12-31'),
        projectUrl: 'https://github.com/DucToanDev/Rudo_Watch_BE',
        description:
          '• Thiết kế & API: Xây dựng database và viết RESTful API (PHP) cho toàn bộ website.\n• Tài liệu & Tích hợp: Dùng Swagger viết docs API, tích hợp cổng thanh toán Seepay.\n• Vận hành: Test bằng Postman, quản lý code (GitHub) và deploy lên Render.\n• Bài học: Hoàn thiện kỹ năng phát triển API, tích hợp Payment Gateway và quy trình làm việc thực tế.',
        technologies: 'PHP, Swagger, Seepay, Postman, Git, Render',
        sortOrder: 1,
      },
    ],
  });

  // 10. Clear & re-seed Certifications / Awards
  await prisma.candidateCertification.deleteMany({
    where: { candidateProfileId: profile.id },
  });

  await prisma.candidateCertification.createMany({
    data: [
      {
        candidateProfileId: profile.id,
        name: 'Top 8 phát triển trang Web tại Kỳ thi Kỹ năng nghề cấp Thành phố năm 2025',
        organization: 'UBND TP.HCM',
        issuedDate: new Date('2025-05-01'),
        sortOrder: 0,
      },
      {
        candidateProfileId: profile.id,
        name: 'Giải nhất cuộc thi AI Webverse Challenge',
        organization: 'CLB Poly Coder',
        issuedDate: new Date('2025-08-01'),
        sortOrder: 1,
      },
      {
        candidateProfileId: profile.id,
        name: 'Giải bình chọn cuộc thi Landingpage Hackathon',
        organization: 'Bộ môn CNTT - FPT Polytechnic',
        issuedDate: new Date('2025-10-01'),
        sortOrder: 2,
      },
    ],
  });

  // 11. Clear & re-seed Links
  await prisma.candidateLink.deleteMany({
    where: { candidateProfileId: profile.id },
  });

  await prisma.candidateLink.createMany({
    data: [
      {
        candidateProfileId: profile.id,
        type: 'PORTFOLIO',
        url: 'https://phanductoan.id.vn',
      },
      {
        candidateProfileId: profile.id,
        type: 'GITHUB',
        url: 'https://github.com/DucToanDev',
      },
    ],
  });

  // 12. Clear & re-seed Skills
  await prisma.candidateSkill.deleteMany({
    where: { candidateProfileId: profile.id },
  });

  const skillNames = [
    'PHP',
    'Laravel',
    'NestJS',
    'RESTful API',
    'HTML',
    'CSS',
    'Tailwind CSS',
    'JavaScript',
    'Vue.js',
    'MySQL',
    'MongoDB',
    'Git',
    'Postman',
  ];

  for (const name of skillNames) {
    let skill = await prisma.skill.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (!skill) {
      skill = await prisma.skill.create({
        data: { name },
      });
    }
    await prisma.candidateSkill.create({
      data: {
        candidateProfileId: profile.id,
        skillId: skill.id,
        proficiencyLevel: ProficiencyLevel.INTERMEDIATE,
        yearsOfExperience: 1,
      },
    });
  }

  // 13. Avatar
  const avatarUrl = `https://ui-avatars.com/api/?name=Phan+Duc+Toan&background=10b981&color=fff&size=256&bold=true`;
  const avatarAsset = await prisma.fileAsset.findFirst({
    where: {
      ownerId: profile.id,
      purpose: FilePurpose.AVATAR,
    },
  });

  if (!avatarAsset) {
    await prisma.fileAsset.create({
      data: {
        ownerType: 'candidate_profile',
        ownerId: profile.id,
        purpose: FilePurpose.AVATAR,
        visibility: FileVisibility.PUBLIC,
        storageKey: `avatars/${profile.id}.jpg`,
        originalName: `pductoandev-avatar.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(24500),
        publicUrl: avatarUrl,
      },
    });
  } else {
    await prisma.fileAsset.update({
      where: { id: avatarAsset.id },
      data: {
        publicUrl: avatarUrl,
      },
    });
  }

  // 14. Contact Preference (Bắt buộc để đủ điều kiện hiển thị trong Kho CV)
  await prisma.candidateContactPreference.upsert({
    where: { candidateProfileId: profile.id },
    update: {
      status: CandidateContactPreferenceStatus.OPTED_IN,
      consentVersion: 'legacy-contact-v1',
      updatedAt: new Date(),
    },
    create: {
      candidateProfileId: profile.id,
      status: CandidateContactPreferenceStatus.OPTED_IN,
      consentVersion: 'legacy-contact-v1',
    },
  });

  // 15. TalentDiscoveryIndex
  const sanitizedText =
    `Backend Developer Intern ${skillNames.join(' ')} ${profile.description}`.slice(0, 1000);
  const crypto = await import('node:crypto');
  const sourceProfileVersion = crypto.createHash('sha256').update(sanitizedText).digest('hex');

  await prisma.talentDiscoveryIndex.upsert({
    where: { candidateProfileId: profile.id },
    update: {
      status: DiscoveryIndexStatus.ACTIVE,
      headline: 'Backend Developer Intern',
      cities: ['Hồ Chí Minh'],
      workingModels: [WorkingModel.ONSITE, WorkingModel.HYBRID, WorkingModel.REMOTE],
      experienceMonths: 6,
      desiredLevelId: internLevel?.id ?? null,
      sanitizedText,
      sourceProfileVersion,
      allowRedactedCvView: true,
      updatedAt: new Date(),
    },
    create: {
      candidateProfileId: profile.id,
      status: DiscoveryIndexStatus.ACTIVE,
      headline: 'Backend Developer Intern',
      cities: ['Hồ Chí Minh'],
      workingModels: [WorkingModel.ONSITE, WorkingModel.HYBRID, WorkingModel.REMOTE],
      experienceMonths: 6,
      desiredLevelId: internLevel?.id ?? null,
      sanitizedText,
      sourceProfileVersion,
      allowRedactedCvView: true,
    },
  });

  console.log('✅ Successfully seeded candidate Phan Đức Toàn into Talent Pool!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
