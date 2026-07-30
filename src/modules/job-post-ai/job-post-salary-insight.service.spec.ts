import { CompanyType, JobStatus, ModerationStatus, SalaryPeriod } from '@prisma/client';
import { JobPostSalaryInsightService } from './job-post-salary-insight.service';

const dto = {
  title: 'Senior React Developer',
  description:
    '<p>Phát triển nền tảng tuyển dụng bằng React và TypeScript, phối hợp với Product.</p>',
  requirements: '<p>Ba năm kinh nghiệm React, TypeScript và REST API.</p>',
  yearsOfExperience: 3,
  jobCategoryId: '11111111-1111-4111-8111-111111111111',
  experienceLevelId: '22222222-2222-4222-8222-222222222222',
  skillIds: ['33333333-3333-4333-8333-333333333333'],
};

function marketJob(salaryMin: number, salaryMax: number) {
  return {
    title: 'Senior React Developer',
    description: '<p>Phát triển ứng dụng React và TypeScript.</p>',
    requirements: '<p>Kinh nghiệm React, REST API.</p>',
    salaryMin,
    salaryMax,
    salaryPeriod: SalaryPeriod.MONTH,
    jobCategoryId: dto.jobCategoryId,
    experienceLevelId: dto.experienceLevelId,
    publishedAt: new Date(),
    jobPostSkills: [
      {
        skillId: dto.skillIds[0],
        minYearsExperience: 3,
        skill: { name: 'React' },
      },
    ],
    jobPostLocations: [],
    jobEmbedding: { embeddingVector: [1, 0] },
    company: {
      type: CompanyType.PRODUCT,
      companySize: '4',
    },
    status: JobStatus.PUBLISHED,
    moderationStatus: ModerationStatus.APPROVED,
  };
}

function marketContextMocks() {
  return {
    skill: {
      findMany: jest.fn().mockResolvedValue([{ id: dto.skillIds[0], name: 'React' }]),
    },
    experienceLevel: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Senior' }),
    },
    jobCategory: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Backend Developer' }),
    },
  };
}

describe('JobPostSalaryInsightService', () => {
  it('returns P25, median and P75 from similar public salary posts', async () => {
    const prisma = {
      ...marketContextMocks(),
      companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
      jobPost: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            marketJob(20_000_000, 30_000_000),
            marketJob(22_500_000, 32_500_000),
            marketJob(25_000_000, 35_000_000),
            marketJob(27_500_000, 37_500_000),
            marketJob(30_000_000, 40_000_000),
          ]),
      },
    };
    const embeddings = {
      createEmbedding: jest.fn().mockResolvedValue([1, 0]),
      cosineSimilarity: jest.fn().mockReturnValue(1),
    };
    const salaryResearch = { research: jest.fn() };
    const service = new JobPostSalaryInsightService(
      prisma as never,
      embeddings as never,
      salaryResearch as never,
    );

    const result = await service.analyze(dto);

    expect(result).toMatchObject({
      available: true,
      sampleSize: 5,
      confidence: 'LOW',
      market: {
        p25: 27_500_000,
        median: 30_000_000,
        p75: 32_500_000,
      },
      recommended: {
        salaryMin: 27_500_000,
        salaryMax: 32_500_000,
      },
    });
    expect(result.matchedFactors).toEqual(
      expect.arrayContaining(['Chức danh tương đồng', 'Cùng cấp bậc', 'Kỹ năng liên quan']),
    );
  });

  it('does not invent a market range when fewer than five matches exist', async () => {
    const prisma = {
      ...marketContextMocks(),
      companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
      jobPost: { findMany: jest.fn().mockResolvedValue([marketJob(20_000_000, 30_000_000)]) },
    };
    const embeddings = {
      createEmbedding: jest.fn().mockRejectedValue(new Error('API unavailable')),
      cosineSimilarity: jest.fn(),
    };
    const salaryResearch = { research: jest.fn().mockResolvedValue(null) };
    const service = new JobPostSalaryInsightService(
      prisma as never,
      embeddings as never,
      salaryResearch as never,
    );

    await expect(service.analyze(dto)).resolves.toMatchObject({
      available: false,
      sampleSize: 1,
    });
  });

  it('falls back to cited web research when UpNext has too few matching posts', async () => {
    const prisma = {
      ...marketContextMocks(),
      companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
      jobPost: {
        findMany: jest.fn().mockResolvedValue([marketJob(20_000_000, 30_000_000)]),
      },
    };
    const embeddings = {
      createEmbedding: jest.fn().mockResolvedValue([1, 0]),
      cosineSimilarity: jest.fn().mockReturnValue(1),
    };
    const salaryResearch = {
      research: jest.fn().mockResolvedValue({
        p25: 15_000_000,
        median: 21_000_000,
        p75: 28_000_000,
        confidence: 'MEDIUM',
        summary: 'Tổng hợp từ các báo cáo và tin tuyển dụng công khai.',
        evidenceNotes: ['Đã chuẩn hóa về lương gross theo tháng.'],
        sources: [
          { title: 'ITviec', url: 'https://example.com/itviec' },
          { title: 'TopCV', url: 'https://example.com/topcv' },
          { title: 'Reeracoen', url: 'https://example.com/reeracoen' },
        ],
        searchQueries: ['Junior PHP Laravel salary Vietnam'],
        searchedAt: '2026-07-25T00:00:00.000Z',
        model: 'gemini-3.1-pro-preview',
      }),
    };
    const service = new JobPostSalaryInsightService(
      prisma as never,
      embeddings as never,
      salaryResearch as never,
    );

    await expect(service.analyze(dto)).resolves.toMatchObject({
      available: true,
      basis: 'WEB_GROUNDED_AI',
      sampleSize: 3,
      market: {
        p25: 15_000_000,
        median: 21_000_000,
        p75: 28_000_000,
      },
      sources: [{ title: 'ITviec' }, { title: 'TopCV' }, { title: 'Reeracoen' }],
    });
  });

  it('uses the authenticated recruiter company segment for salary research', async () => {
    const prisma = {
      ...marketContextMocks(),
      recruiterAccount: {
        findUnique: jest.fn().mockResolvedValue({
          company: {
            type: CompanyType.PRODUCT,
            companySize: '4',
          },
        }),
      },
      companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
      jobPost: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            marketJob(20_000_000, 30_000_000),
            marketJob(21_000_000, 31_000_000),
            marketJob(22_000_000, 32_000_000),
            marketJob(23_000_000, 33_000_000),
            marketJob(24_000_000, 34_000_000),
          ]),
      },
    };
    const embeddings = {
      createEmbedding: jest.fn().mockResolvedValue([1, 0]),
      cosineSimilarity: jest.fn().mockReturnValue(1),
    };
    const salaryResearch = { research: jest.fn().mockResolvedValue(null) };
    const service = new JobPostSalaryInsightService(
      prisma as never,
      embeddings as never,
      salaryResearch as never,
    );

    const result = await service.analyze(dto, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(prisma.recruiterAccount.findUnique).toHaveBeenCalledWith({
      where: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      select: {
        company: {
          select: {
            type: true,
            companySize: true,
          },
        },
      },
    });
    expect(salaryResearch.research).toHaveBeenCalledWith(
      expect.objectContaining({
        companyType: 'Công ty sản phẩm (Product)',
        companySize: '100–499 nhân sự',
      }),
    );
    expect(result).toMatchObject({
      available: true,
      matchedFactors: expect.arrayContaining(['Cùng loại hình công ty', 'Cùng quy mô công ty']),
    });
  });

  it('rejects senior or unrelated-stack salaries for a junior PHP Laravel role', async () => {
    const juniorDto = {
      ...dto,
      title: 'Backend Developer PHP Laravel',
      description: '<p>Phát triển API backend bằng PHP và Laravel, tích hợp giao diện Vue.js.</p>',
      requirements: '<p>Một năm kinh nghiệm với PHP, Laravel và Vue.js.</p>',
      yearsOfExperience: 1,
      experienceLevelId: '44444444-4444-4444-8444-444444444444',
      skillIds: ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'],
    };
    const seniorLaravel = {
      ...marketJob(25_000_000, 30_000_000),
      title: 'Senior Backend Developer PHP Laravel',
      description: '<p>Phát triển hệ thống PHP Laravel.</p>',
      requirements: '<p>Năm năm kinh nghiệm PHP Laravel.</p>',
      experienceLevelId: dto.experienceLevelId,
      jobPostSkills: [
        {
          skillId: juniorDto.skillIds[0],
          minYearsExperience: 5,
          skill: { name: 'Laravel' },
        },
      ],
    };
    const juniorReact = {
      ...marketJob(25_000_000, 30_000_000),
      title: 'Junior Frontend React Developer',
      description: '<p>Phát triển giao diện React và TypeScript.</p>',
      requirements: '<p>Một năm kinh nghiệm React.</p>',
      experienceLevelId: juniorDto.experienceLevelId,
      jobPostSkills: [
        {
          skillId: dto.skillIds[0],
          minYearsExperience: 1,
          skill: { name: 'React' },
        },
      ],
    };
    const prisma = {
      ...marketContextMocks(),
      companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
      jobPost: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            seniorLaravel,
            seniorLaravel,
            seniorLaravel,
            juniorReact,
            juniorReact,
          ]),
      },
    };
    const embeddings = {
      createEmbedding: jest.fn().mockResolvedValue([1, 0]),
      cosineSimilarity: jest.fn().mockReturnValue(1),
    };
    const salaryResearch = { research: jest.fn().mockResolvedValue(null) };
    const service = new JobPostSalaryInsightService(
      prisma as never,
      embeddings as never,
      salaryResearch as never,
    );

    await expect(service.analyze(juniorDto)).resolves.toMatchObject({
      available: false,
      sampleSize: 0,
    });
  });

  it('calculates a range only from matching junior PHP Laravel samples', async () => {
    const juniorLevelId = '44444444-4444-4444-8444-444444444444';
    const phpSkillId = '55555555-5555-4555-8555-555555555555';
    const vueSkillId = '66666666-6666-4666-8666-666666666666';
    const marketLaravelSkillId = '77777777-7777-4777-8777-777777777777';
    const juniorDto = {
      ...dto,
      title: 'Backend Developer PHP Laravel',
      description: '<p>Phát triển API backend bằng PHP và Laravel, tích hợp giao diện Vue.js.</p>',
      requirements: '<p>Một năm kinh nghiệm với PHP, Laravel và Vue.js.</p>',
      yearsOfExperience: 1,
      experienceLevelId: juniorLevelId,
      skillIds: [],
      requiredSkillIds: [phpSkillId],
      relatedSkillIds: [vueSkillId],
      skillKeywords: ['Laravel', 'Vue.js'],
    };
    const matchingJob = (salaryMin: number, salaryMax: number) => ({
      ...marketJob(salaryMin, salaryMax),
      title: 'Junior Backend Developer PHP Laravel',
      description: '<p>Phát triển API backend bằng PHP Laravel và Vue.js.</p>',
      requirements: '<p>Yêu cầu một năm kinh nghiệm PHP Laravel.</p>',
      experienceLevelId: juniorLevelId,
      jobPostSkills: [
        {
          skillId: marketLaravelSkillId,
          minYearsExperience: 1,
          skill: { name: 'Laravel' },
        },
      ],
    });
    const unrelatedSenior = {
      ...matchingJob(25_000_000, 30_000_000),
      title: 'Senior Backend Developer PHP Laravel',
      experienceLevelId: dto.experienceLevelId,
      jobPostSkills: [
        {
          skillId: marketLaravelSkillId,
          minYearsExperience: 5,
          skill: { name: 'Laravel' },
        },
      ],
    };
    const prisma = {
      ...marketContextMocks(),
      companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
      jobPost: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            matchingJob(10_000_000, 14_000_000),
            matchingJob(11_000_000, 15_000_000),
            matchingJob(12_000_000, 16_000_000),
            matchingJob(13_000_000, 17_000_000),
            matchingJob(14_000_000, 18_000_000),
            unrelatedSenior,
          ]),
      },
    };
    const embeddings = {
      createEmbedding: jest.fn().mockResolvedValue([1, 0]),
      cosineSimilarity: jest.fn().mockReturnValue(1),
    };
    const salaryResearch = { research: jest.fn() };
    const service = new JobPostSalaryInsightService(
      prisma as never,
      embeddings as never,
      salaryResearch as never,
    );

    const result = await service.analyze(juniorDto);

    expect(result).toMatchObject({
      available: true,
      sampleSize: 5,
      market: {
        p25: 13_000_000,
        median: 14_000_000,
        p75: 15_000_000,
      },
    });
    expect(result.matchedFactors).toEqual(
      expect.arrayContaining(['Cùng tech stack', 'Từ khóa liên quan']),
    );
  });
});
