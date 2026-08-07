import { computeCvQuality, type CvQualityInput } from './cv-quality';

function input(overrides: Partial<CvQualityInput> = {}): CvQualityInput {
  return {
    parsedText: '',
    skillCount: 0,
    experienceCount: 0,
    hasDesiredPosition: false,
    ...overrides,
  };
}

const GOOD_CV = `
TÓM TẮT
Backend Developer 5 năm kinh nghiệm với Java và Spring Boot, tập trung vào hệ thống tải cao.

KINH NGHIỆM LÀM VIỆC
Senior Backend Engineer — VNG (2020 - nay)
- Thiết kế kiến trúc microservices phục vụ hơn 10000 CCU đồng thời mỗi ngày
- Giảm p95 latency của API thanh toán 40% bằng cách thêm lớp cache Redis
- Dẫn dắt và cố vấn cho 8 lập trình viên trong nhóm backend

HỌC VẤN
Kỹ sư Công nghệ thông tin — Đại học Bách Khoa

KỸ NĂNG
Java, Spring Boot, PostgreSQL, Kafka, Docker, Kubernetes, AWS

DỰ ÁN
- Hệ thống đặt lịch khám: NestJS, PostgreSQL, xử lý 500 request mỗi giây
`;

describe('computeCvQuality', () => {
  it('cùng đầu vào cho cùng đầu ra', () => {
    const shared = input({ parsedText: GOOD_CV, skillCount: 7, experienceCount: 1 });
    expect(computeCvQuality(shared)).toEqual(computeCvQuality(shared));
  });

  it('CV đầy đủ đạt điểm cao và không thiếu mục chính', () => {
    const result = computeCvQuality(
      input({ parsedText: GOOD_CV, skillCount: 7, experienceCount: 1, hasDesiredPosition: true }),
    );
    expect(result.overallScore).toBeGreaterThan(65);
    expect(result.missingSections).not.toContain('Kinh nghiệm làm việc');
    expect(result.missingSections).not.toContain('Kỹ năng');
  });

  it('phát hiện CV không lượng hóa kết quả', () => {
    const noMetrics = GOOD_CV.replace(/\d+/g, '').replace(/%/g, '');
    const result = computeCvQuality(input({ parsedText: noMetrics, experienceCount: 1 }));
    expect(result.scores.impact).toBeLessThan(50);
    expect(result.weaknesses.some((w) => w.text.includes('lượng hóa'))).toBe(true);
  });

  it('mọi nhận xét đều kèm dẫn chứng — §8.1', () => {
    const result = computeCvQuality(input({ parsedText: GOOD_CV, skillCount: 9 }));
    for (const finding of [...result.strengths, ...result.weaknesses]) {
      expect(finding.evidence.trim().length).toBeGreaterThan(0);
      expect(finding.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('hồ sơ có cấu trúc bù cho văn bản parse thiếu tiêu đề', () => {
    const noHeadings = 'Làm backend với Java và Spring Boot tại một công ty công nghệ.';
    const withProfile = computeCvQuality(
      input({ parsedText: noHeadings, skillCount: 9, experienceCount: 2 }),
    );
    const withoutProfile = computeCvQuality(input({ parsedText: noHeadings }));
    expect(withProfile.scores.completeness).toBeGreaterThan(withoutProfile.scores.completeness);
    expect(withProfile.missingSections).not.toContain('Kỹ năng');
  });

  it('CV rỗng cho điểm 0, không sập và không chia cho 0', () => {
    const result = computeCvQuality(input());
    expect(result.overallScore).toBe(0);
    expect(Number.isFinite(result.scores.clarity)).toBe(true);
    expect(result.weaknesses.length).toBeGreaterThan(0);
  });

  it('CV scan bóc tách được rất ít chữ bị cảnh báo đúng nguyên nhân', () => {
    const result = computeCvQuality(input({ parsedText: 'Nguyen Van A Backend' }));
    expect(result.scores.atsReadiness).toBeLessThan(60);
    expect(result.weaknesses.some((w) => w.evidence.includes('từ'))).toBe(true);
  });

  it('mọi điểm nằm trong khoảng 0–100', () => {
    for (const sample of [GOOD_CV, '', 'a'.repeat(5000), '- '.repeat(200)]) {
      const result = computeCvQuality(input({ parsedText: sample, experienceCount: 3 }));
      for (const score of [result.overallScore, ...Object.values(result.scores)]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('nhắc đặt vị trí mong muốn khi hồ sơ để trống', () => {
    const result = computeCvQuality(
      input({ parsedText: GOOD_CV, skillCount: 7, hasDesiredPosition: false }),
    );
    expect(result.weaknesses.some((w) => w.text.includes('vị trí mong muốn'))).toBe(true);
  });
});
