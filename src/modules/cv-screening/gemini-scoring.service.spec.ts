import { ConfigService } from '@nestjs/config';
import { GeminiScoringService } from './gemini-scoring.service';
import { CV_SCORING_RUBRIC } from './scoring-rubric';

describe('GeminiScoringService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('derives every criterion score from the explainable rubric breakdown', async () => {
    const applicationId = '22222222-2222-4222-8222-222222222222';
    const criteriaBreakdown = CV_SCORING_RUBRIC.map((criterion) => ({
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
      overallScore: 100,
      skillScore: 40,
      experienceScore: 30,
      projectScore: 20,
      educationScore: 10,
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
      },
    ]);

    expect(result.skillScore).toBe(20);
    expect(result.experienceScore).toBe(15);
    expect(result.projectScore).toBe(10);
    expect(result.educationScore).toBe(5);
    expect(result.criteriaBreakdown).toHaveLength(4);
    expect(result.criteriaBreakdown[0].items).toHaveLength(4);
    expect(result.raw).toMatchObject({ criteriaBreakdown });
  });
});
