import { BadRequestException } from '@nestjs/common';
import { EducationLevel, SalaryPeriod } from '@prisma/client';
import { JobPostOutputLanguage, JobPostPresentationStyle } from './dto/generate-job-post-draft.dto';
import { GeminiJobPostService } from './gemini-job-post.service';
import { JobPostExtractionProviderPort } from './ports/job-post-extraction-provider.port';
import { JobPostGenerationProviderPort } from './ports/job-post-generation-provider.port';

describe('GeminiJobPostService', () => {
  const generatedDraft = {
    title: 'Senior Backend Engineer',
    description: '<p>Xây dựng nền tảng tuyển dụng.</p>',
    requirements: '<ul><li>TypeScript</li></ul>',
    benefits: '',
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: SalaryPeriod.MONTH,
    salaryIsNegotiable: true,
    vacanciesCount: 1,
    educationLevel: EducationLevel.ANY,
    workingDays: null,
    jobCategoryName: 'Backend Engineering',
    experienceLevelName: 'Senior',
    employmentTypeName: 'Full-time',
    skillNames: ['TypeScript'],
    specializationNames: ['Backend'],
  };

  it('routes JD generation through the controlled quality tier and preserves model metadata', async () => {
    const generateStructured = jest.fn().mockResolvedValue({
      value: generatedDraft,
      inputTokens: 120,
      outputTokens: 80,
      modelName: 'gemini-2.5-flash',
    });
    const provider = {
      modelName: 'upnext-ai/gemini',
      isConfigured: () => true,
      generateStructured,
    } as unknown as JobPostGenerationProviderPort;
    const extractionProvider = {
      modelName: 'gemini-2.5-flash',
      isConfigured: () => true,
      extractStructured: jest.fn(),
    } as unknown as JobPostExtractionProviderPort;
    const service = new GeminiJobPostService(provider, extractionProvider);

    await expect(
      service.generateDraft(
        {
          title: 'Senior Backend Engineer',
          requiredSkillNames: ['TypeScript'],
          preferredSkillNames: [],
          keywords: [],
          outputLanguage: JobPostOutputLanguage.VI,
          presentationStyle: JobPostPresentationStyle.SKILL_FOCUSED,
        },
        {
          jobCategories: ['Backend Engineering'],
          employmentTypes: ['Full-time'],
          experienceLevels: ['Senior'],
          specializations: ['Backend'],
        },
      ),
    ).resolves.toEqual({ draft: generatedDraft, modelName: 'gemini-2.5-flash' });

    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        responseSchema: expect.objectContaining({ type: 'OBJECT' }),
      }),
    );
  });

  it('sends JD imports through the dedicated extraction provider and preserves source files', async () => {
    const generationProvider = {
      modelName: 'upnext-ai/gemini',
      isConfigured: () => true,
      generateStructured: jest.fn(),
    } as unknown as JobPostGenerationProviderPort;
    const extractStructured = jest.fn().mockResolvedValue({
      value: generatedDraft,
      inputTokens: 180,
      outputTokens: 90,
      modelName: 'upnext-ai/gemini-2.5-flash',
    });
    const extractionProvider = {
      modelName: 'upnext-ai/gemini',
      isConfigured: () => true,
      extractStructured,
    } as unknown as JobPostExtractionProviderPort;
    const service = new GeminiJobPostService(generationProvider, extractionProvider);

    await expect(
      service.extractDraft(
        {
          sourceLabel: 'job-description.pdf',
          file: { mimeType: 'application/pdf', base64Data: 'cGRmLWNvbnRlbnQ=' },
        },
        {
          jobCategories: ['Backend Engineering'],
          employmentTypes: ['Full-time'],
          experienceLevels: ['Senior'],
          specializations: ['Backend'],
        },
      ),
    ).resolves.toEqual({ draft: generatedDraft, modelName: 'upnext-ai/gemini-2.5-flash' });

    expect(extractStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        file: { mimeType: 'application/pdf', base64Data: 'cGRmLWNvbnRlbnQ=' },
        temperature: 0.3,
      }),
    );
  });

  it('does not retry a malformed structured response as an infrastructure failure', async () => {
    const generationProvider = {
      modelName: 'upnext-ai/gemini',
      isConfigured: () => true,
      generateStructured: jest.fn(),
    } as unknown as JobPostGenerationProviderPort;
    const extractStructured = jest.fn().mockRejectedValue(new Error('AI_INVALID_OUTPUT'));
    const extractionProvider = {
      modelName: 'upnext-ai/gemini',
      isConfigured: () => true,
      extractStructured,
    } as unknown as JobPostExtractionProviderPort;
    const service = new GeminiJobPostService(generationProvider, extractionProvider);

    await expect(
      service.extractDraft(
        { sourceLabel: 'pasted JD', sourceText: 'Nội dung JD hợp lệ để kiểm thử.' },
        {
          jobCategories: [],
          employmentTypes: [],
          experienceLevels: [],
          specializations: [],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(extractStructured).toHaveBeenCalledTimes(1);
  });

  it('surfaces a schema-breaking draft as invalid AI output instead of accepting it', async () => {
    const generationProvider = {
      modelName: 'upnext-ai/gemini',
      isConfigured: () => true,
      generateStructured: jest.fn(),
    } as unknown as JobPostGenerationProviderPort;
    const extractStructured = jest.fn().mockResolvedValue({
      value: ['not-a-job-post'],
      inputTokens: 2,
      outputTokens: 1,
      modelName: 'upnext-ai/gemini-2.5-flash',
    });
    const extractionProvider = {
      modelName: 'upnext-ai/gemini',
      isConfigured: () => true,
      extractStructured,
    } as unknown as JobPostExtractionProviderPort;
    const service = new GeminiJobPostService(generationProvider, extractionProvider);

    await expect(
      service.extractDraft(
        { sourceLabel: 'pasted JD', sourceText: 'Nội dung JD để kiểm thử.' },
        { jobCategories: [], employmentTypes: [], experienceLevels: [], specializations: [] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('AI chưa thể đọc chính xác'),
      }),
    });
    expect(extractStructured).toHaveBeenCalledTimes(1);
  });
});
