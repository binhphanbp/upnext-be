import { EducationLevel } from '@prisma/client';
import { LlmProviderPort } from '../ai/ports/llm-provider.port';
import { estimateGeminiCostVnd, GeminiScoringService } from './gemini-scoring.service';
import { CV_SCORING_RUBRIC } from './scoring-rubric';

describe('GeminiScoringService', () => {
  afterEach(() => {
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
    };

    const { service, provider } = createService([geminiResult]);
    const { results, modelName } = await service.scoreBatch('Yêu cầu công việc', [
      {
        applicationId,
        cvText: 'CV ứng viên',
        candidateEducationLevel: null,
      },
    ]);
    const [result] = results;

    expect(result.skillScore).toBe(20);
    expect(result.experienceScore).toBe(15);
    expect(result.projectScore).toBe(10);
    expect(result.candidateEducationLevel).toBe(EducationLevel.BACHELOR);
    expect(result.criteriaBreakdown).toHaveLength(3);
    expect(result.criteriaBreakdown[0].items).toHaveLength(4);
    expect(result.criteriaBreakdown.find((item) => item.key === 'projects')?.items).toHaveLength(3);
    expect(result.raw).toMatchObject({ criteriaBreakdown });
    expect(modelName).toBe('gemini-2.5-flash');

    const request = provider.generateStructured.mock.calls[0][0];
    const schema = request.responseSchema as {
      items: { properties: Record<string, unknown> };
    };
    expect(request.modelTier).toBe('quality');
    expect(request.executionProfile).toBe('batch');
    expect(schema.items.properties).not.toHaveProperty('educationScore');
    expect(request.systemInstruction).not.toContain('"key":"education"');
    expect(request.systemInstruction).toContain('"key":"impact-evidence"');
    expect(request.systemInstruction).not.toContain('"key":"impact-scale"');
    expect(request.systemInstruction).not.toContain('"key":"evidence-quality"');
    expect(request.systemInstruction).toContain(
      'Có số liệu nhưng không rõ vai trò cá nhân thì impact-evidence không được 7 điểm',
    );
    // Identity must not reach the model: it is not needed to score fit and is
    // an obvious channel for demographic bias.
    expect(request.messages[0].text).not.toContain('candidateName');
    expect(request.systemInstruction).not.toContain('CV ứng viên');
    expect(schema.items.properties).not.toHaveProperty('recommendation');
  });

  it('surfaces token usage so AI spend can be measured', async () => {
    const applicationId = '44444444-4444-4444-8444-444444444444';
    const { service } = createService([], 12000, 800);
    const { usage } = await service.scoreBatch('Yêu cầu công việc', [
      { applicationId, cvText: 'CV', candidateEducationLevel: null },
    ]);

    expect(usage).toEqual({ inputTokens: 12000, outputTokens: 800 });
    // 12000/1e6*7600 + 800/1e6*63500 = 91.2 + 50.8
    expect(estimateGeminiCostVnd(usage.inputTokens, usage.outputTokens)).toBeCloseTo(142, 1);
  });

  it('reports zero token usage when the provider omits usage counts', async () => {
    const applicationId = '55555555-5555-4555-8555-555555555555';
    const { service } = createService([]);
    const { usage } = await service.scoreBatch('Yêu cầu công việc', [
      { applicationId, cvText: 'CV', candidateEducationLevel: null },
    ]);

    expect(usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(estimateGeminiCostVnd(usage.inputTokens, usage.outputTokens)).toBe(0);
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

  const { service } = createService([
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
    },
  ]);
  const { results } = await service.scoreBatch('Yêu cầu công việc', [
    {
      applicationId,
      cvText,
      candidateEducationLevel: null,
    },
  ]);
  return results;
}

function createService(value: unknown, inputTokens = 0, outputTokens = 0) {
  const provider = {
    modelName: 'test-provider',
    isConfigured: jest.fn().mockReturnValue(true),
    generateStructured: jest.fn().mockResolvedValue({
      value,
      inputTokens,
      outputTokens,
      modelName: 'gemini-2.5-flash',
    }),
    streamText: jest.fn(),
  } satisfies jest.Mocked<LlmProviderPort>;

  return { service: new GeminiScoringService(provider), provider };
}
