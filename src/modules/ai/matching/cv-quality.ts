/**
 * Chấm chất lượng CV — tất định, không dùng LLM.
 *
 * §8.1 acceptance criteria nói rõ: *"Không trả text tự do làm kết quả chính"* và
 * *"mỗi nhận xét phải có evidence từ CV"*. Điểm số vì vậy phải tính bằng thuật
 * toán kiểm chứng được, còn LLM chỉ diễn giải — giống hệt cách `skill-coverage`
 * tách vai trò ở phần matching.
 *
 * Bốn chiều theo §8.1, mỗi chiều đo một thứ khác nhau:
 *
 * - `completeness`  — có đủ các mục nhà tuyển dụng cần đọc không.
 * - `clarity`       — có đọc lướt được không: gạch đầu dòng, câu ngắn.
 * - `impact`        — có con số chứng minh kết quả, hay chỉ liệt kê nhiệm vụ.
 * - `atsReadiness`  — máy đọc có ra chữ không, có tiêu đề mục chuẩn không.
 *
 * ## Cái module này KHÔNG làm
 *
 * Không đánh giá nội dung chuyên môn đúng hay sai, không so với một CV "mẫu",
 * và **không dùng tên, tuổi, giới tính, ảnh hay địa chỉ** (§1.3). Toàn bộ tín
 * hiệu đến từ cấu trúc và cách viết — những thứ ứng viên sửa được ngay.
 */

export const CV_QUALITY_ALGORITHM_VERSION = 'cv-quality-v1.0.0';

export type CvQualityInput = {
  /** Văn bản CV đã lọc PII. */
  parsedText: string;
  /** Từ hồ sơ có cấu trúc — bổ sung cho phần văn bản có thể parse thiếu. */
  skillCount: number;
  experienceCount: number;
  hasDesiredPosition: boolean;
};

export type CvFinding = { text: string; evidence: string };

export type CvQualityResult = {
  overallScore: number;
  scores: { completeness: number; clarity: number; impact: number; atsReadiness: number };
  strengths: CvFinding[];
  weaknesses: CvFinding[];
  missingSections: string[];
  algorithmVersion: string;
};

/** Mục nhà tuyển dụng IT thực sự tìm khi đọc CV, kèm từ khoá nhận diện. */
const SECTIONS: { label: string; patterns: RegExp[]; weight: number }[] = [
  {
    label: 'Tóm tắt nghề nghiệp',
    patterns: [/tóm tắt|mục tiêu|summary|objective|about me|giới thiệu/i],
    weight: 1,
  },
  {
    label: 'Kinh nghiệm làm việc',
    patterns: [/kinh nghiệm|experience|work history|quá trình công tác/i],
    weight: 2,
  },
  { label: 'Học vấn', patterns: [/học vấn|education|trình độ|bằng cấp/i], weight: 1 },
  { label: 'Kỹ năng', patterns: [/kỹ năng|skills?|công nghệ|technolog/i], weight: 2 },
  { label: 'Dự án', patterns: [/dự án|projects?|portfolio/i], weight: 1 },
  { label: 'Chứng chỉ', patterns: [/chứng chỉ|certificat|khoá học|course/i], weight: 0.5 },
];

/**
 * Từ chỉ hành động có kết quả đo được. Dùng để phân biệt "chịu trách nhiệm phát
 * triển API" (nhiệm vụ) với "giảm p95 latency 40%" (tác động).
 */
const IMPACT_MARKERS =
  /\b(\d+(?:[.,]\d+)?\s*(?:%|triệu|tỷ|k|ms|giây|phút|lần|ccu|qps|rps|user|người dùng|request))/gi;

const BULLET_MARKERS = /^[\s]*[-•*▪◦]\s+/gm;

export function computeCvQuality(input: CvQualityInput): CvQualityResult {
  const text = input.parsedText ?? '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  /* ---------------- completeness ---------------- */

  const missingSections: string[] = [];
  let sectionEarned = 0;
  let sectionTotal = 0;

  for (const section of SECTIONS) {
    sectionTotal += section.weight;
    const found = section.patterns.some((pattern) => pattern.test(text));
    if (found) sectionEarned += section.weight;
    else missingSections.push(section.label);
  }

  // Hồ sơ có cấu trúc bù cho phần văn bản parse thiếu: một CV dựng bằng CV
  // builder có thể không in tiêu đề "Kỹ năng" nhưng dữ liệu vẫn đầy đủ.
  if (input.skillCount >= 5 && missingSections.includes('Kỹ năng')) {
    sectionEarned += 2;
    missingSections.splice(missingSections.indexOf('Kỹ năng'), 1);
  }
  if (input.experienceCount >= 1 && missingSections.includes('Kinh nghiệm làm việc')) {
    sectionEarned += 2;
    missingSections.splice(missingSections.indexOf('Kinh nghiệm làm việc'), 1);
  }

  const completeness = round((sectionEarned / sectionTotal) * 100);

  /* ---------------- clarity ---------------- */

  const bulletCount = (text.match(BULLET_MARKERS) ?? []).length;
  const sentences = text.split(/[.!?\n]+/).filter((part) => part.trim().split(/\s+/).length > 3);
  const averageSentenceWords = sentences.length
    ? sentences.reduce((total, s) => total + s.trim().split(/\s+/).length, 0) / sentences.length
    : 0;

  // 12–22 từ/câu là vùng dễ đọc lướt. Ngắn hơn thường là fragment rời rạc, dài
  // hơn thì người đọc phải dừng lại — cả hai đều làm CV khó quét trong 20 giây.
  const sentenceScore =
    averageSentenceWords === 0
      ? 0
      : averageSentenceWords < 12
        ? 60
        : averageSentenceWords <= 22
          ? 100
          : Math.max(30, 100 - (averageSentenceWords - 22) * 5);

  // Ít nhất 5 gạch đầu dòng thì CV mới có cấu trúc quét được.
  const bulletScore = Math.min(100, (bulletCount / 5) * 100);
  const clarity = round(sentenceScore * 0.5 + bulletScore * 0.5);

  /* ---------------- impact ---------------- */

  const impactMatches = (text.match(IMPACT_MARKERS) ?? []).length;
  // Kỳ vọng ~1 con số cho mỗi vị trí đã làm; 3 con số là mức tốt.
  const expectedMetrics = Math.max(3, input.experienceCount);
  const impact = round(Math.min(100, (impactMatches / expectedMetrics) * 100));

  /* ---------------- atsReadiness ---------------- */

  const parseable = words >= 150 ? 100 : words >= 60 ? 60 : words > 0 ? 30 : 0;
  const headingHits = SECTIONS.filter((s) => s.patterns.some((p) => p.test(text))).length;
  const headingScore = round((headingHits / SECTIONS.length) * 100);
  const atsReadiness = round(parseable * 0.6 + headingScore * 0.4);

  /* ---------------- nhận xét kèm dẫn chứng ---------------- */

  const strengths: CvFinding[] = [];
  const weaknesses: CvFinding[] = [];

  if (input.skillCount >= 8) {
    strengths.push({
      text: 'Danh sách kỹ năng đủ rộng để lọt qua bộ lọc từ khoá',
      evidence: `Hồ sơ khai ${input.skillCount} kỹ năng`,
    });
  }
  if (impactMatches >= 3) {
    strengths.push({
      text: 'Có số liệu chứng minh kết quả, không chỉ liệt kê nhiệm vụ',
      evidence: `Tìm thấy ${impactMatches} chỉ số định lượng trong phần kinh nghiệm`,
    });
  }
  if (bulletCount >= 8) {
    strengths.push({
      text: 'Trình bày theo gạch đầu dòng, quét nhanh được',
      evidence: `${bulletCount} gạch đầu dòng`,
    });
  }

  if (impactMatches < 2) {
    weaknesses.push({
      text: 'Mô tả công việc chưa lượng hóa kết quả',
      evidence:
        impactMatches === 0
          ? 'Không tìm thấy con số nào trong phần kinh nghiệm'
          : 'Chỉ có 1 chỉ số định lượng trong toàn bộ CV',
    });
  }
  if (missingSections.length) {
    weaknesses.push({
      text: `Thiếu ${missingSections.length} mục nhà tuyển dụng thường tìm`,
      evidence: `Không phát hiện: ${missingSections.join(', ')}`,
    });
  }
  if (bulletCount < 5) {
    weaknesses.push({
      text: 'Ít gạch đầu dòng — người đọc phải đọc cả đoạn để tìm thông tin',
      evidence: `Chỉ có ${bulletCount} gạch đầu dòng trong toàn CV`,
    });
  }
  if (words < 150) {
    weaknesses.push({
      text: 'Nội dung quá ngắn hoặc file khó bóc tách',
      evidence: `Chỉ trích xuất được ${words} từ — bản scan hoặc CV nhiều ảnh thường bị thế này`,
    });
  }
  if (!input.hasDesiredPosition) {
    weaknesses.push({
      text: 'Chưa đặt vị trí mong muốn trong hồ sơ',
      evidence: 'Trường "vị trí mong muốn" đang trống, hệ thống khó gợi ý việc phù hợp',
    });
  }

  /**
   * Trọng số tổng: hoàn chỉnh và tác động nặng hơn vì đó là hai thứ nhà tuyển
   * dụng thật sự đọc. ATS nhẹ nhất — nó là điều kiện cần, không phải điểm mạnh.
   */
  const overallScore = round(
    completeness * 0.3 + clarity * 0.2 + impact * 0.3 + atsReadiness * 0.2,
  );

  return {
    overallScore,
    scores: { completeness, clarity, impact, atsReadiness },
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    missingSections,
    algorithmVersion: CV_QUALITY_ALGORITHM_VERSION,
  };
}

function round(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}
