import { ConfigService } from '@nestjs/config';
import { EducationLevel } from '@prisma/client';
import { GeminiScoringService } from './gemini-scoring.service';
import { CV_SCORING_RUBRIC } from './scoring-rubric';

describe('GeminiScoringService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('derives the three Gemini-scored groups and only extracts education level', async () => {
    const applicationId = '22222222-2222-4222-8222-222222222222';
    const criteriaBreakdown = CV_SCORING_RUBRIC.filter(
      (criterion) => criterion.key !== 'education',
    ).map((criterion) => ({
      key: criterion.key,
      summary: `Giải thích ${criterion.label}`,
      items: criterion.criteria.map((item) => ({
        key: item.key,
        awardedScore: item.maxScore / 2,
        reason: `Lý do cho ${item.label}`,
        evidence: `Bằng chứng cho ${item.label}`,
      })),
    }));
    const geminiResult = {
      applicationId,
      skillScore: 40,
      experienceScore: 30,
      projectScore: 20,
      candidateEducationLevel: EducationLevel.BACHELOR,
      matchedSkills: ['TypeScript'],
      missingSkills: ['Next.js'],
      strengths: ['Có nền tảng kỹ thuật'],
      weaknesses: ['Thiếu kinh nghiệm thực tế'],
      criteriaBreakdown,
      summary: 'Ứng viên đáp ứng một phần yêu cầu.',
      recommendation: 'borderline',
    };

    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify([geminiResult]) }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const service = new GeminiScoringService(
      new ConfigService({ geminiApiKey: 'test-gemini-key' }),
    );
    const [result] = await service.scoreBatch('Yêu cầu công việc', [
      {
        applicationId,
        candidateName: 'Nguyễn Văn A',
        cvText: 'CV ứng viên',
        semanticScore: 80,
        candidateEducationLevel: null,
      },
    ]);

    expect(result.skillScore).toBe(20);
    expect(result.experienceScore).toBe(15);
    expect(result.projectScore).toBe(10);
    expect(result.candidateEducationLevel).toBe(EducationLevel.BACHELOR);
    expect(result.criteriaBreakdown).toHaveLength(3);
    expect(result.criteriaBreakdown[0].items).toHaveLength(4);
    expect(result.criteriaBreakdown.find((item) => item.key === 'projects')?.items).toHaveLength(3);
    expect(result.raw).toMatchObject({ criteriaBreakdown });

    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(typeof request.body === 'string' ? request.body : '{}') as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: {
        responseSchema: {
          items: { properties: Record<string, unknown> };
        };
      };
    };
    expect(body.generationConfig.responseSchema.items.properties).not.toHaveProperty(
      'educationScore',
    );
    expect(body.contents[0].parts[0].text).not.toContain('"key":"education"');
    expect(body.contents[0].parts[0].text).toContain('"key":"impact-evidence"');
    expect(body.contents[0].parts[0].text).not.toContain('"key":"impact-scale"');
    expect(body.contents[0].parts[0].text).not.toContain('"key":"evidence-quality"');
    expect(body.contents[0].parts[0].text).toContain(
      'Có số liệu nhưng không rõ vai trò cá nhân thì impact-evidence không được 7 điểm',
    );
  });

  it.each([
    { input: 9, expectedImpact: 7, expectedProject: 20, label: 'above maximum' },
    { input: -2, expectedImpact: 0, expectedProject: 13, label: 'below zero' },
    { input: undefined, expectedImpact: 0, expectedProject: 13, label: 'missing' },
  ])(
    'clamps impact-evidence safely when the Gemini value is $label',
    async ({ input, expectedImpact, expectedProject }) => {
      const [result] = await scoreWithImpactEvidence(input);
      const projects = result.criteriaBreakdown.find((item) => item.key === 'projects');

      expect(projects?.items.find((item) => item.key === 'impact-evidence')?.awardedScore).toBe(
        expectedImpact,
      );
      expect(result.projectScore).toBe(expectedProject);
    },
  );

  it.each([
    {
      score: 2,
      cvText: 'Tham gia phát triển và triển khai hệ thống quản lý doanh nghiệp.',
      label: 'generic participation without measurable evidence',
    },
    {
      score: 7,
      cvText:
        'Dẫn dắt nhóm 6 thành viên triển khai hệ thống cho 20.000 người dùng, giảm 35% thời gian xử lý.',
      label: 'clear role, scale and measurable result',
    },
  ])('accepts an in-range impact score for $label', async ({ score, cvText }) => {
    const [result] = await scoreWithImpactEvidence(score, cvText);
    const impact = result.criteriaBreakdown
      .find((item) => item.key === 'projects')
      ?.items.find((item) => item.key === 'impact-evidence');

    expect(impact?.awardedScore).toBe(score);
  });
});

async function scoreWithImpactEvidence(impactScore: number | undefined, cvText = 'CV ứng viên') {
  const applicationId = '33333333-3333-4333-8333-333333333333';
  const criteriaBreakdown = CV_SCORING_RUBRIC.filter(
    (criterion) => criterion.key !== 'education',
  ).map((criterion) => ({
    key: criterion.key,
    summary: `Giải thích ${criterion.label}`,
    items: criterion.criteria.flatMap((item) => {
      if (item.key === 'impact-evidence' && impactScore === undefined) {
        return [];
      }
      const awardedScore =
        item.key === 'impact-evidence'
          ? impactScore
          : criterion.key === 'projects'
            ? item.maxScore
            : 0;
      return [
        {
          key: item.key,
          awardedScore,
          reason: `Lý do cho ${item.label}`,
          evidence: cvText,
        },
      ];
    }),
  }));

  global.fetch = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      applicationId,
                      skillScore: 0,
                      experienceScore: 0,
                      projectScore: 20,
                      candidateEducationLevel: null,
                      matchedSkills: [],
                      missingSkills: [],
                      strengths: [],
                      weaknesses: [],
                      criteriaBreakdown,
                      summary: 'Đánh giá dự án.',
                      recommendation: 'not_fit',
                    },
                  ]),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  const service = new GeminiScoringService(new ConfigService({ geminiApiKey: 'test-gemini-key' }));
  return service.scoreBatch('Yêu cầu công việc', [
    {
      applicationId,
      candidateName: 'Nguyễn Văn B',
      cvText,
      semanticScore: 70,
      candidateEducationLevel: null,
    },
  ]);
}
