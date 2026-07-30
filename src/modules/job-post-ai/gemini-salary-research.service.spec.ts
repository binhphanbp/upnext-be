import { ConfigService } from '@nestjs/config';
import { GeminiSalaryResearchService, SalaryResearchInput } from './gemini-salary-research.service';

const input: SalaryResearchInput = {
  title: 'Backend Developer',
  description: '<p>Phát triển API cho sản phẩm SaaS.</p>',
  requirements: '<p>Hai năm kinh nghiệm PHP Laravel.</p>',
  yearsOfExperience: 2,
  experienceLevelName: 'Junior',
  jobCategoryName: 'Backend Developer',
  requiredSkillNames: ['PHP', 'Laravel'],
  relatedSkillNames: [],
  skillKeywords: ['Yii2'],
  cities: ['Hồ Chí Minh'],
};

describe('GeminiSalaryResearchService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns a validated salary range with independent grounded sources and caches it', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      available: true,
                      salaryMin: 15_100_000,
                      median: 20_900_000,
                      salaryMax: 27_900_000,
                      confidence: 'MEDIUM',
                      summary: 'Khoảng lương tổng hợp từ các báo cáo và tin tuyển dụng.',
                      evidenceNotes: ['Hai nguồn tuyển dụng và một báo cáo lương.'],
                    }),
                  },
                ],
              },
              groundingMetadata: {
                webSearchQueries: ['Junior PHP Laravel salary Vietnam'],
                groundingChunks: [
                  { web: { title: 'ITviec', uri: 'https://example.com/itviec' } },
                  { web: { title: 'TopCV', uri: 'https://example.com/topcv' } },
                  { web: { title: 'Reeracoen', uri: 'https://example.com/reeracoen' } },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as jest.MockedFunction<typeof fetch>;
    const service = new GeminiSalaryResearchService(
      new ConfigService({ geminiApiKey: 'test-key' }),
    );

    const first = await service.research(input);
    const second = await service.research(input);

    expect(first).toMatchObject({
      p25: 15_000_000,
      median: 21_000_000,
      p75: 28_000_000,
      confidence: 'MEDIUM',
      sources: [{ title: 'ITviec' }, { title: 'TopCV' }, { title: 'Reeracoen' }],
    });
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(typeof request.body).toBe('string');
    const requestBody = JSON.parse(request.body as string) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
      tools?: Array<Record<string, unknown>>;
      generationConfig?: Record<string, unknown>;
    };
    // Structured output silently empties groundingMetadata, and a result without citations is
    // rejected downstream, so the JSON shape has to travel in the prompt instead.
    expect(requestBody.tools).toEqual([{ googleSearch: {} }]);
    expect(requestBody.generationConfig).not.toHaveProperty('responseFormat');
    expect(requestBody.generationConfig).not.toHaveProperty('responseSchema');
    expect(requestBody.contents?.[0]?.parts?.[0]?.text).toContain('"evidenceNotes": string[]');
  });

  it('recovers valid salary fields when a non-critical JSON field is malformed', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text:
                      '{"available":true,"salaryMin":12000000,"median":15000000,' +
                      '"salaryMax":18000000,"confidence":"MEDIUM",' +
                      '"summary":"Dữ liệu từ nhiều nguồn.","evidenceNotes":.}',
                  },
                ],
              },
              finishReason: 'STOP',
              groundingMetadata: {
                webSearchQueries: ['Junior PHP Laravel salary Vietnam'],
                groundingChunks: [
                  { web: { title: 'ITviec', uri: 'https://example.com/itviec' } },
                  { web: { title: 'TopCV', uri: 'https://example.com/topcv' } },
                  { web: { title: 'Reeracoen', uri: 'https://example.com/reeracoen' } },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as jest.MockedFunction<typeof fetch>;
    const service = new GeminiSalaryResearchService(
      new ConfigService({ geminiApiKey: 'test-key' }),
    );

    await expect(service.research(input)).resolves.toMatchObject({
      p25: 12_000_000,
      median: 15_000_000,
      p75: 18_000_000,
      confidence: 'MEDIUM',
      summary: 'Dữ liệu từ nhiều nguồn.',
      evidenceNotes: [],
    });
  });

  it('rejects a salary result without two independent grounded sources', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      available: true,
                      salaryMin: 15_000_000,
                      median: 20_000_000,
                      salaryMax: 25_000_000,
                      confidence: 'HIGH',
                      summary: 'Chỉ có một nguồn.',
                      evidenceNotes: [],
                    }),
                  },
                ],
              },
              groundingMetadata: {
                webSearchQueries: ['Junior PHP salary'],
                groundingChunks: [
                  { web: { title: 'Single source', uri: 'https://example.com/one' } },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as jest.MockedFunction<typeof fetch>;
    const service = new GeminiSalaryResearchService(
      new ConfigService({ geminiApiKey: 'test-key' }),
    );

    await expect(service.research(input)).resolves.toBeNull();
  });
});
