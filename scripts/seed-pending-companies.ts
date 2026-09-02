/**
 * Tạo (hoặc reset) một vài công ty ở trạng thái PENDING kèm tài khoản nhà tuyển dụng,
 * để test luồng Admin duyệt / từ chối hồ sơ xác thực và email gửi về cho NTD.
 *
 * Chạy: pnpm tsx scripts/seed-pending-companies.ts
 *
 * Script idempotent: chạy lại sẽ đưa công ty về đúng trạng thái PENDING và xoá lịch sử
 * quyết định cũ, nên test được nhiều lần. Dữ liệu tạo ra là dữ liệu test — xoá bằng
 * `pnpm tsx scripts/seed-pending-companies.ts --cleanup`.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'Password123!';

const TARGETS = [
  {
    email: 'tuyetnhng010193@gmail.com',
    fullName: 'Nguyễn Tuyết Nhung',
    companyName: 'Công ty TNHH Test Tuyết Nhung',
    slug: 'cong-ty-tnhh-test-tuyet-nhung',
    taxCode: '9900000101',
    address: '12 Nguyễn Huệ, Quận 1, Thành phố Hồ Chí Minh',
    phone: '0900000101',
  },
  {
    email: 'khoinguyen8116@gmail.com',
    fullName: 'Nguyễn Khôi Nguyên',
    companyName: 'Công ty TNHH Test Khôi Nguyên',
    slug: 'cong-ty-tnhh-test-khoi-nguyen',
    taxCode: '9900000102',
    address: '88 Trần Duy Hưng, Cầu Giấy, Thành phố Hà Nội',
    phone: '0900000102',
  },
] as const;

const DEFAULT_PERMISSIONS = [
  { code: 'jobs:manage', module: 'jobs', action: 'manage', description: 'Manage job posts' },
  {
    code: 'applications:manage',
    module: 'applications',
    action: 'manage',
    description: 'Manage candidate applications',
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

/** Cùng một role OWNER dùng chung toàn hệ thống — `RecruiterRole.code` là unique. */
async function ensureOwnerRole() {
  const permissions = await Promise.all(
    DEFAULT_PERMISSIONS.map((permission) =>
      prisma.recruiterPermission.upsert({
        where: { code: permission.code },
        update: {},
        create: permission,
        select: { id: true },
      }),
    ),
  );

  const ownerRole = await prisma.recruiterRole.upsert({
    where: { code: 'OWNER' },
    update: {},
    create: { code: 'OWNER', name: 'Owner', description: 'Chu tai khoan - Toan quyen quan ly' },
    select: { id: true },
  });

  await prisma.recruiterRolePermission.createMany({
    data: permissions.map((permission) => ({
      recruiterRoleId: ownerRole.id,
      recruiterPermissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  return ownerRole;
}

async function cleanup() {
  for (const target of TARGETS) {
    const company = await prisma.company.findUnique({ where: { slug: target.slug } });
    if (!company) {
      console.log(`· Không có gì để xoá cho "${target.companyName}"`);
      continue;
    }

    // RecruiterAccount dùng onDelete: SetNull với company, nên phải xoá tay trước.
    await prisma.recruiterAccount.deleteMany({ where: { email: target.email } });
    await prisma.company.delete({ where: { id: company.id } });
    console.log(`✓ Đã xoá "${target.companyName}" và tài khoản ${target.email}`);
  }
}

async function seed() {
  const passwordHash = await hash(PASSWORD, 10);
  const ownerRole = await ensureOwnerRole();

  for (const target of TARGETS) {
    const company = await prisma.company.upsert({
      where: { slug: target.slug },
      update: {
        name: target.companyName,
        taxCode: target.taxCode,
        email: target.email,
        phone: target.phone,
        address: target.address,
        // Đây là điểm chính: đưa hồ sơ về PENDING để Admin có cái mà duyệt / từ chối.
        verificationStatus: 'PENDING',
        status: 'ACTIVE',
        lockedReason: null,
        lockedAt: null,
      },
      create: {
        name: target.companyName,
        slug: target.slug,
        type: 'PRODUCT',
        taxCode: target.taxCode,
        email: target.email,
        phone: target.phone,
        address: target.address,
        description: 'Công ty dữ liệu test cho luồng duyệt / từ chối xác thực doanh nghiệp.',
        companySize: '10-50',
        workingDays: 'Thứ 2 - Thứ 6',
        verificationStatus: 'PENDING',
      },
    });

    // Lịch sử quyết định cũ khiến lần từ chối tiếp theo bị 409, nên dọn luôn.
    await prisma.companyVerificationReview.deleteMany({ where: { companyId: company.id } });
    await prisma.companyReputationActivity.deleteMany({
      where: {
        companyId: company.id,
        actionType: { in: ['TAX_CODE_VERIFIED', 'REJECTED_VERIFICATION'] },
      },
    });

    const recruiter = await prisma.recruiterAccount.upsert({
      where: { email: target.email },
      update: {
        companyId: company.id,
        recruiterRoleId: ownerRole.id,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
      create: {
        email: target.email,
        companyId: company.id,
        recruiterRoleId: ownerRole.id,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });

    await prisma.recruiterProfile.upsert({
      where: { recruiterAccountId: recruiter.id },
      update: { fullName: target.fullName, phoneNumber: target.phone },
      create: {
        recruiterAccountId: recruiter.id,
        fullName: target.fullName,
        phoneNumber: target.phone,
      },
    });

    const member = await prisma.companyMember.findFirst({
      where: { recruiterAccountId: recruiter.id, companyId: company.id },
      select: { id: true },
    });
    if (member) {
      await prisma.companyMember.update({
        where: { id: member.id },
        data: { roleId: ownerRole.id, status: 'ACTIVE' },
      });
    } else {
      await prisma.companyMember.create({
        data: {
          recruiterAccountId: recruiter.id,
          companyId: company.id,
          roleId: ownerRole.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });
    }

    console.log(`✓ "${company.name}"`);
    console.log(`    company id : ${company.id}`);
    console.log(`    trạng thái : PENDING (Chờ duyệt)`);
    console.log(`    đăng nhập  : ${target.email} / ${PASSWORD}`);
  }
}

async function main() {
  const isCleanup = process.argv.includes('--cleanup');

  console.log('================================================================');
  console.log(
    isCleanup
      ? '🧹 XOÁ CÔNG TY TEST DUYỆT / TỪ CHỐI XÁC THỰC'
      : '🌱 TẠO CÔNG TY TEST Ở TRẠNG THÁI CHỜ DUYỆT',
  );
  console.log('================================================================\n');

  if (isCleanup) {
    await cleanup();
  } else {
    await seed();
    console.log('\n👉 Vào /vi/admin/users/employers, lọc "Chờ duyệt" để thấy 2 công ty này.');
    console.log('   Mở "Chi tiết hồ sơ" hoặc menu ⋯ để Duyệt / Từ chối.');
    console.log('   Khi từ chối, email kèm lý do + ảnh minh chứng sẽ gửi tới đúng 2 mail trên.');
  }

  console.log('\n================================================================\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
