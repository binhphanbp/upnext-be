import { BadRequestException, Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerateJobPostDraftDto } from './dto/generate-job-post-draft.dto';
import { GeminiJobPostService, RawJobPostDraft } from './gemini-job-post.service';
import { htmlToPlainText, plainTextToRichText, sanitizeRichText } from './rich-text';

type CatalogOption = { id: string; name: string };

export type JobPostAiUploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type LoadedContext = {
  company: {
    name: string;
    description: string | null;
    benefits: string | null;
    workingDays: string | null;
  };
  categories: CatalogOption[];
  employmentTypes: CatalogOption[];
  experienceLevels: CatalogOption[];
  skills: CatalogOption[];
  specializations: CatalogOption[];
};

@Injectable()
export class JobPostAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiJobPostService,
  ) {}

  async generate(recruiterId: string, dto: GenerateJobPostDraftDto) {
    const context = await this.loadContext(recruiterId);
    const category = this.resolveSelected(context.categories, dto.jobCategoryId, 'ngành nghề');
    const experienceLevel = this.resolveSelected(
      context.experienceLevels,
      dto.experienceLevelId,
      'cấp bậc',
    );
    const employmentType = this.resolveSelected(
      context.employmentTypes,
      dto.employmentTypeId,
      'loại hình việc làm',
    );
    const requiredSkills = this.resolveSelectedMany(
      context.skills,
      dto.requiredSkillIds,
      'kỹ năng bắt buộc',
    );
    const preferredSkills = this.resolveSelectedMany(
      context.skills,
      dto.preferredSkillIds,
      'kỹ năng ưu tiên',
    );

    const raw = await this.gemini.generateDraft(
      {
        title: dto.title.trim(),
        jobCategoryName: category?.name,
        experienceLevelName: experienceLevel?.name,
        employmentTypeName: employmentType?.name,
        requiredSkillNames: requiredSkills.map((skill) => skill.name),
        preferredSkillNames: preferredSkills.map((skill) => skill.name),
        keywords: this.cleanKeywords(dto.keywords),
        yearsOfExperience: dto.yearsOfExperience?.trim(),
        companyName: context.company.name,
        companyDescription: this.toPromptText(
          dto.companyDescription || context.company.description || '',
        ),
        companyBenefits: this.toPromptText(context.company.benefits || ''),
        companyWorkingDays: context.company.workingDays || undefined,
        productOrDomain: dto.productOrDomain?.trim(),
        roleObjective: dto.roleObjective?.trim(),
        teamContext: dto.teamContext?.trim(),
        languageRequirement: dto.languageRequirement?.trim(),
        workMode: dto.workMode,
        outputLanguage: dto.outputLanguage,
        presentationStyle: dto.presentationStyle,
        hints: dto.hints?.trim(),
      },
      this.toCatalogNames(context),
    );

    return this.toResponse('generated', raw, context, {
      jobCategoryId: category?.id,
      experienceLevelId: experienceLevel?.id,
      employmentTypeId: employmentType?.id,
      requiredSkillIds: requiredSkills.map((skill) => skill.id),
      preferredSkillIds: preferredSkills.map((skill) => skill.id),
    });
  }

  async extractText(recruiterId: string, sourceText: string) {
    const context = await this.loadContext(recruiterId);
    const raw = await this.gemini.extractDraft(
      {
        sourceText,
        sourceLabel: 'nội dung được dán trực tiếp',
        companyName: context.company.name,
      },
      this.toCatalogNames(context),
    );

    return this.toResponse('extracted', raw, context);
  }

  async extractFile(recruiterId: string, file?: JobPostAiUploadFile) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file JD cần quét');
    }

    const context = await this.loadContext(recruiterId);
    const source = await this.prepareFile(file);
    const raw = await this.gemini.extractDraft(
      {
        ...source,
        sourceLabel: file.originalname,
        companyName: context.company.name,
      },
      this.toCatalogNames(context),
    );

    return this.toResponse('extracted', raw, context);
  }

  private async loadContext(recruiterId: string): Promise<LoadedContext> {
    const [account, categories, employmentTypes, experienceLevels, skills, specializations] =
      await Promise.all([
        this.prisma.recruiterAccount.findUnique({
          where: { id: recruiterId },
          select: {
            company: {
              select: {
                name: true,
                description: true,
                benefits: true,
                workingDays: true,
              },
            },
          },
        }),
        this.prisma.jobCategory.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
        this.prisma.employmentType.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.experienceLevel.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.skill.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.specialization.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    if (!account?.company) {
      throw new BadRequestException('Tài khoản recruiter chưa được liên kết với công ty');
    }

    return {
      company: account.company,
      categories,
      employmentTypes,
      experienceLevels,
      skills,
      specializations,
    };
  }

  private async prepareFile(file: JobPostAiUploadFile) {
    if (file.mimetype === 'text/plain') {
      const sourceText = file.buffer.toString('utf8').trim();
      this.ensureUsefulText(sourceText);
      return { sourceText };
    }

    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      const sourceText = result.value.trim();
      this.ensureUsefulText(sourceText);
      return { sourceText };
    }

    return {
      file: {
        mimeType: file.mimetype,
        base64Data: file.buffer.toString('base64'),
      },
    };
  }

  private ensureUsefulText(sourceText: string) {
    if (sourceText.length < 60) {
      throw new BadRequestException(
        'File không có đủ nội dung để nhận diện JD. Vui lòng kiểm tra lại file.',
      );
    }
  }

  private toResponse(
    source: 'generated' | 'extracted',
    raw: RawJobPostDraft,
    context: LoadedContext,
    forced?: {
      jobCategoryId?: string;
      experienceLevelId?: string;
      employmentTypeId?: string;
      requiredSkillIds?: string[];
      preferredSkillIds?: string[];
    },
  ) {
    const category = this.matchByName(context.categories, raw.jobCategoryName);
    const experienceLevel = this.matchByName(context.experienceLevels, raw.experienceLevelName);
    const employmentType = this.matchByName(context.employmentTypes, raw.employmentTypeName);
    const mappedSkills = this.mapNames(context.skills, raw.skillNames);
    const mappedSpecializations = this.mapNames(context.specializations, raw.specializationNames);
    const forcedSkillIds = [
      ...(forced?.requiredSkillIds ?? []),
      ...(forced?.preferredSkillIds ?? []),
    ];

    return {
      model: this.gemini.modelName,
      source,
      draft: {
        title: raw.title,
        description: this.ensureRichText(raw.description),
        requirements: this.ensureRichText(raw.requirements),
        benefits: this.ensureRichText(raw.benefits),
        salaryMin: raw.salaryMin,
        salaryMax: raw.salaryMax,
        salaryPeriod: raw.salaryPeriod,
        salaryIsNegotiable: raw.salaryIsNegotiable,
        salaryIsVisible: true,
        vacanciesCount: raw.vacanciesCount,
        educationLevel: raw.educationLevel,
        workingDays: raw.workingDays,
        jobCategoryId: forced?.jobCategoryId ?? category?.id ?? null,
        experienceLevelId: forced?.experienceLevelId ?? experienceLevel?.id ?? null,
        employmentTypeId: forced?.employmentTypeId ?? employmentType?.id ?? null,
        skillIds: Array.from(
          new Set([...forcedSkillIds, ...mappedSkills.matched.map((skill) => skill.id)]),
        ),
        specializationIds: mappedSpecializations.matched.map((item) => item.id),
      },
      suggestions: {
        unmatchedSkillNames: mappedSkills.unmatched,
        unmatchedSpecializationNames: mappedSpecializations.unmatched,
      },
    };
  }

  private toCatalogNames(context: LoadedContext) {
    return {
      jobCategories: context.categories.map((item) => item.name),
      employmentTypes: context.employmentTypes.map((item) => item.name),
      experienceLevels: context.experienceLevels.map((item) => item.name),
      specializations: context.specializations.map((item) => item.name),
    };
  }

  private resolveSelected(options: CatalogOption[], id: string | undefined, label: string) {
    if (!id) return undefined;
    const option = options.find((item) => item.id === id);
    if (!option) throw new BadRequestException(`${label} đã chọn không tồn tại`);
    return option;
  }

  private resolveSelectedMany(options: CatalogOption[], ids: string[] | undefined, label: string) {
    if (!ids?.length) return [];
    const byId = new Map(options.map((option) => [option.id, option]));
    const resolved = ids.map((id) => byId.get(id)).filter(Boolean) as CatalogOption[];
    if (resolved.length !== new Set(ids).size) {
      throw new BadRequestException(`Một hoặc nhiều ${label} không tồn tại`);
    }
    return resolved;
  }

  private mapNames(options: CatalogOption[], names: string[]) {
    const matched: CatalogOption[] = [];
    const unmatched: string[] = [];

    for (const name of names) {
      const option = this.matchByName(options, name);
      if (option) matched.push(option);
      else unmatched.push(name);
    }

    return {
      matched: Array.from(new Map(matched.map((item) => [item.id, item])).values()),
      unmatched,
    };
  }

  private matchByName(options: CatalogOption[], name: string | null) {
    if (!name) return undefined;
    const normalized = this.normalizeName(name);
    const exact = options.find((option) => this.normalizeName(option.name) === normalized);
    if (exact) return exact;

    // An exact-only match turns a near miss into a null, which the recruiter then sees as an empty
    // select. "Frontend" for "Frontend Engineering" is the same answer, so accept a containment
    // match and take the shortest candidate — the least presumptuous of the ones that fit.
    if (normalized.length < 4) return undefined;
    return options
      .filter((option) => {
        const candidate = this.normalizeName(option.name);
        return (
          candidate.length >= 4 &&
          (candidate.includes(normalized) || normalized.includes(candidate))
        );
      })
      .sort((left, right) => left.name.length - right.name.length)[0];
  }

  private normalizeName(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLocaleLowerCase();
  }

  private cleanKeywords(keywords?: string[]) {
    return Array.from(
      new Set((keywords ?? []).map((item) => item.trim()).filter((item) => item.length > 0)),
    ).slice(0, 12);
  }

  private ensureRichText(value: string) {
    const richText = /<\/?[a-z][\s\S]*>/i.test(value) ? value : plainTextToRichText(value);
    return sanitizeRichText(richText);
  }

  private toPromptText(value: string) {
    return htmlToPlainText(value).slice(0, 2_000);
  }
}
