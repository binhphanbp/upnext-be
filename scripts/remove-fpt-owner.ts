import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set in .env');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const targetOldOwnerEmail = 'fpt-software@gmail.com';
  const targetNewOwnerEmail = 'duycc771@gmail.com';

  const oldOwner = await prisma.recruiterAccount.findUnique({
    where: { email: targetOldOwnerEmail },
  });

  const newOwner = await prisma.recruiterAccount.findUnique({
    where: { email: targetNewOwnerEmail },
  });

  if (!oldOwner) {
    console.log(`Tài khoản ${targetOldOwnerEmail} không tồn tại.`);
    return;
  }
  if (!newOwner) {
    throw new Error(`Không tìm thấy tài khoản mới ${targetNewOwnerEmail}.`);
  }

  console.log(`Chuyển giao quyền sở hữu từ ${oldOwner.email} sang ${newOwner.email}...`);

  // 1. Reassign JobPosts and JobBoosts
  const updatedJobs = await prisma.jobPost.updateMany({
    where: { createdByRecruiterId: oldOwner.id },
    data: { createdByRecruiterId: newOwner.id },
  });
  console.log(`Đã chuyển ${updatedJobs.count} tin tuyển dụng sang cho ${newOwner.email}.`);

  const updatedBoosts = await prisma.jobBoost.updateMany({
    where: { createdByRecruiterId: oldOwner.id },
    data: { createdByRecruiterId: newOwner.id },
  });
  console.log(`Đã chuyển ${updatedBoosts.count} lượt boost sang cho ${newOwner.email}.`);

  // 2. Delete CompanyMember of old owner
  const deletedMember = await prisma.companyMember.deleteMany({
    where: { recruiterAccountId: oldOwner.id },
  });
  console.log(`Đã xóa ${deletedMember.count} bản ghi thành viên công ty của ${oldOwner.email}.`);

  // 3. Unlink company from old recruiter account
  await prisma.recruiterAccount.update({
    where: { id: oldOwner.id },
    data: {
      companyId: null,
      recruiterRoleId: null,
    },
  });

  console.log(`Đã ngắt liên kết công ty của tài khoản ${oldOwner.email}.`);

  // 4. Ensure new owner has OWNER role
  const ownerRole = await prisma.recruiterRole.findFirst({
    where: { code: 'OWNER' },
  });

  if (ownerRole) {
    await prisma.recruiterAccount.update({
      where: { id: newOwner.id },
      data: { recruiterRoleId: ownerRole.id },
    });
    await prisma.companyMember.updateMany({
      where: { recruiterAccountId: newOwner.id },
      data: { roleId: ownerRole.id },
    });
  }

  console.log(
    `\n🎉 THÀNH CÔNG: Đã xóa hoàn toàn tài khoản ${targetOldOwnerEmail} ra khỏi công ty. Tài khoản ${targetNewOwnerEmail} hiện là Owner duy nhất của FPT Software!`,
  );
}

main()
  .catch((err) => {
    console.error('Lỗi:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
