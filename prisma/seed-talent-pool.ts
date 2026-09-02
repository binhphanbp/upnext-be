/**
 * Bật consent liên hệ trực tiếp (legacy) để Kho CV có dữ liệu duyệt.
 *
 * Chạy: `npx tsx prisma/seed-talent-pool.ts`
 * Xem trạng thái mà không ghi gì: thêm `--status`.
 *
 * ## Vì sao Kho CV trống dù có 207 ứng viên OPEN_TO_WORK + PUBLIC
 *
 * `TalentPoolService.search()` lọc qua `buildLegacyContactEligibilityWhere()`,
 * và predicate đó đòi CẢ BA lớp: `OPEN_TO_WORK` + `PUBLIC` +
 * `contactPreference.status = OPTED_IN`. Bảng `candidate_contact_preferences`
 * chưa từng được seed ở đâu trong repo -- `seed.ts` tạo tài khoản/hồ sơ/CV cho
 * 143 ứng viên tĩnh nhưng không tạo dòng consent này, và
 * `seed-talent-discovery.ts` (script trước của tôi) chỉ ghi vào
 * `CandidateTalentDiscoveryPreference` -- một bảng consent HOÀN TOÀN KHÁC cho
 * Discovery (§3, §11.3 cấm gộp hai consent). Kết quả: 0 dòng `OPTED_IN`, nên
 * Kho CV luôn trả danh sách rỗng bất kể có bao nhiêu ứng viên đủ điều kiện hai
 * lớp đầu.
 *
 * ## File CV KHÔNG cần seed lại
 *
 * Đã kiểm trên DB thật: 143/143 ứng viên trong `candidates.json` đã có
 * `CandidateAccount` + `CV` + `CVVersion` + `FileAsset` trỏ tới file PDF THẬT
 * trong `uploads/cv/<email>.pdf` (kích thước trên đĩa khớp `FileAsset.sizeBytes`
 * cho mọi mẫu đã kiểm, không file nào rỗng). Cơ chế đó đã có sẵn ở
 * `seed.ts:7212-7338` và đã chạy thành công trước đó -- script này KHÔNG động
 * vào `uploads/cv` hay `FileAsset`, chỉ bật consent còn thiếu.
 */
import {
  CandidateContactPreferenceStatus,
  JobSearchStatus,
  PrismaClient,
  ProfileVisibility,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL chưa được set trong .env');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

/**
 * `consentVersion` ở đây thuần tính bằng chứng, không có code nào đọc lại nó
 * (xem doc comment của model trong `schema.prisma`) -- một chuỗi cố định là đủ.
 */
const CONSENT_VERSION = 'legacy-contact-v1';

async function main() {
  const statusOnly = process.argv.includes('--status');

  if (statusOnly) {
    await reportStatus();
    return;
  }

  const eligible = await prisma.candidateProfile.findMany({
    where: {
      jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
      profileVisibility: ProfileVisibility.PUBLIC,
    },
    select: { id: true },
  });

  console.log(`\n=== Bật consent liên hệ trực tiếp cho Kho CV ===\n`);
  console.log(`Ứng viên OPEN_TO_WORK + PUBLIC: ${eligible.length}`);

  if (!eligible.length) {
    console.log('  ⚠️  Không có ứng viên nào đủ hai lớp đầu -- không có gì để bật consent.');
    return;
  }

  let count = 0;
  for (const profile of eligible) {
    await prisma.candidateContactPreference.upsert({
      where: { candidateProfileId: profile.id },
      create: {
        candidateProfileId: profile.id,
        status: CandidateContactPreferenceStatus.OPTED_IN,
        consentVersion: CONSENT_VERSION,
      },
      update: {
        status: CandidateContactPreferenceStatus.OPTED_IN,
      },
    });
    count += 1;
  }

  console.log(`  ✓ Đã bật OPTED_IN cho ${count} ứng viên.`);
  await reportStatus();
}

async function reportStatus() {
  const optedIn = await prisma.candidateContactPreference.count({
    where: { status: CandidateContactPreferenceStatus.OPTED_IN },
  });
  const eligible = await prisma.candidateProfile.count({
    where: {
      jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
      profileVisibility: ProfileVisibility.PUBLIC,
      contactPreference: { is: { status: CandidateContactPreferenceStatus.OPTED_IN } },
    },
  });
  const withRealFile = await prisma.candidateProfile.count({
    where: {
      jobSearchStatus: JobSearchStatus.OPEN_TO_WORK,
      profileVisibility: ProfileVisibility.PUBLIC,
      contactPreference: { is: { status: CandidateContactPreferenceStatus.OPTED_IN } },
      cvs: { some: { versions: { some: { sourceFileId: { not: null } } } } },
    },
  });

  console.log(`\n--- Trạng thái ---`);
  console.log(`  contactPreference OPTED_IN (tổng): ${optedIn}`);
  console.log(`  Đủ điều kiện hiện trong Kho CV:     ${eligible}`);
  console.log(`  ...trong đó có file CV gốc thật:    ${withRealFile}`);
}

main()
  .catch((error) => {
    console.error('\n❌ Lỗi:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
