/**
 * Chấm độ phủ kỹ năng — tất định, không dùng LLM.
 *
 * KE-HOACH-AI-REVIEW.md §11.1 nói dứt khoát: *"LLM không được nhận CV và JD rồi
 * tự trả về một con số phần trăm."* Điểm phải tính bằng thuật toán kiểm chứng
 * được, và cùng đầu vào phải cho cùng đầu ra (§22 tuần 5, cổng kiểm tra).
 *
 * ## Phạm vi thật của module này
 *
 * §11.3 định nghĩa `total_score` là tổng có trọng số của **bảy** chiều: kỹ năng
 * bắt buộc 45%, kỹ năng ưu tiên 10%, kinh nghiệm liên quan 15%, tương đồng vai
 * trò 15%, hình thức làm việc 7%, địa điểm 4%, lương 4%.
 *
 * Module này chỉ tính được **ba** chiều đầu tiên trong số đó — hai chiều kỹ năng
 * và hình thức/địa điểm. `experience_relevance` và `semantic_role_similarity`
 * cần embedding và bộ chấm kinh nghiệm chưa có.
 *
 * Cách xử lý phần chưa có: đánh dấu `unknown: true`, **không cho 0 điểm**. §11.5
 * nói rõ điều này — thiếu dữ liệu thì giảm `confidenceScore`, không trừ điểm ứng
 * viên. Và tổng điểm chỉ chuẩn hoá trên các chiều đo được, nên một hồ sơ khớp
 * hoàn toàn về kỹ năng không bị kéo xuống 60% chỉ vì hai chiều chưa tính được.
 *
 * Khi bộ matching đầy đủ xong, thay hàm này chứ không sửa nó — chữ ký trả về đã
 * đúng hình dạng card của UI.
 */

export const SKILL_COVERAGE_ALGORITHM_VERSION = 'skill-coverage-v0.2.0';

/** §11.3 — trọng số gốc. Giữ nguyên để chuẩn hoá đúng phần đo được. */
const WEIGHTS = {
  required: 0.45,
  nice: 0.1,
  experience: 0.15,
  semantic: 0.15,
  workingModel: 0.07,
  location: 0.04,
  salary: 0.04,
} as const;

export type CandidateSkillInput = {
  name: string;
  years: number | null;
};

export type JobSkillInput = {
  name: string;
  minYears?: number | null;
};

export type CoverageInput = {
  candidateSkills: CandidateSkillInput[];
  requiredSkills: JobSkillInput[];
  niceToHaveSkills: JobSkillInput[];
  candidateCity: string | null;
  jobCity: string | null;
  candidateWorkingModel: string | null;
  jobWorkingModel: string | null;
};

export type BreakdownItem = {
  key: string;
  label: string;
  score: number;
  weight: number;
  unknown?: boolean;
};

export type CoverageResult = {
  totalScore: number;
  confidenceScore: number;
  confidenceReason?: string;
  breakdown: BreakdownItem[];
  matchedSkills: string[];
  missingSkills: string[];
  toVerify: string[];
  algorithmVersion: string;
};

/**
 * Chuẩn hoá tên kỹ năng để so sánh.
 *
 * "Node.js", "NodeJS", "node js" phải khớp nhau — nếu không, độ phủ kỹ năng sẽ
 * báo thiếu những thứ ứng viên thật sự có, và đó là loại sai làm người dùng mất
 * tin ngay lập tức. Bỏ dấu câu và khoảng trắng, hạ chữ thường.
 */
export function normalizeSkill(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      // Bỏ dấu tiếng Việt để "Lập trình" và "lap trinh" khớp nhau.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9+#]/g, '')
  );
}

export function computeSkillCoverage(input: CoverageInput): CoverageResult {
  const candidateByKey = new Map(
    input.candidateSkills.map((skill) => [normalizeSkill(skill.name), skill]),
  );

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  const toVerify: string[] = [];

  /**
   * Mỗi kỹ năng bắt buộc chấm theo §11.3: có kỹ năng 60%, đủ số năm 40%.
   * Kế hoạch gốc chia 60/20/20 (tồn tại / proficiency / số năm) nhưng dữ liệu
   * proficiency của ứng viên là tự khai và không kiểm chứng được, nên gộp phần
   * đó vào số năm thay vì tạo cảm giác chính xác không có thật.
   */
  let requiredEarned = 0;
  for (const required of input.requiredSkills) {
    const owned = candidateByKey.get(normalizeSkill(required.name));
    if (!owned) {
      missingSkills.push(required.name);
      continue;
    }

    matchedSkills.push(required.name);
    requiredEarned += 0.6;

    if (required.minYears == null) {
      // Tin tuyển dụng không yêu cầu số năm → coi như đủ.
      requiredEarned += 0.4;
    } else if (owned.years == null) {
      // Có kỹ năng nhưng CV không ghi số năm: không trừ điểm, đánh dấu cần xác minh.
      requiredEarned += 0.4;
      toVerify.push(`Số năm kinh nghiệm với ${required.name}`);
    } else if (owned.years >= required.minYears) {
      requiredEarned += 0.4;
    } else {
      requiredEarned += 0.4 * (owned.years / required.minYears);
    }
  }

  /**
   * Tin không liệt kê kỹ năng nào thì đây là chiều **không có dữ liệu**, không
   * phải chiều đạt điểm tuyệt đối. Cho 100 ở đây là tặng không 45% trọng số cho
   * mọi tin mơ hồ, và đẩy chúng lên trên tin ghi rõ yêu cầu — ngược hẳn ý muốn.
   * Cùng nguyên tắc §11.5 đang áp cho địa điểm và lương.
   */
  const requiredScore = input.requiredSkills.length
    ? (requiredEarned / input.requiredSkills.length) * 100
    : null;

  const niceMatched = input.niceToHaveSkills.filter((skill) =>
    candidateByKey.has(normalizeSkill(skill.name)),
  ).length;
  const niceScore = input.niceToHaveSkills.length
    ? (niceMatched / input.niceToHaveSkills.length) * 100
    : null;

  const workingModelScore = compareWorkingModel(input.candidateWorkingModel, input.jobWorkingModel);
  const locationScore = compareCity(input.candidateCity, input.jobCity);

  const breakdown: BreakdownItem[] = [
    dimension('required', 'Kỹ năng bắt buộc', requiredScore, WEIGHTS.required),
    dimension('nice', 'Kỹ năng ưu tiên', niceScore, WEIGHTS.nice),
    {
      key: 'experience',
      label: 'Kinh nghiệm liên quan',
      score: 0,
      weight: WEIGHTS.experience,
      unknown: true,
    },
    {
      key: 'semantic',
      label: 'Tương đồng vai trò',
      score: 0,
      weight: WEIGHTS.semantic,
      unknown: true,
    },
    dimension('workingModel', 'Hình thức làm việc', workingModelScore, WEIGHTS.workingModel),
    dimension('location', 'Địa điểm', locationScore, WEIGHTS.location),
    { key: 'salary', label: 'Mức lương', score: 0, weight: WEIGHTS.salary, unknown: true },
  ];

  // Chỉ chuẩn hoá trên các chiều đo được. Chia cho tổng trọng số gốc (1.0) sẽ
  // đóng trần điểm ở khoảng 66% với mọi hồ sơ — một con số vô nghĩa.
  const measurable = breakdown.filter((item) => !item.unknown);
  const measuredWeight = measurable.reduce((total, item) => total + item.weight, 0);
  const totalScore = measuredWeight
    ? round(
        measurable.reduce((total, item) => total + item.score * item.weight, 0) / measuredWeight,
      )
    : 0;

  // Độ tin cậy = tỷ lệ trọng số đo được, trừ thêm cho mỗi kỹ năng thiếu số năm.
  const unverifiedPenalty = Math.min(0.2, toVerify.length * 0.05);
  const confidenceScore = round(Math.max(0, measuredWeight - unverifiedPenalty) * 100);

  const confidenceReason = buildConfidenceReason(breakdown, toVerify.length);

  return {
    totalScore: capByMissingRequired(totalScore, missingSkills.length, input.requiredSkills.length),
    confidenceScore,
    ...(confidenceReason ? { confidenceReason } : {}),
    breakdown,
    matchedSkills,
    missingSkills,
    toVerify,
    algorithmVersion: SKILL_COVERAGE_ALGORITHM_VERSION,
  };
}

/** §11.5 — thiếu trên 50% kỹ năng bắt buộc thì trần điểm là 60. */
function capByMissingRequired(score: number, missing: number, total: number): number {
  if (!total) return score;
  return missing / total > 0.5 ? Math.min(score, 60) : score;
}

/**
 * `null` = không đủ dữ liệu để so sánh, khác hẳn với "không khớp".
 * Trả 0 ở đây sẽ trừ điểm ứng viên vì tin tuyển dụng thiếu thông tin.
 */
function compareWorkingModel(candidate: string | null, job: string | null): number | null {
  if (!candidate || !job) return null;
  if (candidate === job) return 100;
  // HYBRID là tập giao — ai chấp nhận hybrid thì onsite hoặc remote đều tạm được.
  if (candidate === 'HYBRID' || job === 'HYBRID') return 70;
  return 0;
}

function compareCity(candidate: string | null, job: string | null): number | null {
  if (!candidate || !job) return null;
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // "TP. Hồ Chí Minh", "Thành phố Hồ Chí Minh", "Hồ Chí Minh" phải khớp.
      .replace(/\b(tp|thanh pho|tinh|city)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  return normalize(candidate) === normalize(job) ? 100 : 0;
}

function buildConfidenceReason(breakdown: BreakdownItem[], unverifiedCount: number): string | null {
  const unknownLabels = breakdown.filter((item) => item.unknown).map((item) => item.label);
  const parts: string[] = [];
  if (unknownLabels.length) {
    parts.push(`chưa tính được: ${unknownLabels.join(', ').toLowerCase()}`);
  }
  if (unverifiedCount) {
    parts.push(`${unverifiedCount} kỹ năng chưa ghi số năm kinh nghiệm`);
  }
  return parts.length ? `Điểm dựa trên dữ liệu chưa đầy đủ — ${parts.join('; ')}.` : null;
}

/**
 * `null` = không đo được → `unknown`, điểm 0 và bị loại khỏi mẫu số chuẩn hoá.
 * Gộp về một hàm để không còn chỗ nào tự viết nhánh rồi quên đánh dấu unknown.
 */
function dimension(
  key: string,
  label: string,
  score: number | null,
  weight: number,
): BreakdownItem {
  return score === null
    ? { key, label, score: 0, weight, unknown: true }
    : { key, label, score: round(score), weight };
}

function round(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}
