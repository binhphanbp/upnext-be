/* eslint-disable */
import {
  AuthProvider,
  CvSource,
  CvStatus,
  DiscoveryConsentStatus,
  DiscoveryIndexStatus,
  DiscoverySalaryVisibility,
  FilePurpose,
  FileVisibility,
  Gender,
  JobSearchStatus,
  PrismaClient,
  ProfileVisibility,
  CandidateContactPreferenceStatus,
  ProficiencyLevel,
  WorkingModel,
  Prisma,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const uploadRoot = path.resolve(process.env.UPLOAD_ROOT?.trim() || 'uploads');
const appBackendUrl = (process.env.APP_BACKEND_URL?.trim() || 'http://localhost:3001').replace(
  /\/+$/,
  '',
);

type RawCandidate = {
  fullName: string;
  email: string;
  originalName: string;
  sizeBytes: number;
  parsedText: string;
};

const TECH_SKILLS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'C++',
  'C#',
  '.NET',
  'ASP.NET',
  'Kotlin',
  'Swift',
  'Dart',
  'Flutter',
  'React',
  'React Native',
  'Next.js',
  'Vue',
  'Angular',
  'Node.js',
  'Express',
  'NestJS',
  'FastAPI',
  'Flask',
  'Django',
  'Spring Boot',
  'PHP',
  'Laravel',
  'HTML',
  'CSS',
  'Tailwind CSS',
  'SQL',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'SQLite',
  'Room Database',
  'ChromaDB',
  'FAISS',
  'Docker',
  'Kubernetes',
  'Git',
  'GitHub',
  'GitLab',
  'Linux',
  'AWS',
  'GCP',
  'Azure',
  'Figma',
  'PyTorch',
  'TensorFlow',
  'Keras',
  'scikit-learn',
  'OpenCV',
  'YOLO',
  'LangChain',
  'LangGraph',
  'Hugging Face',
  'Transformers',
  'RAG',
  'REST API',
  'GraphQL',
  'WebSocket',
  'Pandas',
  'NumPy',
  'Elasticsearch',
  'CI/CD',
  'Postman',
  'Vite',
  'Machine Learning',
  'Deep Learning',
  'NLP',
  'Computer Vision',
];

const KNOWN_UNIVERSITIES = [
  {
    pattern: /Đại học Bách Khoa.*Hà Nội|HUST|Hanoi University of Science and Technology/i,
    name: 'Đại học Bách Khoa Hà Nội',
  },
  {
    pattern: /Đại học Khoa Học Tự Nhiên|HUS|HCMUS|University of Science/i,
    name: 'Đại học Khoa học Tự nhiên',
  },
  {
    pattern: /Đại học Công Nghệ.*Hà Nội|UET|University of Engineering and Technology/i,
    name: 'Đại học Công nghệ - ĐHQGHN',
  },
  {
    pattern: /University of Information Technology|UIT|Đại học Công nghệ Thông tin/i,
    name: 'Đại học Công nghệ Thông tin - ĐHQG TP.HCM',
  },
  { pattern: /FPT University|Đại học FPT/i, name: 'Đại học FPT' },
  { pattern: /Đại học Thăng Long|Thang Long University/i, name: 'Đại học Thăng Long' },
  {
    pattern: /Hanoi University of Industry|Đại học Công nghiệp Hà Nội|HaUI/i,
    name: 'Đại học Công nghiệp Hà Nội',
  },
  {
    pattern: /Học viện Công nghệ Bưu chính Viễn thông|PTIT|Posts and Telecommunications Institute/i,
    name: 'Học viện Công nghệ Bưu chính Viễn thông',
  },
  { pattern: /Học viện Nông nghiệp Việt Nam|VNUA/i, name: 'Học viện Nông nghiệp Việt Nam' },
  { pattern: /Đại học Nông Lâm/i, name: 'Đại học Nông Lâm TP.HCM' },
  {
    pattern: /University of Economics.*Industries|Kinh tế Kỹ thuật Công nghiệp|UNETI/i,
    name: 'Đại học Kinh tế - Kỹ thuật Công nghiệp',
  },
  { pattern: /Đại học Sư phạm Kỹ thuật|HCMUTE/i, name: 'Đại học Sư phạm Kỹ thuật TP.HCM' },
  { pattern: /Đại học Bách Khoa.*Đà Nẵng|DUT/i, name: 'Đại học Bách Khoa - ĐH Đà Nẵng' },
  { pattern: /Đại học Cần Thơ|CTU/i, name: 'Đại học Cần Thơ' },
  { pattern: /Đại học Tôn Đức Thắng|TDTU/i, name: 'Đại học Tôn Đức Thắng' },
  { pattern: /Đại học Công nghệ Sài Gòn|STU/i, name: 'Đại học Công nghệ Sài Gòn' },
];

function extractCandidateProfile(raw: RawCandidate) {
  const text = raw.parsedText || '';
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Clean Name
  let fullName = raw.fullName.trim();
  if (/^candidate \d+/i.test(fullName) || fullName.includes('@') || fullName.endsWith('.pdf')) {
    for (let i = 0; i < Math.min(4, lines.length); i++) {
      const line = lines[i];
      if (
        line.length > 3 &&
        line.length < 35 &&
        !line.includes('@') &&
        !line.includes('http') &&
        !/\d{5,}/.test(line) &&
        !/CV|Curriculum|Resume|Developer|Engineer|Intern|Fresher|Page|Objective|--/i.test(line)
      ) {
        fullName = line.replace(/[|•-]/g, '').trim();
        break;
      }
    }
    if (/^candidate \d+/i.test(fullName) || fullName.includes('--')) {
      fullName = 'Nguyễn Hữu Thắng';
    }
  }

  // Capitalize properly if all uppercase
  if (fullName === fullName.toUpperCase() && fullName.length > 4) {
    fullName = fullName
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  // 2. Phone
  let phone = '098' + Math.floor(1000000 + Math.random() * 9000000);
  const phoneMatch = text.match(/(?:(?:\+84|84|0)[1-9][0-9\s.-]{8,12})/);
  if (phoneMatch) {
    let p = phoneMatch[0].replace(/[\s.-]/g, '');
    if (p.startsWith('84')) p = '0' + p.slice(2);
    if (p.startsWith('+84')) p = '0' + p.slice(3);
    if (p.length >= 10 && p.length <= 11) phone = p;
  }

  // 3. Email
  let email = raw.email.toLowerCase().trim();
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && (!email.includes('@') || email.startsWith('candidate'))) {
    email = emailMatch[0].toLowerCase().trim();
  }

  // 4. Birthdate
  let birthdate: Date | null = null;
  const dobMatch = text.match(
    /(?:Ngày sinh|Dob|Date of birth|)\s*[:.]?\s*([0-9]{1,2}[\/-][0-9]{1,2}[\/-][0-9]{4})/i,
  );
  if (dobMatch) {
    const parts = dobMatch[1].split(/[\/-]/);
    if (parts.length === 3) {
      birthdate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
  }
  if (!birthdate || isNaN(birthdate.getTime())) {
    const year = 2001 + Math.floor(Math.random() * 4);
    const month = Math.floor(Math.random() * 12);
    const day = 1 + Math.floor(Math.random() * 28);
    birthdate = new Date(year, month, day);
  }

  // 5. Gender
  let gender: Gender = Gender.MALE;
  if (/Giới tính:\s*Nam|Gender:\s*Male/i.test(text)) gender = Gender.MALE;
  else if (/Giới tính:\s*Nữ|Gender:\s*Female/i.test(text)) gender = Gender.FEMALE;
  else if (
    /Thị /i.test(fullName) ||
    /Mai|Hoa|Nhung|Trang|Hương|Phương|Linh|Anh|Uyên|Chi|Huyền|My|Nguyệt/i.test(
      fullName.split(' ').pop() || '',
    )
  ) {
    gender = Gender.FEMALE;
  }

  // 6. City & Address
  let city = 'Hà Nội';
  if (
    /\b(Hồ Chí Minh|Ho Chi Minh|TP\.?\s*HCM|TPHCM|Saigon|Sài Gòn|District|Quận|UIT|DHV|HCMUS|Nông Lâm TP\.HCM)\b/i.test(
      text,
    )
  ) {
    city = 'Hồ Chí Minh';
  } else if (/\b(Đà Nẵng|Da Nang|DUT)\b/i.test(text)) {
    city = 'Đà Nẵng';
  } else if (/\b(Cần Thơ|Can Tho|CTU)\b/i.test(text)) {
    city = 'Cần Thơ';
  } else if (/\b(Hải Phòng|Hai Phong)\b/i.test(text)) {
    city = 'Hải Phòng';
  }

  let address = city;
  const addrMatch = text.match(/(?:Địa chỉ|Address||📍)\s*[:.]?\s*([^\n\r]+)/i);
  if (addrMatch) {
    const candidateAddr = addrMatch[1]
      .trim()
      .replace(/^[:.-]\s*/, '')
      .slice(0, 150);
    if (
      candidateAddr.length > 5 &&
      !candidateAddr.includes('@') &&
      !/^\d{2}\/\d{2}/.test(candidateAddr)
    ) {
      address = candidateAddr;
    }
  }

  // 7. Headline
  let headline: string | null = null;
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const l = lines[i];
    if (/@|http|\.com|\d{8,}|github|linkedin|gpa|where|via|\*|project|mục tiêu|mô tả/i.test(l))
      continue;
    if (
      /^(Intern|Fresher|Junior|Middle|Senior|Backend|Frontend|Fullstack|Full-Stack|Mobile|Android|iOS|Flutter|AI|ML|Data|DevOps|Software Engineer|Web Developer)/i.test(
        l,
      ) &&
      l.length < 50
    ) {
      headline = l;
      break;
    }
    const match = l.match(
      /(?:Position Applied|Vị trí ứng tuyển|Role|Target|Chức danh)\s*[:.]?\s*([A-Za-zÀ-ỹ\s/.()-]{3,45})/i,
    );
    if (match && !/gpa|where|via|\*|project/i.test(match[1])) {
      headline = match[1].trim();
      break;
    }
  }

  if (
    !headline ||
    headline.length > 45 ||
    /where|via |flows |gpa|\*|kinh nghiệm|học vấn/i.test(headline)
  ) {
    if (/Android|Mobile/i.test(raw.originalName)) headline = 'Intern Mobile / Android Developer';
    else if (/AI|Machine Learning|ML|NLP/i.test(raw.originalName)) headline = 'AI Engineer Intern';
    else if (/Flutter/i.test(raw.originalName)) headline = 'Flutter Developer';
    else if (/Backend|Java|\.NET/i.test(raw.originalName)) headline = 'Backend Developer';
    else if (/Frontend|FE|React/i.test(raw.originalName)) headline = 'Frontend Developer';
    else if (/Fullstack|Full-Stack/i.test(raw.originalName)) headline = 'Full Stack Developer';
    else if (/Data/i.test(raw.originalName)) headline = 'Data Science & AI Intern';
    else headline = 'Software Engineer Intern';
  }

  // 8. Skills
  const foundSkills: string[] = [];
  for (const skill of TECH_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[\\s,;•/|()])${escaped}(?:[\\s,;•/|()]|$)`, 'i');
    if (regex.test(text)) {
      foundSkills.push(skill);
    }
  }
  if (foundSkills.length < 4) {
    if (/Flutter|Mobile/i.test(headline)) foundSkills.push('Dart', 'Flutter', 'REST API', 'Git');
    else if (/AI|ML/i.test(headline)) foundSkills.push('Python', 'PyTorch', 'scikit-learn', 'Git');
    else if (/Backend|Java/i.test(headline))
      foundSkills.push('Java', 'Spring Boot', 'PostgreSQL', 'Git');
    else foundSkills.push('JavaScript', 'TypeScript', 'Node.js', 'Git');
  }

  // 9. University & Education
  let university = 'Đại học Khoa học Tự nhiên';
  for (const uni of KNOWN_UNIVERSITIES) {
    if (uni.pattern.test(text)) {
      university = uni.name;
      break;
    }
  }

  let major = 'Công nghệ thông tin';
  if (/Khoa học máy tính|Computer Science/i.test(text)) major = 'Khoa học máy tính';
  else if (/Trí tuệ nhân tạo|Artificial Intelligence|Robotics/i.test(text))
    major = 'Trí tuệ Nhân tạo';
  else if (/Kỹ thuật phần mềm|Software Engineering/i.test(text)) major = 'Kỹ thuật Phần mềm';
  else if (/Hệ thống thông tin|Information Systems/i.test(text)) major = 'Hệ thống Thông tin';
  else if (/Toán tin|Mathematics and Informatics/i.test(text)) major = 'Toán tin Ứng dụng';

  let gpa: number | null = null;
  const gpaMatch = text.match(/GPA\s*[:.]?\s*([0-4]\.[0-9]{1,2}|[5-9]\.[0-9]{1,2})/i);
  if (gpaMatch) {
    const val = parseFloat(gpaMatch[1]);
    if (val <= 4.0) gpa = val;
    else if (val <= 10.0) gpa = Number(((val / 10) * 4).toFixed(2));
  }
  if (!gpa) gpa = Number((3.1 + Math.random() * 0.7).toFixed(2));

  // 10. Experiences
  const experiences: Array<{
    companyName: string;
    positionTitle: string;
    startDate: Date;
    endDate: Date | null;
    isCurrent: boolean;
    description: string;
    technologies: string;
  }> = [];

  if (/KiotViet/i.test(text)) {
    experiences.push({
      companyName: 'KiotViet Technology',
      positionTitle: headline,
      startDate: new Date(2025, 2, 1),
      endDate: null,
      isCurrent: true,
      description:
        'Phát triển các module tính năng và tối ưu hóa ứng dụng. Tích hợp REST API, WebSocket và áp dụng Clean Architecture.',
      technologies: foundSkills.slice(0, 6).join(', '),
    });
  } else if (/CADFEM/i.test(text)) {
    experiences.push({
      companyName: 'CADFEM Vietnam',
      positionTitle: headline,
      startDate: new Date(2026, 1, 1),
      endDate: null,
      isCurrent: true,
      description:
        'Phát triển pipeline xử lý dữ liệu tự động hóa bằng Python, tích hợp API và tối ưu hiệu suất mô phỏng.',
      technologies: foundSkills.slice(0, 6).join(', '),
    });
  } else if (/Vnext|FPT Software|Viettel|VNPT|Tiki|Shopee|VNG|MISA|NashTech/i.test(text)) {
    const compMatch = text.match(
      /(Vnext Software|FPT Software|Viettel|VNPT|Tiki|Shopee|VNG|MISA|NashTech)/i,
    );
    experiences.push({
      companyName: compMatch ? compMatch[0] : 'FPT Software',
      positionTitle: headline,
      startDate: new Date(2025, 6, 1),
      endDate: null,
      isCurrent: true,
      description:
        'Tham gia phát triển các tính năng phần mềm theo mô hình Agile/Scrum. Thiết kế RESTful API và tối ưu cơ sở dữ liệu.',
      technologies: foundSkills.slice(0, 6).join(', '),
    });
  } else {
    experiences.push({
      companyName: `${university} - Lab Nghiên cứu & Phát triển`,
      positionTitle: headline,
      startDate: new Date(2025, 8, 1),
      endDate: null,
      isCurrent: true,
      description: `Nghiên cứu và phát triển các giải pháp phần mềm sử dụng ${foundSkills.slice(0, 3).join(', ')}. Xây dựng cấu trúc hệ thống và kiểm thử hiệu năng.`,
      technologies: foundSkills.slice(0, 6).join(', '),
    });
  }

  // 11. Projects
  const projects: Array<{
    name: string;
    role: string;
    description: string;
    technologies: string;
    projectUrl?: string;
  }> = [];

  const projMatch = text.match(
    /(?:DỰ ÁN|PROJECTS)[\s\S]{20,800}?(?=(?:HỌC VẤN|KỸ NĂNG|HOẠT ĐỘNG|DANH HIỆU|CERTIFICATION|$))/i,
  );
  if (projMatch) {
    projects.push({
      name: `Hệ thống Ứng dụng ${headline.replace(/Intern|Developer|Engineer/gi, '').trim() || 'Công nghệ'} thông minh`,
      role: headline,
      description:
        'Thiết kế giao diện, xử lý logic core backend/frontend và tối ưu hóa trải nghiệm người dùng.',
      technologies: foundSkills.slice(0, 5).join(', '),
      projectUrl: 'https://github.com/upnext-candidate/showcase-project',
    });
  } else {
    projects.push({
      name: `Dự án Portfolio & Hệ thống Thử nghiệm`,
      role: headline,
      description:
        'Xây dựng kiến trúc module, tích hợp cơ sở dữ liệu và triển khai thử nghiệm trên môi trường cloud/docker.',
      technologies: foundSkills.slice(0, 4).join(', '),
      projectUrl: 'https://github.com/upnext-candidate/demo-app',
    });
  }

  // 12. Description
  let description = '';
  const objMatch = text.match(
    /(?:MỤC TIÊU NGHỀ NGHIỆP|OBJECTIVE|PROFILE|SUMMARY|Professional Summary)\s*[:.\n]+([\s\S]{50,600}?)(?=\n[A-ZÀ-Ỹ\s]{4,30}\n|HỌC VẤN|EDUCATION|KỸ NĂNG|SKILLS|PROJECTS|DỰ ÁN|$)/i,
  );
  if (objMatch) {
    description = objMatch[1].replace(/\n+/g, ' ').trim().slice(0, 500);
  }
  if (!description || description.length < 30) {
    description = `Sinh viên chuyên ngành ${major} tại ${university} với định hướng chuyên sâu trở thành ${headline} chuyên nghiệp. Nắm vững nền tảng kiến thức về ${foundSkills.slice(0, 4).join(', ')}, tư duy hệ thống vững chắc, ham học hỏi và nhiệt huyết đóng góp giá trị cho sản phẩm của doanh nghiệp.`;
  }

  return {
    fullName,
    email,
    phone,
    city,
    address,
    headline,
    birthdate,
    gender,
    university,
    major,
    gpa,
    skills: Array.from(new Set(foundSkills)),
    experiences,
    projects,
    description,
  };
}

async function main() {
  console.log('=== START SEEDING CANDIDATES FROM CVs FOR TALENT POOL ===');

  const candidatesJsonPath = path.join(__dirname, '../prisma/candidates.json');
  if (!fs.existsSync(candidatesJsonPath)) {
    throw new Error(`File ${candidatesJsonPath} not found!`);
  }

  const rawCandidates: RawCandidate[] = JSON.parse(fs.readFileSync(candidatesJsonPath, 'utf-8'));
  console.log(`Loaded ${rawCandidates.length} candidate records from candidates.json.`);

  // Ensure default password hash
  const defaultPasswordHash = await hash('Password123@', 10);

  // Ensure SkillCategory exists
  let skillCat = await prisma.skillCategory.findFirst({
    where: { name: 'Technical Skills' },
  });
  if (!skillCat) {
    skillCat = await prisma.skillCategory.create({
      data: {
        name: 'Technical Skills',
        description: 'Programming languages, frameworks, libraries and tools',
        isActive: true,
      },
    });
  }

  // Pre-seed all tech skills
  const skillMap = new Map<string, string>();
  for (const skillName of TECH_SKILLS) {
    const s = await prisma.skill.upsert({
      where: { name: skillName },
      update: {},
      create: {
        name: skillName,
        categoryId: skillCat.id,
        isActive: true,
      },
    });
    skillMap.set(skillName.toLowerCase(), s.id);
  }

  // Get experience levels
  const expLevels = await prisma.experienceLevel.findMany();
  const internLevel = expLevels.find((l) => l.code === 'intern') || expLevels[0];
  const fresherLevel = expLevels.find((l) => l.code === 'fresher') || expLevels[0];
  const juniorLevel = expLevels.find((l) => l.code === 'junior') || expLevels[0];

  const cvStorageDirectory = path.posix.join('uploads', 'cv');
  const cvDir = path.join(uploadRoot, 'cv');
  if (!fs.existsSync(cvDir)) {
    fs.mkdirSync(cvDir, { recursive: true });
  }

  let seededCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < rawCandidates.length; idx++) {
    const raw = rawCandidates[idx];
    try {
      const data = extractCandidateProfile(raw);

      // Map level
      let desiredLevelId = internLevel.id;
      if (/Fresher/i.test(data.headline)) desiredLevelId = fresherLevel.id;
      else if (/Junior|Developer/i.test(data.headline)) desiredLevelId = juniorLevel.id;

      // 1. Account
      const account = await prisma.candidateAccount.upsert({
        where: { email: data.email },
        update: {
          fullName: data.fullName,
          candidateAccountStatus: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
        create: {
          fullName: data.fullName,
          email: data.email,
          passwordHash: defaultPasswordHash,
          authProvider: AuthProvider.DEFAULT,
          candidateAccountStatus: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });

      // 2. Profile
      const profile = await prisma.candidateProfile.upsert({
        where: { candidateAccountId: account.id },
        update: {
          phoneNumber: data.phone,
          gender: data.gender,
          address: data.address,
          preferredSearchCity: data.city,
          birthdate: data.birthdate,
          description: data.description,
          jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
          profileVisibility: ProfileVisibility.PUBLIC,
        },
        create: {
          candidateAccountId: account.id,
          phoneNumber: data.phone,
          gender: data.gender,
          address: data.address,
          preferredSearchCity: data.city,
          birthdate: data.birthdate,
          description: data.description,
          jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
          profileVisibility: ProfileVisibility.PUBLIC,
        },
      });

      // 3. CandidateContactPreference (Crucial for Kho CV search!)
      await prisma.candidateContactPreference.upsert({
        where: { candidateProfileId: profile.id },
        update: {
          status: CandidateContactPreferenceStatus.OPTED_IN,
          consentVersion: '2026-04-01',
        },
        create: {
          candidateProfileId: profile.id,
          status: CandidateContactPreferenceStatus.OPTED_IN,
          consentVersion: '2026-04-01',
        },
      });

      // 4. CandidateTalentDiscoveryPreference
      await prisma.candidateTalentDiscoveryPreference.upsert({
        where: { candidateProfileId: profile.id },
        update: {
          status: DiscoveryConsentStatus.ENABLED,
          consentVersion: '2026-04-01',
          allowInvitations: true,
          allowRedactedCvView: true,
          allowedCities: [data.city],
          allowedWorkingModels: [WorkingModel.ONSITE, WorkingModel.HYBRID, WorkingModel.REMOTE],
          salaryVisibility: DiscoverySalaryVisibility.RANGE_ONLY,
          consentedAt: new Date(),
          revokedAt: null,
        },
        create: {
          candidateProfileId: profile.id,
          status: DiscoveryConsentStatus.ENABLED,
          consentVersion: '2026-04-01',
          allowInvitations: true,
          allowRedactedCvView: true,
          allowedCities: [data.city],
          allowedWorkingModels: [WorkingModel.ONSITE, WorkingModel.HYBRID, WorkingModel.REMOTE],
          salaryVisibility: DiscoverySalaryVisibility.RANGE_ONLY,
          consentedAt: new Date(),
        },
      });

      // 5. CandidateSkills
      await prisma.candidateSkill.deleteMany({ where: { candidateProfileId: profile.id } });
      for (let sIdx = 0; sIdx < data.skills.length; sIdx++) {
        const sName = data.skills[sIdx];
        let sId = skillMap.get(sName.toLowerCase());
        if (!sId) {
          const created = await prisma.skill.upsert({
            where: { name: sName },
            update: {},
            create: { name: sName, categoryId: skillCat.id, isActive: true },
          });
          sId = created.id;
          skillMap.set(sName.toLowerCase(), sId);
        }
        await prisma.candidateSkill.create({
          data: {
            candidateProfileId: profile.id,
            skillId: sId,
            proficiencyLevel: sIdx < 2 ? ProficiencyLevel.ADVANCED : ProficiencyLevel.INTERMEDIATE,
            yearsOfExperience: 1.0,
            sortOrder: sIdx,
          },
        });
      }

      // 6. Experiences
      await prisma.candidateExperience.deleteMany({ where: { candidateProfileId: profile.id } });
      for (let eIdx = 0; eIdx < data.experiences.length; eIdx++) {
        const exp = data.experiences[eIdx];
        await prisma.candidateExperience.create({
          data: {
            candidateProfileId: profile.id,
            companyName: exp.companyName,
            positionTitle: exp.positionTitle,
            employmentType: 'Full-time / Thực tập',
            startDate: exp.startDate,
            endDate: exp.endDate,
            isCurrent: exp.isCurrent,
            description: exp.description,
            technologies: exp.technologies,
            sortOrder: eIdx,
          },
        });
      }

      // 7. Educations
      await prisma.candidateEducation.deleteMany({ where: { candidateProfileId: profile.id } });
      await prisma.candidateEducation.create({
        data: {
          candidateProfileId: profile.id,
          schoolName: data.university,
          degree: 'Cử nhân / Kỹ sư',
          major: data.major,
          startDate: new Date(2022, 8, 1),
          endDate: new Date(2026, 6, 30),
          isCurrent: true,
          gpa: data.gpa,
          description: `Chuyên sâu định hướng ${data.headline}, GPA ${data.gpa}/4.0.`,
          sortOrder: 0,
        },
      });

      // 8. Projects
      await prisma.candidateProject.deleteMany({ where: { candidateProfileId: profile.id } });
      for (let pIdx = 0; pIdx < data.projects.length; pIdx++) {
        const proj = data.projects[pIdx];
        await prisma.candidateProject.create({
          data: {
            candidateProfileId: profile.id,
            name: proj.name,
            role: proj.role,
            description: proj.description,
            technologies: proj.technologies,
            projectUrl: proj.projectUrl,
            startDate: new Date(2025, 5, 1),
            endDate: new Date(2026, 0, 1),
            sortOrder: pIdx,
          },
        });
      }

      // 9. Certifications & Languages
      await prisma.candidateCertification.deleteMany({ where: { candidateProfileId: profile.id } });
      await prisma.candidateCertification.create({
        data: {
          candidateProfileId: profile.id,
          name: 'Chứng chỉ Năng lực Chuyên môn CNTT',
          organization: data.university,
          issuedDate: new Date(2025, 4, 15),
          sortOrder: 0,
        },
      });

      await prisma.candidateLanguage.deleteMany({ where: { candidateProfileId: profile.id } });
      await prisma.candidateLanguage.createMany({
        data: [
          { candidateProfileId: profile.id, language: 'Tiếng Việt', proficiency: 'Bản ngữ' },
          {
            candidateProfileId: profile.id,
            language: 'Tiếng Anh',
            proficiency: 'Đọc hiểu tài liệu & Giao tiếp (B2)',
          },
        ],
      });

      // 10. Job Preference
      const isNegotiable = idx % 4 === 0;
      let salaryMin: Prisma.Decimal | null = null;
      let salaryMax: Prisma.Decimal | null = null;
      if (!isNegotiable) {
        const titleLower = data.headline.toLowerCase();
        let min = 15_000_000;
        let max = 25_000_000;
        if (titleLower.includes('lead') || titleLower.includes('manager')) {
          min = 35_000_000;
          max = 60_000_000;
        } else if (titleLower.includes('senior')) {
          min = 28_000_000;
          max = 45_000_000;
        } else if (titleLower.includes('intern') || titleLower.includes('thực tập')) {
          min = 5_000_000;
          max = 8_000_000;
        } else if (titleLower.includes('fresher') || titleLower.includes('junior')) {
          min = 10_000_000;
          max = 16_000_000;
        } else {
          const presets = [
            [12_000_000, 18_000_000],
            [15_000_000, 22_000_000],
            [18_000_000, 28_000_000],
            [20_000_000, 32_000_000],
            [25_000_000, 40_000_000],
          ];
          const chosen = presets[idx % presets.length];
          min = chosen[0];
          max = chosen[1];
        }
        salaryMin = new Prisma.Decimal(min);
        salaryMax = new Prisma.Decimal(max);
      }

      await prisma.candidateJobPreference.upsert({
        where: { candidateProfileId: profile.id },
        update: {
          desiredPosition: data.headline,
          workingModel: WorkingModel.HYBRID,
          desiredLevelId,
          desiredSalaryMin: salaryMin,
          desiredSalaryMax: salaryMax,
          salaryCurrency: 'VND',
        },
        create: {
          candidateProfileId: profile.id,
          desiredPosition: data.headline,
          workingModel: WorkingModel.HYBRID,
          desiredLevelId,
          desiredSalaryMin: salaryMin,
          desiredSalaryMax: salaryMax,
          salaryCurrency: 'VND',
        },
      });

      // 11. File Asset & CV
      const cleanFileName = `${data.email}.pdf`;
      const targetCvPath = path.join(cvDir, cleanFileName);
      const originalCvPath = path.join(cvDir, raw.originalName);

      let actualSize = raw.sizeBytes;
      if (fs.existsSync(originalCvPath)) {
        actualSize = fs.statSync(originalCvPath).size;
        if (!fs.existsSync(targetCvPath)) {
          fs.copyFileSync(originalCvPath, targetCvPath);
        }
      } else if (!fs.existsSync(targetCvPath)) {
        fs.writeFileSync(targetCvPath, Buffer.alloc(0));
        actualSize = 0;
      }

      const storageKey = path.posix.join(cvStorageDirectory, cleanFileName);
      const publicUrl = `${appBackendUrl}/${storageKey}`;

      let fileAsset = await prisma.fileAsset.findFirst({
        where: {
          ownerId: profile.id,
          purpose: FilePurpose.CV,
        },
      });

      if (!fileAsset) {
        fileAsset = await prisma.fileAsset.create({
          data: {
            ownerType: 'candidate_cv',
            ownerId: profile.id,
            purpose: FilePurpose.CV,
            visibility: FileVisibility.PUBLIC,
            storageKey,
            originalName: raw.originalName,
            mimeType: 'application/pdf',
            sizeBytes: BigInt(actualSize),
            publicUrl,
          },
        });
      } else {
        await prisma.fileAsset.update({
          where: { id: fileAsset.id },
          data: {
            storageKey,
            publicUrl,
            sizeBytes: BigInt(actualSize),
          },
        });
      }

      let cv = await prisma.cV.findFirst({
        where: { candidateProfileId: profile.id },
      });
      if (!cv) {
        cv = await prisma.cV.create({
          data: {
            candidateProfileId: profile.id,
            title: `CV - ${data.fullName}`,
            source: CvSource.UPLOAD,
            status: CvStatus.ACTIVE,
            isDefault: true,
          },
        });
      }

      let cvVersion = await prisma.cVVersion.findFirst({
        where: { cvId: cv.id, versionNo: 1 },
      });
      if (!cvVersion) {
        cvVersion = await prisma.cVVersion.create({
          data: {
            cvId: cv.id,
            sourceFileId: fileAsset.id,
            versionNo: 1,
            parsedText: raw.parsedText || null,
          },
        });
      } else {
        await prisma.cVVersion.update({
          where: { id: cvVersion.id },
          data: {
            sourceFileId: fileAsset.id,
            parsedText: raw.parsedText || null,
          },
        });
      }

      // 12. Candidate Avatar FileAsset
      const avatarUrl = `https://i.pravatar.cc/150?u=candidate-${profile.id}`;
      let avatarAsset = await prisma.fileAsset.findFirst({
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
            originalName: `${data.email}-avatar.jpg`,
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

      // 13. TalentDiscoveryIndex
      const sanitizedText =
        `${data.headline} ${data.skills.join(' ')} ${data.experiences[0]?.description || ''} ${data.description}`.slice(
          0,
          1000,
        );
      const sourceProfileVersion = createHash('sha256').update(sanitizedText).digest('hex');

      await prisma.talentDiscoveryIndex.upsert({
        where: { candidateProfileId: profile.id },
        update: {
          status: DiscoveryIndexStatus.ACTIVE,
          headline: data.headline.slice(0, 120),
          cities: [data.city],
          workingModels: [WorkingModel.ONSITE, WorkingModel.HYBRID, WorkingModel.REMOTE],
          experienceMonths: 12,
          desiredLevelId,
          sanitizedText,
          sourceProfileVersion,
          allowRedactedCvView: true,
        },
        create: {
          candidateProfileId: profile.id,
          status: DiscoveryIndexStatus.ACTIVE,
          headline: data.headline.slice(0, 120),
          cities: [data.city],
          workingModels: [WorkingModel.ONSITE, WorkingModel.HYBRID, WorkingModel.REMOTE],
          experienceMonths: 12,
          desiredLevelId,
          sanitizedText,
          sourceProfileVersion,
          allowRedactedCvView: true,
        },
      });

      seededCount++;
      if (seededCount % 20 === 0 || seededCount === rawCandidates.length) {
        console.log(
          `[SEED] Processed ${seededCount}/${rawCandidates.length} candidates... (latest: ${data.fullName} - ${data.headline})`,
        );
      }
    } catch (err) {
      errorCount++;
      console.error(`[SEED ERROR] Failed to seed candidate #${idx} (${raw.fullName}):`, err);
    }
  }

  console.log(`\n=== SEED COMPLETED ===`);
  console.log(`Successfully seeded: ${seededCount}`);
  console.log(`Errors: ${errorCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
