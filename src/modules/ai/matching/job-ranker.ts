import { computeSkillCoverage, type CoverageResult } from './skill-coverage';

/**
 * Xếp hạng tin tuyển dụng theo độ phù hợp với một hồ sơ.
 *
 * ## Vì sao module này tồn tại
 *
 * Bản đầu lấy tin theo thứ tự `publishedAt` rồi mới chấm điểm. Nghĩa là hệ thống
 * **chấm sau khi đã chọn nhầm**: một ứng viên "Technical Lead (Java/AWS)" nhận
 * gợi ý "IT Support" 27 điểm. Điểm 27 hoàn toàn đúng — nó phản ánh trung thực
 * rằng tin đó không hợp. Cái sai là tin đó lọt vào danh sách ngay từ đầu.
 *
 * Đảo thứ tự hai bước: lấy pool rộng → chấm **toàn bộ** → sắp theo điểm → cắt
 * top N. Cùng một hàm chấm, cùng dữ liệu, chỉ khác chỗ đặt bước lọc.
 *
 * ## Ranh giới
 *
 * Xếp hạng ở đây vẫn chỉ dựa trên các chiều `skill-coverage` đo được (kỹ năng,
 * hình thức làm việc, địa điểm). `semantic_role_similarity` — 15% trọng số theo
 * §11.3, thứ để biết "Technical Lead" gần "Solution Architect" hơn "IT Support"
 * — vẫn cần embedding và chưa có. **Không bịa ra một điểm ngữ nghĩa giả** bằng
 * cách so trùng từ trong tiêu đề: nó sẽ đúng vài ca và sai nhiều ca, mà lại tạo
 * cảm giác chính xác không có thật.
 *
 * Hệ quả thực tế: pool càng rộng thì cắt càng chính xác, nhưng vẫn bị giới hạn
 * bởi việc lọc pool theo trùng tên kỹ năng. Một ứng viên có "SQL" sẽ kéo về mọi
 * tin nhắc tới SQL; xếp hạng đẩy tin hợp lên đầu chứ không loại được tin lạ khỏi
 * pool. Đó là lý do bước tiếp theo là embedding, không phải tinh chỉnh chỗ này.
 */

export type RankableJob = {
  requiredSkills: { name: string; minYears?: number | null }[];
  niceToHaveSkills: { name: string }[];
  city: string | null;
  workingModel: string | null;
};

export type RankedJob<T extends RankableJob> = {
  job: T;
  coverage: CoverageResult;
};

export type RankerProfile = {
  skills: { name: string; years: number | null }[];
  city: string | null;
  workingModel: string | null;
};

/**
 * Điểm tối thiểu để một tin được coi là đáng gợi ý.
 *
 * Dưới ngưỡng này thì thà trả về ít kết quả còn hơn trả về kết quả lạc đề — một
 * gợi ý sai làm người dùng mất tin vào cả tính năng, trong khi "chưa tìm thấy
 * tin phù hợp" là một câu trả lời chấp nhận được và trung thực.
 */
export const MIN_RELEVANCE_SCORE = 40;

export function rankJobs<T extends RankableJob>(
  profile: RankerProfile,
  jobs: T[],
  limit: number,
): RankedJob<T>[] {
  const candidateSkills = profile.skills.map((skill) => ({
    name: skill.name,
    years: skill.years,
  }));

  return jobs
    .map((job) => ({
      job,
      coverage: computeSkillCoverage({
        candidateSkills,
        requiredSkills: job.requiredSkills,
        niceToHaveSkills: job.niceToHaveSkills,
        candidateCity: profile.city,
        jobCity: job.city,
        candidateWorkingModel: profile.workingModel,
        jobWorkingModel: job.workingModel,
      }),
    }))
    .filter((entry) => entry.coverage.totalScore >= MIN_RELEVANCE_SCORE)
    .sort((left, right) => {
      // Điểm phù hợp trước. Bằng điểm thì tin có dữ liệu đầy đủ hơn lên trước —
      // người dùng đánh giá được một tin ghi rõ yêu cầu, còn tin mơ hồ thì không.
      if (right.coverage.totalScore !== left.coverage.totalScore) {
        return right.coverage.totalScore - left.coverage.totalScore;
      }
      return right.coverage.confidenceScore - left.coverage.confidenceScore;
    })
    .slice(0, limit);
}
