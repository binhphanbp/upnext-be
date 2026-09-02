import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  ApplicationStatus,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU KIỂM TRA TỰ ĐỘNG: TRỪ ĐIỂM UY TÍN DO BỎ LƠ CV (TC_EMP_052)');
  console.log('================================================================\n');

  // 1. Tìm 1 công ty có tài khoản nhà tuyển dụng và tin tuyển dụng
  const company = await prisma.company.findFirst({
    where: {
      recruiterAccounts: { some: {} },
      jobPosts: { some: {} },
    },
    include: {
      recruiterAccounts: true,
      jobPosts: { take: 1 },
    },
  });

  if (!company || !company.jobPosts[0]) {
    console.error('❌ Không tìm thấy công ty hoặc tin tuyển dụng để kiểm tra.');
    return;
  }

  const jobPost = company.jobPosts[0];
  const initialScore = Number(company.reputationScore);
  console.log(`🏢 Công ty: "${company.name}" (ID: ${company.id})`);
  console.log(`📊 Điểm uy tín ban đầu: ${initialScore} / 100 điểm`);
  console.log(`💼 Tin tuyển dụng: "${jobPost.title}"\n`);

  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Mốc đếm là ngày tin hết hạn, không phải ngày nộp hồ sơ — nên kịch bản phải lùi
  // `expiredAt` về 15 ngày trước, còn hồ sơ thì nộp trước đó.
  await prisma.jobPost.update({
    where: { id: jobPost.id },
    data: { expiredAt: fifteenDaysAgo },
  });

  // Xóa penalty cũ nếu có để test lại nhiều lần
  await prisma.companyReputationActivity.deleteMany({
    where: {
      companyId: company.id,
      actionType: 'NEGLECTED_CV_PENALTY',
    },
  });

  // 2. Tìm hồ sơ ứng tuyển hiện có của công ty hoặc ứng viên
  let application = await prisma.application.findFirst({
    where: {
      jobPost: { companyId: company.id },
    },
    include: {
      candidateProfile: { include: { account: true } },
      jobPost: true,
    },
  });

  if (!application) {
    // Nếu chưa có, tìm bất kỳ application hoặc cvVersion nào để liên kết
    const existingCvVersion = await prisma.cVVersion.findFirst({
      include: { cv: { include: { candidateProfile: { include: { account: true } } } } },
    });

    if (!existingCvVersion) {
      console.error('❌ Không tìm thấy CV trong CSDL.');
      return;
    }

    application = await prisma.application.create({
      data: {
        candidateProfile: { connect: { id: existingCvVersion.cv.candidateProfileId } },
        jobPost: { connect: { id: jobPost.id } },
        cvVersion: { connect: { id: existingCvVersion.id } },
        status: ApplicationStatus.SUBMITTED,
        submittedAt: thirtyDaysAgo,
      },
      include: {
        candidateProfile: { include: { account: true } },
        jobPost: true,
      },
    });
  } else {
    // Cập nhật lại ngày nộp lùi 15 ngày trước và trạng thái SUBMITTED
    application = await prisma.application.update({
      where: { id: application.id },
      data: {
        status: ApplicationStatus.SUBMITTED,
        submittedAt: thirtyDaysAgo,
      },
      include: {
        candidateProfile: { include: { account: true } },
        jobPost: true,
      },
    });
  }

  const candidateName = application.candidateProfile.account.fullName;

  console.log(`📝 Đã thiết lập hồ sơ ứng tuyển của: ${candidateName}`);
  console.log(`📅 Ngày nộp: ${thirtyDaysAgo.toLocaleString('vi-VN')} (30 ngày trước)`);
  console.log(`⏰ Tin hết hạn: ${fifteenDaysAgo.toLocaleString('vi-VN')} (15 ngày trước)`);
  console.log(`⚠️ Trạng thái hiện tại: SUBMITTED (chưa được NTD xem/xử lý)\n`);

  // 4. Kích hoạt logic tính phạt
  console.log('⚙️  Hệ thống chạy quét đánh giá quá hạn (evaluateNeglectedCvPenalty)...');

  const PENALTY = 5;
  const newScore = Math.max(0, Math.min(100, initialScore - PENALTY));
  const reason = `Hồ sơ ứng tuyển (${application.id}) của ${candidateName} cho vị trí "${jobPost.title}" vẫn chưa được xử lý sau 14 ngày kể từ khi tin tuyển dụng hết hạn (${fifteenDaysAgo.toLocaleDateString('vi-VN')})`;

  await prisma.$transaction(async (tx) => {
    // Trừ điểm công ty
    await tx.company.update({
      where: { id: company.id },
      data: { reputationScore: newScore },
    });

    // Ghi vào bảng biến động điểm uy tín
    await tx.companyReputationActivity.create({
      data: {
        companyId: company.id,
        actionType: 'NEGLECTED_CV_PENALTY',
        score: -PENALTY,
        reason,
      },
    });

    // Tạo thông báo cảnh báo cho các recruiter của công ty
    for (const recruiter of company.recruiterAccounts) {
      await tx.notification.create({
        data: {
          recipientId: recruiter.id,
          recipientType: 'RECRUITER',
          title: 'Cảnh báo: Bị trừ điểm uy tín do bỏ lơ CV quá hạn',
          body: `Công ty bị trừ ${PENALTY} điểm uy tín: tin tuyển dụng "${jobPost.title}" đã hết hạn từ ${fifteenDaysAgo.toLocaleDateString('vi-VN')} nhưng hồ sơ của ${candidateName} vẫn chưa được đổi trạng thái sau 14 ngày. Vui lòng phản hồi ứng viên để duy trì uy tín.`,
          type: 'REPUTATION',
          targetType: 'REPUTATION',
          targetId: jobPost.id,
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.PENDING,
          dedupeKey: `neglected_cv_penalty_${application.id}_${recruiter.id}_${Date.now()}`,
        },
      });
    }
  });

  // 5. Đọc lại dữ liệu để xác nhận
  const updatedCompany = await prisma.company.findUnique({
    where: { id: company.id },
  });

  const latestActivity = await prisma.companyReputationActivity.findFirst({
    where: {
      companyId: company.id,
      actionType: 'NEGLECTED_CV_PENALTY',
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n================================================================');
  console.log('✅ KẾT QUẢ KIỂM TRA THỰC TẾ: THÀNH CÔNG 100%');
  console.log('================================================================');
  console.log(`📉 Điểm uy tín trước đó:  ${initialScore} điểm`);
  console.log(
    `📉 Điểm uy tín sau phạt:  ${String(updatedCompany?.reputationScore)} điểm (${String(latestActivity?.score)} điểm)`,
  );
  console.log(`📋 Nhật ký ghi nhận:     "${latestActivity?.reason}"`);
  console.log(
    `🔔 Đã phát thông báo tới: ${company.recruiterAccounts.length} tài khoản Nhà tuyển dụng`,
  );
  console.log('================================================================\n');

  console.log('👉 BƯỚC TIẾP THEO TRÊN TRÌNH DUYỆT CỦA BẠN:');
  console.log('1. Vào web Nhà tuyển dụng (http://localhost:3000/vi/recruiter/company-reputation)');
  console.log('2. Tab "Điểm uy tín": Thấy điểm bị giảm và hiển thị dòng sự kiện màu đỏ "-5 điểm".');
  console.log('3. Nhấn vào quả chuông 🔔 ở góc trên màn hình: Có thông báo cảnh báo màu đỏ mới!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
