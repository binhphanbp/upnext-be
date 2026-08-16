import { Injectable, Logger } from '@nestjs/common';
import { CompanyType, JobStatus, ModerationStatus, Prisma, SalaryPeriod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../cv-screening/embedding.service';
import { SalaryInsightDto } from './dto/salary-insight.dto';
import { SalaryResearchService } from './salary-research.service';

const LOOKBACK_MONTHS = 18;
const MIN_SAMPLE_SIZE = 5;
const MAX_CANDIDATES = 500;
const MAX_MATCHES = 50;
const MIN_MONTHLY_SALARY = 2_500_000;
const MAX_MONTHLY_SALARY = 500_000_000;
const COMPANY_TYPE_RESEARCH_LABELS: Record<CompanyType, string> = {
  PRODUCT: 'Công ty sản phẩm (Product)',
  OUTSOURCING: 'Công ty gia công phần mềm (Outsourcing)',
  STARTUP: 'Startup',
  AGENCY: 'Agency',
  OTHER: 'Loại hình khác',
};
const COMPANY_SIZE_RESEARCH_LABELS: Record<string, string> = {
  '1': 'Dưới 10 nhân sự',
  '2': '10–24 nhân sự',
  '3': '25–99 nhân sự',
  '4': '100–499 nhân sự',
  '5': '500–999 nhân sự',
  '6': '1.000–4.999 nhân sự',
  '7': '5.000–9.999 nhân sự',
  '8': '10.000–19.999 nhân sự',
  '9': '20.000–49.999 nhân sự',
  '10': 'Từ 50.000 nhân sự',
};
const STOP_WORDS = new Set([
  'and',
  'are',
  'cho',
  'cua',
  'cac',
  'cong',
  'duoc',
  'for',
  'from',
  'job',
  'lam',
  'mot',
  'nguoi',
  'nhan',
  'nhom',
  'the',
  'thi',
  'trong',
  'tuyen',
  'ung',
  'van',
  'viec',
  'voi',
  'you',
]);

const ROLE_FAMILY_PATTERNS = {
  fullstack: ['fullstack', 'full stack', 'full-stack'],
  backend: ['backend', 'back end', 'back-end', 'php', 'laravel', 'symfony', 'nestjs'],
  frontend: [
    'frontend',
    'front end',
    'front-end',
    'react developer',
    'vue developer',
    'angular developer',
  ],
  mobile: ['mobile', 'android', 'ios', 'flutter', 'react native'],
  devops: ['devops', 'site reliability', 'sre', 'cloud engineer', 'platform engineer'],
  data: ['data engineer', 'data analyst', 'data scientist', 'machine learning', 'ai engineer'],
  quality: ['quality assurance', 'qa engineer', 'tester', 'test engineer'],
  security: ['security', 'cybersecurity', 'an ninh mang'],
} as const;

const TECHNOLOGY_ALIASES = {
  php: ['php'],
  laravel: ['laravel'],
  symfony: ['symfony'],
  vue: ['vue', 'vuejs', 'vue.js'],
  react: ['react', 'reactjs', 'react.js'],
  angular: ['angular'],
  nodejs: ['node', 'nodejs', 'node.js'],
  nestjs: ['nest', 'nestjs', 'nest.js'],
  java: ['java'],
  spring: ['spring', 'spring boot'],
  dotnet: ['.net', 'dotnet', 'asp.net', 'c#'],
  python: ['python'],
  django: ['django'],
  flask: ['flask'],
  fastapi: ['fastapi'],
  ruby: ['ruby'],
  rails: ['rails'],
  golang: ['golang', 'go developer'],
  flutter: ['flutter'],
  kotlin: ['kotlin'],
  swift: ['swift'],
  reactNative: ['react native'],
  docker: ['docker', 'containerization'],
  kubernetes: ['kubernetes', 'k8s', 'k8'],
  terraform: ['terraform', 'infrastructure as code', 'iac'],
  aws: ['aws', 'amazon web services'],
  azure: ['azure', 'microsoft azure'],
  gcp: ['gcp', 'google cloud', 'cloud platform'],
  jenkins: ['jenkins'],
  gitlab: ['gitlab', 'gitlab ci'],
  github: ['github', 'github actions'],
  ansible: ['ansible'],
  prometheus: ['prometheus'],
  grafana: ['grafana'],
  sql: ['sql', 'mysql', 'postgres', 'postgresql', 'oracle'],
  spark: ['spark', 'apache spark'],
  hadoop: ['hadoop', 'hdfs', 'mapreduce'],
  bigquery: ['bigquery'],
  datawarehouse: ['data warehouse'],
  tensorflow: ['tensorflow'],
  pytorch: ['pytorch'],
  scikitlearn: ['scikit learn', 'scikit-learn', 'sklearn'],
  pandas: ['pandas'],
  numpy: ['numpy'],
  selenium: ['selenium'],
  cypress: ['cypress'],
  testng: ['testng', 'junit'],
  pytest: ['pytest'],
  jest: ['jest'],
  sonarqube: ['sonarqube', 'sonar'],
  jira: ['jira'],
  gitlab_runner: ['gitlab runner'],
  kafka: ['kafka'],
  rabbitmq: ['rabbitmq', 'amqp'],
  redis: ['redis'],
} as const;

type RoleFamily = keyof typeof ROLE_FAMILY_PATTERNS;

type MarketJob = Prisma.JobPostGetPayload<{
  select: {
    title: true;
    description: true;
    requirements: true;
    salaryMin: true;
    salaryMax: true;
    salaryPeriod: true;
    jobCategoryId: true;
    experienceLevelId: true;
    publishedAt: true;
    jobPostSkills: {
      select: {
        skillId: true;
        minYearsExperience: true;
        skill: { select: { name: true } };
      };
    };
    jobPostLocations: { select: { jobLocation: { select: { city: true } } } };
    jobEmbedding: { select: { embeddingVector: true } };
    company: { select: { type: true; companySize: true } };
  };
}>;

type RankedMarketJob = {
  score: number;
  monthlyMidpoint: number;
  factors: Set<string>;
};

type SalaryCompanyContext = {
  type: CompanyType;
  companySize: string | null;
};

@Injectable()
export class JobPostSalaryInsightService {
  private readonly logger = new Logger(JobPostSalaryInsightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly salaryResearch: SalaryResearchService,
  ) {}

  async analyze(dto: SalaryInsightDto, recruiterId?: string) {
    const since = new Date();
    since.setMonth(since.getMonth() - LOOKBACK_MONTHS);
    const targetSkillIds = Array.from(
      new Set([
        ...(dto.requiredSkillIds ?? []),
        ...(dto.relatedSkillIds ?? []),
        ...(dto.skillIds ?? []),
      ]),
    );

    const targetEmbeddingPromise = this.embeddings
      .createEmbedding(this.buildTargetText(dto))
      .catch((error: unknown) => {
        this.logger.warn(`Salary semantic matching unavailable: ${String(error)}`);
        return null;
      });

    const [
      targetLocations,
      targetSkills,
      targetExperienceLevel,
      targetJobCategory,
      targetCompany,
      candidates,
      targetEmbedding,
    ] = await Promise.all([
      dto.jobLocationIds?.length
        ? this.prisma.companyLocation.findMany({
            where: { id: { in: dto.jobLocationIds } },
            select: { city: true },
          })
        : Promise.resolve([]),
      targetSkillIds.length
        ? this.prisma.skill.findMany({
            where: { id: { in: targetSkillIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      dto.experienceLevelId
        ? this.prisma.experienceLevel.findUnique({
            where: { id: dto.experienceLevelId },
            select: { name: true },
          })
        : Promise.resolve(null),
      dto.jobCategoryId
        ? this.prisma.jobCategory.findUnique({
            where: { id: dto.jobCategoryId },
            select: { name: true },
          })
        : Promise.resolve(null),
      recruiterId
        ? this.prisma.recruiterAccount
            .findUnique({
              where: { id: recruiterId },
              select: {
                company: {
                  select: {
                    type: true,
                    companySize: true,
                  },
                },
              },
            })
            .then((account) => account?.company ?? null)
        : Promise.resolve(null),
      this.prisma.jobPost.findMany({
        where: {
          deletedAt: null,
          isHidden: false,
          moderationStatus: ModerationStatus.APPROVED,
          status: { in: [JobStatus.PUBLISHED, JobStatus.CLOSED, JobStatus.EXPIRED] },
          publishedAt: { gte: since },
          salaryCurrency: 'VND',
          salaryIsVisible: true,
          salaryIsNegotiable: false,
          salaryMin: { not: null },
          salaryMax: { not: null },
        },
        select: {
          title: true,
          description: true,
          requirements: true,
          salaryMin: true,
          salaryMax: true,
          salaryPeriod: true,
          jobCategoryId: true,
          experienceLevelId: true,
          publishedAt: true,
          jobPostSkills: {
            select: {
              skillId: true,
              minYearsExperience: true,
              skill: { select: { name: true } },
            },
          },
          jobPostLocations: { select: { jobLocation: { select: { city: true } } } },
          jobEmbedding: { select: { embeddingVector: true } },
          company: {
            select: {
              type: true,
              companySize: true,
            },
          },
        },
        orderBy: { publishedAt: 'desc' },
        take: MAX_CANDIDATES,
      }),
      targetEmbeddingPromise,
    ]);

    const targetCities = new Set(
      targetLocations.flatMap((location) => (location.city ? [this.normalize(location.city)] : [])),
    );
    const ranked = candidates
      .map((job) => this.rankJob(dto, job, targetCities, targetEmbedding, targetCompany))
      .filter((job): job is RankedMarketJob => job !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_MATCHES);

    const skillNameById = new Map(targetSkills.map((skill) => [skill.id, skill.name]));
    const webResearch = await this.salaryResearch.research({
      title: dto.title,
      description: dto.description,
      ...(dto.requirements ? { requirements: dto.requirements } : {}),
      yearsOfExperience: dto.yearsOfExperience,
      ...(targetExperienceLevel?.name ? { experienceLevelName: targetExperienceLevel.name } : {}),
      ...(targetJobCategory?.name ? { jobCategoryName: targetJobCategory.name } : {}),
      ...(targetCompany?.type
        ? { companyType: COMPANY_TYPE_RESEARCH_LABELS[targetCompany.type] }
        : {}),
      ...(targetCompany?.companySize
        ? {
            companySize:
              COMPANY_SIZE_RESEARCH_LABELS[targetCompany.companySize] ??
              targetCompany.companySize.trim(),
          }
        : {}),
      requiredSkillNames: (dto.requiredSkillIds ?? []).flatMap((id) => {
        const name = skillNameById.get(id);
        return name ? [name] : [];
      }),
      relatedSkillNames: [...(dto.relatedSkillIds ?? []), ...(dto.skillIds ?? [])].flatMap((id) => {
        const name = skillNameById.get(id);
        return name ? [name] : [];
      }),
      skillKeywords: dto.skillKeywords ?? [],
      cities: targetLocations.flatMap((location) => (location.city ? [location.city] : [])),
    });

    if (webResearch) {
      return {
        available: true as const,
        basis: 'WEB_GROUNDED_AI' as const,
        currency: 'VND' as const,
        period: SalaryPeriod.MONTH,
        sampleSize: webResearch.sources.length,
        lookbackMonths: 24,
        confidence: webResearch.confidence,
        market: {
          p25: webResearch.p25,
          median: webResearch.median,
          p75: webResearch.p75,
        },
        recommended: {
          salaryMin: webResearch.p25,
          salaryMax: webResearch.p75,
        },
        comparison: this.compareCurrentRange(
          dto,
          webResearch.p25,
          webResearch.median,
          webResearch.p75,
        ),
        matchedFactors: [
          'Vai trò và cấp bậc tương đồng',
          'Cùng tech stack',
          'Kinh nghiệm tương đương',
          ...(targetCompany?.type ? ['Loại hình công ty'] : []),
          ...(targetCompany?.companySize ? ['Quy mô công ty'] : []),
          'Nguồn web được trích dẫn',
        ],
        marketSummary: webResearch.summary,
        evidenceNotes: webResearch.evidenceNotes,
        sources: webResearch.sources,
        searchQueries: webResearch.searchQueries,
        searchedAt: webResearch.searchedAt,
        model: webResearch.model,
        message:
          'Khoảng tham chiếu được AI tổng hợp từ các nguồn web công khai có trích dẫn; cần được recruiter kiểm tra trước khi sử dụng.',
      };
    }

    if (ranked.length < MIN_SAMPLE_SIZE) {
      return {
        available: false as const,
        basis: 'MULTI_SOURCE_RESEARCH' as const,
        currency: 'VND' as const,
        period: SalaryPeriod.MONTH,
        sampleSize: ranked.length,
        lookbackMonths: LOOKBACK_MONTHS,
        message:
          'Dữ liệu UpNext chưa đủ và nghiên cứu web có trích dẫn cũng chưa tìm được ít nhất hai nguồn độc lập phù hợp để đưa ra tham chiếu đáng tin cậy.',
      };
    }

    const salaries = ranked.map((job) => job.monthlyMidpoint).sort((a, b) => a - b);
    const p25 = this.roundSalary(this.percentile(salaries, 0.25));
    const median = this.roundSalary(this.percentile(salaries, 0.5));
    const p75 = this.roundSalary(this.percentile(salaries, 0.75));
    const averageScore = ranked.reduce((sum, job) => sum + job.score, 0) / ranked.length;
    const confidence =
      ranked.length >= 20 && averageScore >= 8
        ? 'HIGH'
        : ranked.length >= 8 && averageScore >= 5
          ? 'MEDIUM'
          : 'LOW';
    const allMatchedFactors = Array.from(
      ranked.reduce((factors, job) => {
        job.factors.forEach((factor) => factors.add(factor));
        return factors;
      }, new Set<string>()),
    );
    const companyFactorNames = new Set<string>(['Cùng loại hình công ty', 'Cùng quy mô công ty']);
    const companyFactors = allMatchedFactors.filter((factor) => companyFactorNames.has(factor));
    const matchedFactors = [
      ...allMatchedFactors.filter((factor) => !companyFactorNames.has(factor)).slice(0, 5),
      ...companyFactors,
    ];

    return {
      available: true as const,
      basis: 'UPNEXT_PUBLIC_JOB_POSTS' as const,
      currency: 'VND' as const,
      period: SalaryPeriod.MONTH,
      sampleSize: ranked.length,
      lookbackMonths: LOOKBACK_MONTHS,
      confidence,
      market: { p25, median, p75 },
      recommended: { salaryMin: p25, salaryMax: p75 },
      comparison: this.compareCurrentRange(dto, p25, median, p75),
      matchedFactors,
      message:
        'Khoảng tham chiếu được tổng hợp từ các tin tương đồng có lương công khai trên UpNext, không phải cam kết mức lương thị trường.',
    };
  }

  private rankJob(
    dto: SalaryInsightDto,
    job: MarketJob,
    targetCities: Set<string>,
    targetEmbedding: number[] | null,
    targetCompany: SalaryCompanyContext | null,
  ): RankedMarketJob | null {
    const salaryMin = this.toMonthly(Number(job.salaryMin), job.salaryPeriod);
    const salaryMax = this.toMonthly(Number(job.salaryMax), job.salaryPeriod);
    const monthlyMidpoint = (salaryMin + salaryMax) / 2;
    if (
      !Number.isFinite(monthlyMidpoint) ||
      monthlyMidpoint < MIN_MONTHLY_SALARY ||
      monthlyMidpoint > MAX_MONTHLY_SALARY
    ) {
      return null;
    }

    const targetRoleFamily = this.detectRoleFamily(dto.title);
    const marketRoleFamily = this.detectRoleFamily(job.title);
    if (
      targetRoleFamily &&
      marketRoleFamily &&
      !this.roleFamiliesAreCompatible(targetRoleFamily, marketRoleFamily)
    ) {
      return null;
    }

    if (
      dto.experienceLevelId &&
      job.experienceLevelId &&
      dto.experienceLevelId !== job.experienceLevelId
    ) {
      return null;
    }

    const requiredSkillIds = new Set(dto.requiredSkillIds ?? []);
    const relatedSkillIds = new Set([...(dto.relatedSkillIds ?? []), ...(dto.skillIds ?? [])]);
    requiredSkillIds.forEach((skillId) => relatedSkillIds.delete(skillId));
    const marketSkillIds = new Set(job.jobPostSkills.map((skill) => skill.skillId));
    const sharedRequiredSkillCount = Array.from(requiredSkillIds).filter((skillId) =>
      marketSkillIds.has(skillId),
    ).length;
    const sharedRelatedSkillCount = Array.from(relatedSkillIds).filter((skillId) =>
      marketSkillIds.has(skillId),
    ).length;

    const targetTechnology = this.extractTechnologies(
      `${dto.title} ${dto.description} ${dto.requirements ?? ''}`,
    );
    const marketTechnology = this.extractTechnologies(
      `${job.title} ${job.description} ${job.requirements ?? ''} ${job.jobPostSkills
        .map((skill) => skill.skill.name)
        .join(' ')}`,
    );
    const sharedTechnologyCount = Array.from(targetTechnology).filter((technology) =>
      marketTechnology.has(technology),
    ).length;
    if (targetTechnology.size > 0 && marketTechnology.size > 0 && sharedTechnologyCount === 0) {
      return null;
    }

    const normalizedMarketText = ` ${this.normalize(
      `${job.title} ${job.description} ${job.requirements ?? ''} ${job.jobPostSkills
        .map((skill) => skill.skill.name)
        .join(' ')}`,
    )} `;
    const matchedKeywordCount = (dto.skillKeywords ?? []).filter((keyword) => {
      const normalizedKeyword = this.normalize(keyword);
      return normalizedKeyword.length >= 2
        ? normalizedMarketText.includes(` ${normalizedKeyword} `)
        : false;
    }).length;

    const marketYears = this.getMarketYearsOfExperience(job);
    const yearsDifference =
      marketYears === null ? null : Math.abs(dto.yearsOfExperience - marketYears);
    if (yearsDifference !== null && yearsDifference > 2) {
      return null;
    }
    if (marketYears === null && dto.experienceLevelId !== job.experienceLevelId) {
      return null;
    }

    let score = 0;
    const factors = new Set<string>();
    const targetTitleTokens = this.tokenize(dto.title);
    const jobTitleTokens = this.tokenize(job.title);
    const titleOverlap = this.overlapRatio(targetTitleTokens, jobTitleTokens);
    score += titleOverlap * 8;
    if (titleOverlap >= 0.45) factors.add('Chức danh tương đồng');

    const targetBodyTokens = this.tokenize(`${dto.description} ${dto.requirements ?? ''}`);
    const jobBodyTokens = this.tokenize(`${job.description} ${job.requirements ?? ''}`);
    score += this.overlapRatio(targetBodyTokens, jobBodyTokens) * 1.5;

    if (dto.jobCategoryId && dto.jobCategoryId === job.jobCategoryId) {
      score += 3;
      factors.add('Cùng ngành nghề');
    }
    if (dto.experienceLevelId && dto.experienceLevelId === job.experienceLevelId) {
      score += 5;
      factors.add('Cùng cấp bậc');
    }

    if (sharedRequiredSkillCount > 0) {
      score += Math.min(sharedRequiredSkillCount * 3, 6);
      factors.add('Kỹ năng bắt buộc');
    }

    if (sharedRelatedSkillCount > 0) {
      score += Math.min(sharedRelatedSkillCount * 1.5, 4.5);
      factors.add('Kỹ năng liên quan');
    }

    if (matchedKeywordCount > 0) {
      score += Math.min(matchedKeywordCount, 4);
      factors.add('Từ khóa liên quan');
    }

    if (sharedTechnologyCount > 0) {
      score += Math.min(sharedTechnologyCount * 2, 6);
      factors.add('Cùng tech stack');
    }

    if (yearsDifference !== null) {
      score += yearsDifference <= 0.5 ? 6 : yearsDifference <= 1 ? 4 : 2;
      factors.add('Kinh nghiệm tương đương');
    }

    if (targetCompany && targetCompany.type === job.company.type) {
      score += 1;
      factors.add('Cùng loại hình công ty');
    }

    const targetCompanySizeBand = this.companySizeBand(targetCompany?.companySize);
    const marketCompanySizeBand = this.companySizeBand(job.company?.companySize);
    if (targetCompanySizeBand && targetCompanySizeBand === marketCompanySizeBand) {
      score += 1;
      factors.add('Cùng quy mô công ty');
    }

    if (
      targetCities.size > 0 &&
      job.jobPostLocations.some((location) => {
        const city = location.jobLocation.city;
        return city ? targetCities.has(this.normalize(city)) : false;
      })
    ) {
      score += 1.5;
      factors.add('Cùng khu vực');
    }

    const storedEmbedding = this.toNumberArray(job.jobEmbedding?.embeddingVector);
    if (targetEmbedding && storedEmbedding) {
      const semanticSimilarity = this.embeddings.cosineSimilarity(targetEmbedding, storedEmbedding);
      if (semanticSimilarity >= 0.55) {
        score += semanticSimilarity * 2;
        factors.add('Nội dung JD tương đồng');
      }
    }

    if (score < 8) return null;
    return { score, monthlyMidpoint, factors };
  }

  private compareCurrentRange(dto: SalaryInsightDto, p25: number, median: number, p75: number) {
    const currentValues = [dto.currentSalaryMin, dto.currentSalaryMax].filter(
      (value): value is number => typeof value === 'number' && value > 0,
    );
    if (currentValues.length === 0) {
      return { position: 'NOT_PROVIDED' as const, differencePercent: null };
    }

    const midpoint =
      currentValues.length === 2
        ? ((currentValues[0] ?? 0) + (currentValues[1] ?? 0)) / 2
        : (currentValues[0] ?? median);
    const position = midpoint < p25 ? 'BELOW' : midpoint > p75 ? 'ABOVE' : 'ALIGNED';

    return {
      position,
      differencePercent: Math.round(((midpoint - median) / median) * 100),
    };
  }

  private toMonthly(value: number, period: SalaryPeriod) {
    if (period === SalaryPeriod.HOUR) return value * 176;
    if (period === SalaryPeriod.DAY) return value * 22;
    if (period === SalaryPeriod.YEAR) return value / 12;
    return value;
  }

  private percentile(values: number[], percentile: number) {
    const index = (values.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return values[lower] ?? 0;
    const weight = index - lower;
    return (values[lower] ?? 0) * (1 - weight) + (values[upper] ?? 0) * weight;
  }

  private roundSalary(value: number) {
    return Math.max(0, Math.round(value / 500_000) * 500_000);
  }

  private buildTargetText(dto: SalaryInsightDto) {
    return [
      `Job title: ${dto.title}`,
      `Years of experience: ${dto.yearsOfExperience}`,
      `Related keywords: ${(dto.skillKeywords ?? []).join(', ')}`,
      `Description: ${dto.description}`,
      `Requirements: ${dto.requirements ?? ''}`,
    ].join('\n');
  }

  private companySizeBand(value?: string | null) {
    if (!value?.trim()) return null;

    const normalized = value.trim().toLocaleLowerCase();
    const codedBands = {
      '1': 'MICRO',
      '2': 'SMALL',
      '3': 'SMALL',
      '4': 'MEDIUM',
      '5': 'LARGE',
      '6': 'LARGE',
      '7': 'ENTERPRISE',
      '8': 'ENTERPRISE',
      '9': 'ENTERPRISE',
      '10': 'ENTERPRISE',
    } as const;
    if (normalized in codedBands) {
      return codedBands[normalized as keyof typeof codedBands];
    }

    const numbers = normalized
      .replace(/[.,](?=\d{3}\b)/g, '')
      .match(/\d+/g)
      ?.map(Number)
      .filter(Number.isFinite);
    const representativeSize = numbers?.at(-1);
    if (representativeSize === undefined) return null;
    if (representativeSize < 10) return 'MICRO';
    if (representativeSize < 100) return 'SMALL';
    if (representativeSize < 500) return 'MEDIUM';
    if (representativeSize < 5000) return 'LARGE';
    return 'ENTERPRISE';
  }

  private tokenize(value: string) {
    return new Set(
      this.normalize(value)
        .split(/\s+/)
        .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
    );
  }

  private overlapRatio(left: Set<string>, right: Set<string>) {
    if (left.size === 0 || right.size === 0) return 0;
    let shared = 0;
    left.forEach((token) => {
      if (right.has(token)) shared += 1;
    });
    return shared / Math.min(left.size, right.size);
  }

  private detectRoleFamily(title: string): RoleFamily | null {
    const normalizedTitle = this.normalize(title);
    for (const [family, patterns] of Object.entries(ROLE_FAMILY_PATTERNS) as [
      RoleFamily,
      readonly string[],
    ][]) {
      if (patterns.some((pattern) => normalizedTitle.includes(pattern))) {
        return family;
      }
    }
    return null;
  }

  private roleFamiliesAreCompatible(left: RoleFamily, right: RoleFamily) {
    return left === right;
  }

  private extractTechnologies(value: string) {
    const normalizedValue = ` ${this.normalize(value)} `;
    const technologies = new Set<string>();
    for (const [technology, aliases] of Object.entries(TECHNOLOGY_ALIASES)) {
      if (aliases.some((alias) => normalizedValue.includes(` ${alias} `))) {
        technologies.add(technology);
      }
    }
    return technologies;
  }

  private getMarketYearsOfExperience(job: MarketJob) {
    const structuredYears = job.jobPostSkills
      .flatMap((skill) =>
        skill.minYearsExperience === null ? [] : [Number(skill.minYearsExperience)],
      )
      .filter((years) => Number.isFinite(years) && years >= 0);
    if (structuredYears.length > 0) {
      return Math.max(...structuredYears);
    }

    const normalizedText = this.normalize(`${job.title} ${job.requirements ?? ''}`);
    const rangeMatch = normalizedText.match(
      /(\d+(?:[.,]\d+)?)\s*(?:-|–|den|to)\s*(\d+(?:[.,]\d+)?)\s*(?:nam|years?)/,
    );
    if (rangeMatch?.[1]) {
      return Number(rangeMatch[1].replace(',', '.'));
    }

    const singleMatch = normalizedText.match(
      /(\d+(?:[.,]\d+)?)\s*(?:\+)?\s*(?:nam|years?|year experience)/,
    );
    return singleMatch?.[1] ? Number(singleMatch[1].replace(',', '.')) : null;
  }

  private normalize(value: string) {
    return value
      .replace(/<[^>]*>/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-zA-Z0-9+#.]+/g, ' ')
      .trim()
      .toLocaleLowerCase();
  }

  private toNumberArray(value: Prisma.JsonValue | undefined): number[] | null {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'number')) {
      return null;
    }
    return value;
  }
}
