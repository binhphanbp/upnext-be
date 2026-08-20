import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
import { AiOperationCacheService } from './ai-operation-cache.service';
import { GenerateJobPostDraftDto } from './dto/generate-job-post-draft.dto';
import {
  GeminiJobPostService,
  JobPostDraftResult,
  RawJobPostDraft,
} from './gemini-job-post.service';
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
    id: string;
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
    private readonly quota: SubscriptionQuotaService,
    private readonly cache: AiOperationCacheService,
  ) {}

  /**
   * Charges one AI JD credit around a Gemini call, at most once per client request.
   *
   * Unlike a database action there is nothing to put in the same transaction as
   * the model call, so the allowance is taken up front -- otherwise concurrent
   * requests could all pass a pre-check and overshoot the plan. If the call then
   * fails the credit is handed straight back, so a recruiter is never charged
   * for output they did not get.
   *
   * ## Vì sao cần `clientRequestId`
   *
   * Trước đây key idempotency được sinh bằng `randomUUID()` **phía server**, tức mỗi
   * request là một key mới. Bấm "Tạo JD" hai lần, hoặc client tự retry khi mạng chậm,
   * sẽ **trừ hai lượt quota và trả tiền token hai lần** cho một kết quả.
   *
   * Với key từ client, có đúng ba trạng thái, và mỗi trạng thái phải xử lý khác nhau:
   *
   * | Tình huống | Dấu hiệu | Xử lý |
   * |---|---|---|
   * | Lần đầu | chưa có usage, chưa có cache | Tiêu quota, gọi model, lưu kết quả |
   * | Retry sau khi đã xong | có cache còn hiệu lực | Trả cache, **không** gọi model |
   * | Bấm hai lần / lần trước chết | có usage, không có cache | Còn trong thời gian ân hạn thì 409; quá hạn thì coi như lần trước đã chết và gọi lại model, **không** tiêu thêm quota |
   *
   * Nhánh cuối là chỗ đáng nói: nếu luôn trả 409 thì một lần gọi chết giữa đường sẽ
   * làm người dùng mất vĩnh viễn lượt đã trả; nếu luôn gọi lại model thì mất đúng số
   * tiền mà cache sinh ra để tiết kiệm.
   *
   * `clientRequestId` là **không bắt buộc**: khi thiếu, hành vi giống hệt trước đây
   * (key sinh phía server, không cache). Frontend gửi được key nào thì key đó bắt đầu
   * được bảo vệ, không cần đổi đồng loạt.
   */
  private async withJdCredit<T>(
    recruiterId: string,
    companyId: string,
    operation: string,
    clientRequestId: string | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    const idempotencyKey = clientRequestId
      ? `jd-ai:${companyId}:${clientRequestId}`
      : `jd-ai:${randomUUID()}`;

    if (clientRequestId) {
      const cached = await this.cache.read<T>(idempotencyKey);
      if (cached !== null) return cached;
    }

    const { usage, replayed } = await this.prisma.$transaction((tx) =>
      this.quota.consume(tx, {
        companyId,
        feature: SubscriptionFeature.AI_JD_GENERATE,
        referenceType: 'JOB_POST_AI',
        referenceId: randomUUID(),
        idempotencyKey,
        createdByRecruiterId: recruiterId,
      }),
    );

    // Quota đã tiêu cho key này mà cache trống: hoặc một request song song đang gọi
    // model, hoặc lần trước đã chết. Đọc lại cache một lần nữa trước khi quyết định --
    // request kia có thể vừa ghi xong trong lúc mình đang tiêu quota.
    if (replayed) {
      const cached = await this.cache.read<T>(idempotencyKey);
      if (cached !== null) return cached;

      // `reverse()` ghi thêm một dòng REVERSAL và GIỮ dòng CONSUME -- sổ chỉ ghi
      // thêm. Nên một lần gọi model thất bại vẫn để lại key đã dùng, và nếu chỉ xét
      // thời gian thì lần bấm lại ngay sau đó bị chẩn đoán sai là "đang chạy".
      //
      // Có dòng REVERSAL nghĩa là lần trước đã KẾT THÚC và lượt đã được hoàn. Đó
      // không phải đang chạy, cũng không phải chết giữa đường: chạy lại được, và
      // KHÔNG tiêu thêm lượt -- đúng nguyên tắc §9.4, lỗi của hệ thống thì người
      // dùng không phải trả.
      const refunded = await this.prisma.subscriptionUsage.findUnique({
        where: { id: usage.id },
        select: { reversal: { select: { id: true } } },
      });

      if (!refunded?.reversal && this.cache.isStillInFlight(usage.createdAt)) {
        throw new ConflictException({
          code: 'AI_OPERATION_IN_PROGRESS',
          message: 'Yêu cầu này đang được xử lý. Vui lòng đợi kết quả thay vì gửi lại.',
        });
      }
      // Quá ân hạn: lần trước coi như đã chết. Gọi lại model nhưng KHÔNG tiêu thêm
      // quota -- người dùng đã trả cho lượt này rồi.
    }

    try {
      const result = await run();
      if (clientRequestId) {
        await this.cache.write(idempotencyKey, operation, result);
      }
      return result;
    } catch (error) {
      // Chỉ hoàn lượt vừa tiêu. Với `replayed` thì lượt đã được hoàn hoặc đã tính từ
      // lần trước, và `reverse()` vốn idempotent nên gọi lại cũng không trừ hai lần.
      await this.prisma
        .$transaction((tx) => this.quota.reverse(tx, usage.id, 'ai-call-failed'))
        .catch(() => undefined);
      throw error;
    }
  }

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

    const raw = await this.withJdCredit(
      recruiterId,
      context.company.id,
      'job_post_ai.generate',
      dto.clientRequestId,
      () =>
        this.gemini.generateDraft(
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
        ),
    );

    return this.toResponse('generated', raw, context, {
      jobCategoryId: category?.id,
      experienceLevelId: experienceLevel?.id,
      employmentTypeId: employmentType?.id,
      requiredSkillIds: requiredSkills.map((skill) => skill.id),
      preferredSkillIds: preferredSkills.map((skill) => skill.id),
    });
  }

  async extractText(recruiterId: string, sourceText: string, clientRequestId?: string) {
    const context = await this.loadContext(recruiterId);
    const raw = await this.withJdCredit(
      recruiterId,
      context.company.id,
      'job_post_ai.extract_text',
      clientRequestId,
      () =>
        this.gemini.extractDraft(
          {
            sourceText,
            sourceLabel: 'nội dung được dán trực tiếp',
            companyName: context.company.name,
          },
          this.toCatalogNames(context),
        ),
    );

    return this.toResponse('extracted', raw, context);
  }

  async extractFile(recruiterId: string, file?: JobPostAiUploadFile, clientRequestId?: string) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file JD cần quét');
    }

    const context = await this.loadContext(recruiterId);
    const source = await this.prepareFile(file);
    const raw = await this.withJdCredit(
      recruiterId,
      context.company.id,
      'job_post_ai.extract_file',
      clientRequestId,
      () =>
        this.gemini.extractDraft(
          {
            ...source,
            sourceLabel: file.originalname,
            companyName: context.company.name,
          },
          this.toCatalogNames(context),
        ),
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
                id: true,
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
    result: JobPostDraftResult,
    context: LoadedContext,
    forced?: {
      jobCategoryId?: string;
      experienceLevelId?: string;
      employmentTypeId?: string;
      requiredSkillIds?: string[];
      preferredSkillIds?: string[];
    },
  ) {
    const raw: RawJobPostDraft = result.draft;
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
      model: result.modelName,
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
