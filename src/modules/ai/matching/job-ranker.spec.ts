import { MIN_RELEVANCE_SCORE, rankJobs, type RankableJob, type RankerProfile } from './job-ranker';

type Job = RankableJob & { title: string };

function job(title: string, required: string[], nice: string[] = []): Job {
  return {
    title,
    requiredSkills: required.map((name) => ({ name })),
    niceToHaveSkills: nice.map((name) => ({ name })),
    city: null,
    workingModel: null,
  };
}

/** Đúng hồ sơ đã gây ra lỗi thật: gợi ý "IT Support" cho một Technical Lead. */
const technicalLead: RankerProfile = {
  skills: [
    { name: 'Java', years: 5 },
    { name: 'AWS', years: 4 },
    { name: 'Spring Boot', years: 4 },
    { name: 'Kubernetes', years: 3 },
    { name: 'Docker', years: 5 },
    { name: 'SQL', years: 5 },
  ],
  city: null,
  workingModel: null,
};

describe('rankJobs', () => {
  it('đẩy tin khớp nhiều kỹ năng lên trước tin chỉ trùng một kỹ năng phổ thông', () => {
    // "SQL" xuất hiện ở gần như mọi tin IT — đây chính là lý do bản cũ trả về
    // IT Support: nó lọt vào pool rồi được sắp theo ngày đăng.
    const ranked = rankJobs(
      technicalLead,
      [
        job('IT Support', ['IT Support', 'SQL', 'Database']),
        job('Solution Architect', ['AWS', 'Java', 'Kubernetes']),
        job('Data Entry', ['SQL']),
      ],
      3,
    );

    expect(ranked[0]?.job.title).toBe('Solution Architect');
    expect(ranked.map((entry) => entry.job.title)).not.toContain('IT Support');
  });

  it('loại tin dưới ngưỡng thay vì lấp đầy cho đủ số lượng', () => {
    const ranked = rankJobs(
      technicalLead,
      [
        job('Solution Architect', ['AWS', 'Java']),
        job('Kế toán trưởng', ['Kế toán', 'Excel', 'Thuế']),
        job('Đầu bếp', ['Nấu ăn']),
      ],
      3,
    );

    // Thà trả 1 kết quả đúng còn hơn 3 kết quả trong đó 2 cái lạc đề.
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.job.title).toBe('Solution Architect');
  });

  it('trả rỗng khi không tin nào đạt ngưỡng', () => {
    const ranked = rankJobs(technicalLead, [job('Đầu bếp', ['Nấu ăn'])], 3);
    expect(ranked).toEqual([]);
  });

  it('mọi kết quả trả về đều đạt ngưỡng liên quan', () => {
    const ranked = rankJobs(
      technicalLead,
      [
        job('Solution Architect', ['AWS', 'Java']),
        job('Backend Engineer', ['Java', 'Spring Boot', 'Docker']),
        job('IT Support', ['IT Support', 'SQL']),
      ],
      5,
    );
    for (const entry of ranked) {
      expect(entry.coverage.totalScore).toBeGreaterThanOrEqual(MIN_RELEVANCE_SCORE);
    }
  });

  it('sắp giảm dần theo điểm phù hợp', () => {
    const ranked = rankJobs(
      technicalLead,
      [
        job('Java Dev', ['Java']),
        job('Cloud Engineer', ['AWS', 'Kubernetes', 'Docker']),
        job('Backend', ['Java', 'Spring Boot']),
      ],
      3,
    );
    const scores = ranked.map((entry) => entry.coverage.totalScore);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });

  it('bằng điểm thì tin có độ tin cậy cao hơn lên trước', () => {
    const withYears = job('Có yêu cầu số năm', ['Java']);
    withYears.requiredSkills = [{ name: 'Java', minYears: 2 }];
    const withoutYears = job('Không yêu cầu số năm', ['Java']);

    const ranked = rankJobs(
      { skills: [{ name: 'Java', years: null }], city: null, workingModel: null },
      [withYears, withoutYears],
      2,
    );

    if (ranked.length === 2) {
      expect(ranked[0]?.coverage.confidenceScore).toBeGreaterThanOrEqual(
        ranked[1]?.coverage.confidenceScore ?? 0,
      );
    }
  });

  it('tôn trọng limit', () => {
    const jobs = Array.from({ length: 10 }, (_, index) =>
      job(`Java Dev ${index}`, ['Java', 'AWS']),
    );
    expect(rankJobs(technicalLead, jobs, 3)).toHaveLength(3);
  });

  it('cùng đầu vào cho cùng thứ tự — điều kiện tái lập của §22 tuần 5', () => {
    const jobs = [
      job('Solution Architect', ['AWS', 'Java']),
      job('Backend Engineer', ['Java', 'Docker']),
      job('Cloud Engineer', ['AWS', 'Kubernetes']),
    ];
    const first = rankJobs(technicalLead, jobs, 3).map((entry) => entry.job.title);
    const second = rankJobs(technicalLead, jobs, 3).map((entry) => entry.job.title);
    expect(first).toEqual(second);
  });

  it('không sập với danh sách rỗng', () => {
    expect(rankJobs(technicalLead, [], 3)).toEqual([]);
  });

  it('hồ sơ không có kỹ năng nào thì không tin nào đạt ngưỡng', () => {
    const ranked = rankJobs(
      { skills: [], city: null, workingModel: null },
      [job('Solution Architect', ['AWS', 'Java'])],
      3,
    );
    expect(ranked).toEqual([]);
  });
});
