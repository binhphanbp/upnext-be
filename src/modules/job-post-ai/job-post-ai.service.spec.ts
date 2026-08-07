import { BadRequestException } from '@nestjs/common';
import { EducationLevel, SalaryPeriod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JobPostOutputLanguage, JobPostPresentationStyle } from './dto/generate-job-post-draft.dto';
import { GeminiJobPostService, RawJobPostDraft } from './gemini-job-post.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { JobPostAiService } from './job-post-ai.service';

describe('JobPostAiService', () => {
  const context = {
    company: {
      id: 'company-1',
      name: 'UpNext',
      description: '<p>Nền tảng tuyển dụng IT</p>',
      benefits: null,
      workingDays: 'Thứ 2 - Thứ 6',
    },
    categories: [{ id: 'category-1', name: 'Công nghệ thông tin' }],
    employmentTypes: [{ id: 'employment-1', name: 'Toàn thời gian' }],
    experienceLevels: [{ id: 'level-1', name: 'Senior' }],
    skills: [
      { id: 'skill-react', name: 'React' },
      { id: 'skill-typescript', name: 'TypeScript' },
    ],
    specializations: [{ id: 'specialization-1', name: 'Kỹ thuật phần mềm' }],
  };

  const rawDraft: RawJobPostDraft = {
    title: 'Senior React Developer',
    description: '<p>Phát triển sản phẩm.</p><script>alert(1)</script>',
    requirements: '<ul><li>React</li></ul>',
    benefits: '',
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: SalaryPeriod.MONTH,
    salaryIsNegotiable: true,
    vacanciesCount: 1,
    educationLevel: EducationLevel.ANY,
    workingDays: 'Thứ 2 - Thứ 6',
    jobCategoryName: 'Công nghệ thông tin',
    experienceLevelName: 'Senior',
    employmentTypeName: 'Toàn thời gian',
    skillNames: ['React', 'GraphQL'],
    specializationNames: ['Kỹ thuật phần mềm'],
  };

  let prisma: {
    recruiterAccount: { findUnique: jest.Mock };
    jobCategory: { findMany: jest.Mock };
    employmentType: { findMany: jest.Mock };
    experienceLevel: { findMany: jest.Mock };
    skill: { findMany: jest.Mock };
    specialization: { findMany: jest.Mock };
    $transaction?: jest.Mock;
  };
  let gemini: {
    modelName: string;
    generateDraft: jest.Mock;
    extractDraft: jest.Mock;
  };
  let quota: { consume: jest.Mock; reverse: jest.Mock };
  let service: JobPostAiService;

  beforeEach(() => {
    prisma = {
      recruiterAccount: { findUnique: jest.fn().mockResolvedValue({ company: context.company }) },
      jobCategory: { findMany: jest.fn().mockResolvedValue(context.categories) },
      employmentType: { findMany: jest.fn().mockResolvedValue(context.employmentTypes) },
      experienceLevel: { findMany: jest.fn().mockResolvedValue(context.experienceLevels) },
      skill: { findMany: jest.fn().mockResolvedValue(context.skills) },
      specialization: { findMany: jest.fn().mockResolvedValue(context.specializations) },
    };
    gemini = {
      modelName: 'gemini-test',
      generateDraft: jest.fn().mockResolvedValue(rawDraft),
      extractDraft: jest.fn().mockResolvedValue(rawDraft),
    };
    quota = {
      consume: jest.fn().mockResolvedValue({ usage: { id: 'usage-1' }, replayed: false }),
      reverse: jest.fn().mockResolvedValue({}),
    };
    // The AI credit is taken around the Gemini call, so the fake transaction just
    // hands the mocked client straight to the callback.
    prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));

    service = new JobPostAiService(
      prisma as unknown as PrismaService,
      gemini as unknown as GeminiJobPostService,
      quota as unknown as SubscriptionQuotaService,
    );
  });

  it('maps AI names to catalog IDs, keeps selected skills, and sanitizes rich text', async () => {
    const response = await service.generate('recruiter-1', {
      title: 'Senior React Developer',
      jobCategoryId: 'category-1',
      experienceLevelId: 'level-1',
      employmentTypeId: 'employment-1',
      requiredSkillIds: ['skill-typescript'],
      keywords: ['Fintech'],
      outputLanguage: JobPostOutputLanguage.VI,
      presentationStyle: JobPostPresentationStyle.SKILL_FOCUSED,
    });

    expect(response.draft.jobCategoryId).toBe('category-1');
    expect(response.draft.skillIds).toEqual(['skill-typescript', 'skill-react']);
    expect(response.draft.description).toBe('<p>Phát triển sản phẩm.</p>');
    expect(response.suggestions.unmatchedSkillNames).toEqual(['GraphQL']);
    expect(gemini.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredSkillNames: ['TypeScript'],
        keywords: ['Fintech'],
        companyDescription: 'Nền tảng tuyển dụng IT',
      }),
      expect.any(Object),
    );
  });

  it('rejects selected catalog IDs that do not exist', async () => {
    await expect(
      service.generate('recruiter-1', {
        title: 'Backend Developer',
        requiredSkillIds: ['00000000-0000-4000-8000-000000000000'],
        outputLanguage: JobPostOutputLanguage.VI,
        presentationStyle: JobPostPresentationStyle.TRADITIONAL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gemini.generateDraft).not.toHaveBeenCalled();
  });

  it('extracts pasted JD without inventing unmatched catalog values', async () => {
    const response = await service.extractText(
      'recruiter-1',
      'Senior React Developer cần React và TypeScript. Mô tả công việc đủ dài để trích xuất.',
    );

    expect(response.source).toBe('extracted');
    expect(response.draft.specializationIds).toEqual(['specialization-1']);
    expect(response.suggestions.unmatchedSkillNames).toEqual(['GraphQL']);
  });

  it('sends the specialization catalog to the model', async () => {
    await service.extractText(
      'recruiter-1',
      'Senior React Developer cần React và TypeScript. Mô tả công việc đủ dài để trích xuất.',
    );

    // Left out of the prompt, the model answers with invented names — or an empty array — and every
    // specialization ends up unmatched.
    expect(gemini.extractDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ specializations: ['Kỹ thuật phần mềm'] }),
    );
  });

  it('resolves a near-miss catalog name instead of dropping it', async () => {
    prisma.jobCategory.findMany.mockResolvedValue([
      { id: 'category-frontend', name: 'Frontend Engineering' },
      { id: 'category-backend', name: 'Backend Engineering' },
    ]);
    prisma.specialization.findMany.mockResolvedValue([
      { id: 'specialization-frontend', name: 'Frontend' },
    ]);
    gemini.extractDraft.mockResolvedValue({
      ...rawDraft,
      // What the model actually returns when it paraphrases the catalog entry.
      jobCategoryName: 'Frontend',
      specializationNames: ['Frontend Engineering'],
    });

    const response = await service.extractText(
      'recruiter-1',
      'Senior React Developer cần React và TypeScript. Mô tả công việc đủ dài để trích xuất.',
    );

    expect(response.draft.jobCategoryId).toBe('category-frontend');
    expect(response.draft.specializationIds).toEqual(['specialization-frontend']);
    expect(response.suggestions.unmatchedSpecializationNames).toEqual([]);
  });

  it('does not force a match between unrelated names', async () => {
    prisma.jobCategory.findMany.mockResolvedValue([{ id: 'category-1', name: 'Aviation' }]);
    gemini.extractDraft.mockResolvedValue({ ...rawDraft, jobCategoryName: 'Cybersecurity' });

    const response = await service.extractText(
      'recruiter-1',
      'Senior React Developer cần React và TypeScript. Mô tả công việc đủ dài để trích xuất.',
    );

    expect(response.draft.jobCategoryId).toBeNull();
  });
});
