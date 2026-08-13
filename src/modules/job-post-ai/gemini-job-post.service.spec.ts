import { ConfigService } from '@nestjs/config';
import { EducationLevel, SalaryPeriod } from '@prisma/client';
import { LlmProviderPort } from '../ai/ports/llm-provider.port';
import { JobPostOutputLanguage, JobPostPresentationStyle } from './dto/generate-job-post-draft.dto';
import { GeminiJobPostService } from './gemini-job-post.service';

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
      streamText: jest.fn(),
    } as unknown as LlmProviderPort;
    const service = new GeminiJobPostService(new ConfigService({}), provider);

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
        modelTier: 'quality',
        temperature: 0.3,
        responseSchema: expect.objectContaining({ type: 'OBJECT' }),
      }),
    );
  });
});
