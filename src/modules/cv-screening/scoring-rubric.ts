export const CV_SCORING_RUBRIC = [
  {
    key: 'skills',
    label: 'Kỹ năng',
    maxScore: 40,
    criteria: [
      {
        key: 'required-skills',
        label: 'Kỹ năng bắt buộc',
        maxScore: 20,
        description:
          'Mức đáp ứng các công nghệ và kỹ năng cốt lõi được yêu cầu trong tin tuyển dụng.',
      },
      {
        key: 'preferred-skills',
        label: 'Kỹ năng ưu tiên và công cụ',
        maxScore: 8,
        description:
          'Các framework, công cụ và kỹ năng được ưu tiên nhưng không phải điều kiện cốt lõi.',
      },
      {
        key: 'proficiency',
        label: 'Độ thành thạo và seniority',
        maxScore: 8,
        description: 'Bằng chứng về độ sâu chuyên môn, mức tự chủ và cấp độ trách nhiệm kỹ thuật.',
      },
      {
        key: 'skill-context',
        label: 'Bối cảnh áp dụng kỹ năng',
        maxScore: 4,
        description:
          'Khả năng áp dụng kỹ năng đúng bối cảnh sản phẩm, hệ thống và quy trình của vị trí.',
      },
    ],
  },
  {
    key: 'experience',
    label: 'Kinh nghiệm',
    maxScore: 30,
    criteria: [
      {
        key: 'relevant-years',
        label: 'Số năm kinh nghiệm liên quan',
        maxScore: 12,
        description: 'Thời lượng kinh nghiệm có liên quan trực tiếp so với yêu cầu của vị trí.',
      },
      {
        key: 'role-similarity',
        label: 'Độ tương đồng vai trò',
        maxScore: 8,
        description:
          'Mức tương đồng giữa chức danh, nhiệm vụ đã làm và trách nhiệm của vị trí tuyển dụng.',
      },
      {
        key: 'domain-responsibility',
        label: 'Domain và mức trách nhiệm',
        maxScore: 6,
        description:
          'Kinh nghiệm trong domain liên quan, quy mô trách nhiệm và mức độ sở hữu công việc.',
      },
      {
        key: 'recency-continuity',
        label: 'Độ gần đây và liên tục',
        maxScore: 4,
        description:
          'Kinh nghiệm liên quan có đủ gần đây, liên tục và còn giá trị áp dụng hay không.',
      },
    ],
  },
  {
    key: 'projects',
    label: 'Dự án liên quan',
    maxScore: 20,
    criteria: [
      {
        key: 'project-relevance',
        label: 'Mức liên quan của dự án',
        maxScore: 8,
        description: 'Dự án hoặc sản phẩm có bài toán và công nghệ gần với vị trí tuyển dụng.',
      },
      {
        key: 'technical-depth',
        label: 'Độ sâu kỹ thuật',
        maxScore: 5,
        description:
          'Độ phức tạp, quyết định kỹ thuật và chiều sâu triển khai được thể hiện trong CV.',
      },
      {
        key: 'impact-scale',
        label: 'Tác động và quy mô',
        maxScore: 4,
        description:
          'Kết quả triển khai, người dùng, hiệu quả hoặc quy mô có số liệu và bằng chứng rõ ràng.',
      },
      {
        key: 'evidence-quality',
        label: 'Chất lượng bằng chứng',
        maxScore: 3,
        description:
          'Vai trò cá nhân, đóng góp và kết quả dự án được mô tả cụ thể, có thể kiểm chứng.',
      },
    ],
  },
  {
    key: 'education',
    label: 'Học vấn',
    maxScore: 10,
    criteria: [
      {
        key: 'degree-major',
        label: 'Bằng cấp và chuyên ngành',
        maxScore: 5,
        description: 'Bậc học và chuyên ngành có liên quan đến yêu cầu của vị trí.',
      },
      {
        key: 'certifications',
        label: 'Chứng chỉ và đào tạo',
        maxScore: 3,
        description: 'Chứng chỉ hoặc chương trình đào tạo có liên quan và còn giá trị áp dụng.',
      },
      {
        key: 'academic-evidence',
        label: 'Bằng chứng học thuật liên quan',
        maxScore: 2,
        description:
          'Môn học, đồ án, nghiên cứu hoặc thành tích học thuật hỗ trợ trực tiếp cho vị trí.',
      },
    ],
  },
] as const;

export type CvScoringCriterionKey = (typeof CV_SCORING_RUBRIC)[number]['key'];

export type CvScoringBreakdownItem = {
  key: string;
  awardedScore: number;
  reason: string;
  evidence: string;
};

export type CvScoringCriterionBreakdown = {
  key: CvScoringCriterionKey;
  summary: string;
  items: CvScoringBreakdownItem[];
};
