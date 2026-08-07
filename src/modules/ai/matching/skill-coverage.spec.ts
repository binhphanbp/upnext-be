import { computeSkillCoverage, normalizeSkill, type CoverageInput } from './skill-coverage';

function input(overrides: Partial<CoverageInput> = {}): CoverageInput {
  return {
    candidateSkills: [],
    requiredSkills: [],
    niceToHaveSkills: [],
    candidateCity: null,
    jobCity: null,
    candidateWorkingModel: null,
    jobWorkingModel: null,
    ...overrides,
  };
}

describe('normalizeSkill', () => {
  it('coi các cách viết cùng một công nghệ là một', () => {
    const forms = ['Node.js', 'NodeJS', 'node js', 'NODE.JS'];
    const normalized = new Set(forms.map(normalizeSkill));
    expect(normalized.size).toBe(1);
  });

  it('bỏ dấu tiếng Việt', () => {
    expect(normalizeSkill('Lập trình')).toBe(normalizeSkill('lap trinh'));
  });

  it('giữ ký tự có nghĩa trong tên công nghệ', () => {
    expect(normalizeSkill('C++')).toContain('++');
    expect(normalizeSkill('C#')).toContain('#');
  });
});

describe('computeSkillCoverage', () => {
  it('cùng đầu vào cho cùng đầu ra — điều kiện của cổng kiểm tra tuần 5', () => {
    const shared = input({
      candidateSkills: [{ name: 'NestJS', years: 2 }],
      requiredSkills: [{ name: 'NestJS', minYears: 1 }],
    });
    expect(computeSkillCoverage(shared)).toEqual(computeSkillCoverage(shared));
  });

  it('khớp hết kỹ năng bắt buộc cho điểm kỹ năng tối đa', () => {
    const result = computeSkillCoverage(
      input({
        candidateSkills: [
          { name: 'NestJS', years: 3 },
          { name: 'PostgreSQL', years: 2 },
        ],
        requiredSkills: [
          { name: 'NestJS', minYears: 2 },
          { name: 'PostgreSQL', minYears: 1 },
        ],
      }),
    );

    const required = result.breakdown.find((item) => item.key === 'required');
    expect(required?.score).toBe(100);
    expect(result.matchedSkills).toEqual(['NestJS', 'PostgreSQL']);
    expect(result.missingSkills).toEqual([]);
  });

  it('KHÔNG trừ điểm khi CV thiếu số năm — chỉ đánh dấu cần xác minh (§11.5)', () => {
    const withYears = computeSkillCoverage(
      input({
        candidateSkills: [{ name: 'Redis', years: 3 }],
        requiredSkills: [{ name: 'Redis', minYears: 2 }],
      }),
    );
    const withoutYears = computeSkillCoverage(
      input({
        candidateSkills: [{ name: 'Redis', years: null }],
        requiredSkills: [{ name: 'Redis', minYears: 2 }],
      }),
    );

    const scoreOf = (result: typeof withYears) =>
      result.breakdown.find((item) => item.key === 'required')?.score;

    expect(scoreOf(withoutYears)).toBe(scoreOf(withYears));
    expect(withoutYears.toVerify).toHaveLength(1);
    // Bù lại thì độ tin cậy phải thấp hơn.
    expect(withoutYears.confidenceScore).toBeLessThan(withYears.confidenceScore);
  });

  it('chấm theo tỷ lệ khi số năm chưa đủ', () => {
    const result = computeSkillCoverage(
      input({
        candidateSkills: [{ name: 'Kafka', years: 1 }],
        requiredSkills: [{ name: 'Kafka', minYears: 4 }],
      }),
    );
    const required = result.breakdown.find((item) => item.key === 'required');
    // 60% cho việc có kỹ năng + 40% × (1/4) = 70.
    expect(required?.score).toBe(70);
  });

  it('đánh dấu unknown cho chiều chưa tính được, không cho 0 điểm', () => {
    const result = computeSkillCoverage(
      input({
        candidateSkills: [{ name: 'NestJS', years: 2 }],
        requiredSkills: [{ name: 'NestJS', minYears: 1 }],
      }),
    );

    const unknownKeys = result.breakdown.filter((item) => item.unknown).map((item) => item.key);
    expect(unknownKeys).toContain('experience');
    expect(unknownKeys).toContain('semantic');
    expect(unknownKeys).toContain('salary');
  });

  it('không đóng trần điểm vì các chiều chưa tính được', () => {
    // Nếu chuẩn hoá trên toàn bộ trọng số gốc, hồ sơ khớp hoàn hảo sẽ chỉ ra ~55%.
    const result = computeSkillCoverage(
      input({
        candidateSkills: [{ name: 'NestJS', years: 5 }],
        requiredSkills: [{ name: 'NestJS', minYears: 1 }],
        niceToHaveSkills: [],
        candidateCity: 'Hà Nội',
        jobCity: 'Hà Nội',
        candidateWorkingModel: 'HYBRID',
        jobWorkingModel: 'HYBRID',
      }),
    );
    expect(result.totalScore).toBe(100);
  });

  it('đóng trần 60 điểm khi thiếu quá nửa kỹ năng bắt buộc (§11.5)', () => {
    const result = computeSkillCoverage(
      input({
        candidateSkills: [{ name: 'NestJS', years: 5 }],
        requiredSkills: [
          { name: 'NestJS', minYears: 1 },
          { name: 'Kafka', minYears: 1 },
          { name: 'Kubernetes', minYears: 1 },
        ],
        candidateCity: 'Hà Nội',
        jobCity: 'Hà Nội',
      }),
    );
    expect(result.missingSkills).toEqual(['Kafka', 'Kubernetes']);
    expect(result.totalScore).toBeLessThanOrEqual(60);
  });

  it('thiếu dữ liệu địa điểm là unknown, không phải không khớp', () => {
    const result = computeSkillCoverage(input({ candidateCity: 'Hà Nội', jobCity: null }));
    const location = result.breakdown.find((item) => item.key === 'location');
    expect(location?.unknown).toBe(true);
  });

  it('so sánh địa điểm bỏ qua tiền tố hành chính và dấu', () => {
    const result = computeSkillCoverage(
      input({ candidateCity: 'TP. Hồ Chí Minh', jobCity: 'Ho Chi Minh' }),
    );
    expect(result.breakdown.find((item) => item.key === 'location')?.score).toBe(100);
  });

  it('HYBRID được coi là khớp một phần với onsite và remote', () => {
    const hybridJob = computeSkillCoverage(
      input({ candidateWorkingModel: 'ONSITE', jobWorkingModel: 'HYBRID' }),
    );
    const mismatch = computeSkillCoverage(
      input({ candidateWorkingModel: 'ONSITE', jobWorkingModel: 'REMOTE' }),
    );
    const scoreOf = (result: typeof hybridJob) =>
      result.breakdown.find((item) => item.key === 'workingModel')?.score;

    expect(scoreOf(hybridJob)).toBe(70);
    expect(scoreOf(mismatch)).toBe(0);
  });

  it('tin không liệt kê kỹ năng nào là unknown, KHÔNG phải điểm tuyệt đối', () => {
    // Trước đây trả 100 ở đây, nghĩa là mọi tin mơ hồ được tặng không 45% trọng
    // số và bị đẩy lên trên tin ghi rõ yêu cầu. Cùng nguyên tắc §11.5 với địa
    // điểm và lương: không có dữ liệu thì không chấm.
    const result = computeSkillCoverage(input({ candidateSkills: [{ name: 'Go', years: 1 }] }));
    expect(Number.isFinite(result.totalScore)).toBe(true);
    expect(result.breakdown.find((item) => item.key === 'required')?.unknown).toBe(true);
    expect(result.breakdown.find((item) => item.key === 'nice')?.unknown).toBe(true);
  });

  it('không chia cho 0 khi mọi chiều đều unknown', () => {
    const result = computeSkillCoverage(input());
    expect(result.totalScore).toBe(0);
    expect(result.confidenceScore).toBe(0);
  });

  it('nêu lý do độ tin cậy thấp bằng ngôn ngữ người đọc được', () => {
    const result = computeSkillCoverage(
      input({
        candidateSkills: [{ name: 'Redis', years: null }],
        requiredSkills: [{ name: 'Redis', minYears: 2 }],
      }),
    );
    expect(result.confidenceReason).toContain('chưa tính được');
    expect(result.confidenceReason).toContain('chưa ghi số năm');
  });
});
