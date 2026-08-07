import { Prisma } from '@prisma/client';

/**
 * Quyền của nhà tuyển dụng với một tin tuyển dụng: người tạo tin luôn giữ quyền, các thành viên
 * còn lại mặc định có quyền trừ khi bị thu hồi riêng cho tin đó (JobPostAccessRevocation).
 *
 * Quy tắc này vốn chỉ được cài trong getCompanyJobPosts, nên danh sách tin thì tôn trọng nó còn
 * hồ sơ ứng tuyển, CV, điểm AI và lịch phỏng vấn thì không — người bị thu hồi quyền vẫn xem được
 * ứng viên của tin đó. Gom về một chỗ để mọi truy vấn dùng chung một định nghĩa.
 *
 * Chỉ áp cho ActorType.RECRUITER; admin đi bằng quyền riêng của họ.
 */
export function recruiterAccessibleJobPostFilter(recruiterId: string): Prisma.JobPostWhereInput {
  return {
    OR: [
      { createdByRecruiterId: recruiterId },
      { accessRevocations: { none: { recruiterAccountId: recruiterId } } },
    ],
  };
}

/**
 * Bản kiểm tra trên dữ liệu đã nạp sẵn, dành cho chỗ đã include accessRevocations của chính
 * recruiter đó (`where: { recruiterAccountId }`), khỏi phải bắn thêm một truy vấn.
 */
export function isJobPostAccessibleToRecruiter(
  jobPost: { createdByRecruiterId: string; accessRevocations: unknown[] },
  recruiterId: string,
): boolean {
  return jobPost.createdByRecruiterId === recruiterId || jobPost.accessRevocations.length === 0;
}
