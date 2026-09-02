import {
  GroundedResearchProviderPort,
  GroundedResearchResponse,
} from './ports/grounded-research-provider.port';
import { SalaryResearchInput, SalaryResearchService } from './salary-research.service';

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

const threeSources = [
  { title: 'ITviec', url: 'https://itviec.com/it-jobs' },
  { title: 'TopCV', url: 'https://www.topcv.vn/viec-lam' },
  { title: 'Reeracoen', url: 'https://www.reeracoen.com.vn/en/jobs' },
];

function answer(overrides: Partial<GroundedResearchResponse> = {}): GroundedResearchResponse {
  return {
    text: JSON.stringify({
      available: true,
      salaryMin: 15_100_000,
      median: 20_900_000,
      salaryMax: 27_900_000,
      confidence: 'MEDIUM',
      summary: 'Khoảng lương tổng hợp từ các báo cáo và tin tuyển dụng.',
      evidenceNotes: ['Hai nguồn tuyển dụng và một báo cáo lương.'],
    }),
    sources: threeSources,
    searchQueries: ['Junior PHP Laravel salary Vietnam'],
    inputTokens: 400,
    outputTokens: 300,
    modelName: 'upnext-ai/gemini',
    ...overrides,
  };
}

/** Returns the port and its spy separately so assertions never read the method off the object. */
function stub(result: GroundedResearchResponse | Error, configured = true) {
  // Typed through the port so the recorded call keeps its request type for assertions.
  const generateGrounded = jest.fn<
    ReturnType<GroundedResearchProviderPort['generateGrounded']>,
    Parameters<GroundedResearchProviderPort['generateGrounded']>
  >(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
  const port: GroundedResearchProviderPort = {
    modelName: 'stub',
    isConfigured: () => configured,
    generateGrounded,
  };
  return { port, generateGrounded };
}

describe('SalaryResearchService', () => {
  it('returns a validated salary range with independent grounded sources and caches it', async () => {
    const { port, generateGrounded } = stub(answer());
    const service = new SalaryResearchService(port);

    const first = await service.research(input);
    const second = await service.research(input);

    expect(first).toMatchObject({
      p25: 15_000_000,
      median: 21_000_000,
      p75: 28_000_000,
      confidence: 'MEDIUM',
      sources: threeSources,
      // The provider that actually answered, so a result can be traced to the path that
      // produced it instead of to a model name assumed at compile time.
      model: 'upnext-ai/gemini',
    });
    expect(second).toEqual(first);
    expect(generateGrounded).toHaveBeenCalledTimes(1);

    // The JSON shape has to travel in the prompt: a response schema empties the grounding
    // metadata, and a result without citations is rejected below.
    const request = generateGrounded.mock.calls[0][0];
    expect(request.prompt).toContain('"evidenceNotes": string[]');
    expect(request.systemInstruction).toContain('chuyên gia nghiên cứu lương IT');
  });

  it('recovers valid salary fields when a non-critical JSON field is malformed', async () => {
    const { port } = stub(
      answer({
        text:
          '{"available":true,"salaryMin":12000000,"median":15000000,' +
          '"salaryMax":18000000,"confidence":"MEDIUM",' +
          '"summary":"Dữ liệu từ nhiều nguồn.","evidenceNotes":.}',
      }),
    );
    const service = new SalaryResearchService(port);

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
    const { port } = stub(
      answer({
        text: JSON.stringify({
          available: true,
          salaryMin: 15_000_000,
          median: 20_000_000,
          salaryMax: 25_000_000,
          confidence: 'HIGH',
          summary: 'Chỉ có một nguồn.',
          evidenceNotes: [],
        }),
        sources: [{ title: 'Single source', url: 'https://example.com/one' }],
      }),
    );
    const service = new SalaryResearchService(port);

    await expect(service.research(input)).resolves.toBeNull();
  });

  it('rejects multiple pages from one domain even when their source titles differ', async () => {
    const { port } = stub(
      answer({
        sources: [
          { title: 'Báo cáo lương 2026', url: 'https://www.example.com/salary-report' },
          { title: 'Tin tuyển dụng Backend', url: 'https://example.com/jobs/backend' },
        ],
      }),
    );
    const service = new SalaryResearchService(port);

    await expect(service.research(input)).resolves.toBeNull();
  });

  it('counts publisher domains from Gemini grounding redirects without weakening source checks', async () => {
    const { port } = stub(
      answer({
        sources: [
          {
            title: 'itviec.com',
            url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/first',
          },
          {
            title: 'topcv.vn',
            url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/second',
          },
        ],
      }),
    );
    const service = new SalaryResearchService(port);

    await expect(service.research(input)).resolves.toMatchObject({
      p25: 15_000_000,
      median: 21_000_000,
      p75: 28_000_000,
      confidence: 'LOW',
    });
  });

  it('coalesces concurrent research for the same market profile into one provider call', async () => {
    let resolveAnswer: ((value: GroundedResearchResponse) => void) | undefined;
    const response = new Promise<GroundedResearchResponse>((resolve) => {
      resolveAnswer = resolve;
    });
    const { port, generateGrounded } = stub(answer());
    generateGrounded.mockImplementation(() => response);
    const service = new SalaryResearchService(port);

    const first = service.research(input);
    const second = service.research(input);
    resolveAnswer?.(answer());

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.any(Object),
      expect.any(Object),
    ]);
    expect(generateGrounded).toHaveBeenCalledTimes(1);
  });

  it('rejects a salary result the model produced without searching at all', async () => {
    // Citations attach to answer text, so an answer can arrive with sources but no queries;
    // without a query there is no evidence the figures came from the web rather than memory.
    const { port } = stub(answer({ searchQueries: [] }));
    const service = new SalaryResearchService(port);

    await expect(service.research(input)).resolves.toBeNull();
  });

  it('does not cache a provider failure, so the next request retries', async () => {
    const { port, generateGrounded } = stub(new Error('AI_MODEL_TIMEOUT'));
    const service = new SalaryResearchService(port);

    await expect(service.research(input)).resolves.toBeNull();
    await expect(service.research(input)).resolves.toBeNull();
    expect(generateGrounded).toHaveBeenCalledTimes(2);
  });

  it('skips the call entirely when no provider is configured', async () => {
    const { port, generateGrounded } = stub(answer(), false);
    const service = new SalaryResearchService(port);

    await expect(service.research(input)).resolves.toBeNull();
    expect(generateGrounded).not.toHaveBeenCalled();
  });
});
