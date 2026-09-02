/**
 * Chỉ mock phần I/O (`extractPdfText`), giữ nguyên logic cổng thật
 * (`hasUsableTextLayer`, `isUsableExtractedText`) để test này kiểm đúng quyết định
 * "dùng text layer hay gọi vision". Bản thân pdfjs không chạy được dưới Jest: nó
 * dựng worker bằng dynamic import mà VM CJS của Jest từ chối.
 */
const extractPdfTextMock = jest.fn();

jest.mock('./document-text', () => ({
  ...jest.requireActual<Record<string, unknown>>('./document-text'),
  extractPdfText: (...args: unknown[]) => extractPdfTextMock(...args) as unknown,
}));

import { BadRequestException } from '@nestjs/common';
import { EducationLevel, SalaryPeriod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UnreadablePdfError, countLetters } from './document-text';
import { JobPostOutputLanguage, JobPostPresentationStyle } from './dto/generate-job-post-draft.dto';
import { GeminiJobPostService, RawJobPostDraft } from './gemini-job-post.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { AiOperationCacheService } from './ai-operation-cache.service';
import { JobPostAiService, JobPostAiUploadFile } from './job-post-ai.service';

/** Một đoạn JD tiếng Việt thật, đủ để vượt mọi ngưỡng của cổng text-layer. */
const REAL_JD_VI = `
Mô tả công việc
Chúng tôi đang tuyển Backend Engineer cho đội sản phẩm tại Hà Nội.
Ứng viên sẽ phát triển API bằng NestJS, làm việc với PostgreSQL và Redis.

Yêu cầu
- Tối thiểu 2 năm kinh nghiệm với Node.js hoặc NestJS
- Kỹ năng giao tiếp tốt, chủ động trong công việc

Quyền lợi
- Mức lương 20.000.000 - 30.000.000 VND, thương lượng theo năng lực
- Phúc lợi đầy đủ theo quy định, review lương hai lần mỗi năm
`;

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
    subscriptionUsage: { findUnique: jest.Mock };
    aiUsageLog: { create: jest.Mock };
    $transaction?: jest.Mock;
  };
  let gemini: {
    generateDraft: jest.Mock;
    extractDraft: jest.Mock;
  };
  let quota: { consume: jest.Mock; reverse: jest.Mock };
  let cache: { read: jest.Mock; write: jest.Mock; isStillInFlight: jest.Mock };
  let service: JobPostAiService;

  beforeEach(() => {
    prisma = {
      recruiterAccount: { findUnique: jest.fn().mockResolvedValue({ company: context.company }) },
      jobCategory: { findMany: jest.fn().mockResolvedValue(context.categories) },
      employmentType: { findMany: jest.fn().mockResolvedValue(context.employmentTypes) },
      experienceLevel: { findMany: jest.fn().mockResolvedValue(context.experienceLevels) },
      skill: { findMany: jest.fn().mockResolvedValue(context.skills) },
      specialization: { findMany: jest.fn().mockResolvedValue(context.specializations) },
      subscriptionUsage: { findUnique: jest.fn().mockResolvedValue({ reversal: null }) },
      aiUsageLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    gemini = {
      generateDraft: jest
        .fn()
        .mockResolvedValue({
          draft: rawDraft,
          modelName: 'gemini-test',
          inputTokens: 500,
          outputTokens: 300,
        }),
      extractDraft: jest
        .fn()
        .mockResolvedValue({
          draft: rawDraft,
          modelName: 'gemini-test',
          inputTokens: 500,
          outputTokens: 300,
        }),
    };
    quota = {
      consume: jest
        .fn()
        .mockResolvedValue({ usage: { id: 'usage-1', createdAt: new Date() }, replayed: false }),
      reverse: jest.fn().mockResolvedValue({}),
    };
    cache = {
      read: jest.fn().mockResolvedValue(null),
      write: jest.fn().mockResolvedValue(undefined),
      isStillInFlight: jest.fn().mockReturnValue(false),
    };
    // The AI credit is taken around the Gemini call, so the fake transaction just
    // hands the mocked client straight to the callback.
    prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));

    service = new JobPostAiService(
      prisma as unknown as PrismaService,
      gemini as unknown as GeminiJobPostService,
      quota as unknown as SubscriptionQuotaService,
      cache as unknown as AiOperationCacheService,
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
    expect(response.model).toBe('gemini-test');
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

  it('ghi AiUsageLog thật với token/model từ Gemini, gắn referenceId theo quota usage (D3b)', async () => {
    await service.generate('recruiter-1', {
      title: 'Senior React Developer',
      outputLanguage: JobPostOutputLanguage.VI,
      presentationStyle: JobPostPresentationStyle.SKILL_FOCUSED,
    });

    expect(prisma.aiUsageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        feature: 'ai_jd_generate',
        companyId: 'company-1',
        actorId: 'recruiter-1',
        modelName: 'gemini-test',
        inputTokens: 500,
        outputTokens: 300,
        referenceType: 'JOB_POST_AI',
        referenceId: 'usage-1',
        succeeded: true,
      }),
    });
  });

  it('không ghi AiUsageLog khi Gemini lỗi (không có token thật để đo)', async () => {
    gemini.generateDraft.mockRejectedValue(new Error('model unavailable'));

    await expect(
      service.generate('recruiter-1', {
        title: 'Senior React Developer',
        outputLanguage: JobPostOutputLanguage.VI,
        presentationStyle: JobPostPresentationStyle.SKILL_FOCUSED,
      }),
    ).rejects.toThrow('model unavailable');

    expect(prisma.aiUsageLog.create).not.toHaveBeenCalled();
    expect(quota.reverse).toHaveBeenCalled();
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
      modelName: 'gemini-test',
      draft: {
        ...rawDraft,
        // What the model actually returns when it paraphrases the catalog entry.
        jobCategoryName: 'Frontend',
        specializationNames: ['Frontend Engineering'],
      },
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
    gemini.extractDraft.mockResolvedValue({
      modelName: 'gemini-test',
      draft: { ...rawDraft, jobCategoryName: 'Cybersecurity' },
    });

    const response = await service.extractText(
      'recruiter-1',
      'Senior React Developer cần React và TypeScript. Mô tả công việc đủ dài để trích xuất.',
    );

    expect(response.draft.jobCategoryId).toBeNull();
  });
  // Trước bản này, key idempotency sinh bằng randomUUID() PHÍA SERVER, nên mỗi request
  // là một key mới: bấm "Tạo JD" hai lần trừ hai lượt quota VÀ trả tiền token hai lần
  // cho cùng một kết quả. Ba test dưới đây khóa ba trạng thái của key từ client.
  describe('idempotency theo clientRequestId', () => {
    const dto = {
      title: 'Senior React Developer',
      requiredSkillIds: [],
      outputLanguage: JobPostOutputLanguage.VI,
      presentationStyle: JobPostPresentationStyle.SKILL_FOCUSED,
      clientRequestId: '9f1c6b1e-4a2f-4c3a-9c1d-2b7f5a0e8d31',
    } as Parameters<JobPostAiService['generate']>[1];

    it('lần đầu: tiêu quota, gọi model, lưu kết quả', async () => {
      await service.generate('recruiter-1', dto);

      expect(quota.consume).toHaveBeenCalledTimes(1);
      expect(gemini.generateDraft).toHaveBeenCalledTimes(1);
      expect(cache.write).toHaveBeenCalledWith(
        expect.stringContaining('9f1c6b1e'),
        'job_post_ai.generate',
        expect.objectContaining({ modelName: 'gemini-test' }),
      );
    });

    // Đây là điểm chính của cả PR: retry sau khi đã xong KHÔNG được gọi lại model.
    it('retry sau khi đã xong: trả cache, KHÔNG gọi model và KHÔNG tiêu quota', async () => {
      const first = await service.generate('recruiter-1', dto);
      // Cache lưu OUTPUT THÔ của model, không lưu response đã hậu xử lý: thứ tốn tiền
      // là lời gọi model, còn map tên sang ID danh mục thì rẻ và deterministic. Chạy
      // lại hậu xử lý còn có lợi -- nếu danh mục đổi thì mapping được làm mới.
      cache.read.mockResolvedValue({ draft: rawDraft, modelName: 'gemini-test' });
      quota.consume.mockClear();
      gemini.generateDraft.mockClear();

      const second = await service.generate('recruiter-1', dto);

      expect(second).toEqual(first);
      expect(gemini.generateDraft).not.toHaveBeenCalled();
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('bấm hai lần trong lúc lần đầu đang chạy: 409, không gọi model lần hai', async () => {
      quota.consume.mockResolvedValue({
        usage: { id: 'usage-1', createdAt: new Date() },
        replayed: true,
      });
      cache.isStillInFlight.mockReturnValue(true);

      await expect(service.generate('recruiter-1', dto)).rejects.toMatchObject({
        response: { code: 'AI_OPERATION_IN_PROGRESS' },
      });
      expect(gemini.generateDraft).not.toHaveBeenCalled();
    });

    // Nếu luôn trả 409 cho nhánh replayed thì một lần gọi chết giữa đường sẽ làm người
    // dùng mất vĩnh viễn lượt đã trả. Quá ân hạn thì gọi lại model, nhưng không tiêu
    // thêm quota -- lượt đó đã được tính từ lần trước.
    it('lần trước đã chết: gọi lại model nhưng không tiêu thêm quota', async () => {
      quota.consume.mockResolvedValue({
        usage: { id: 'usage-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
        replayed: true,
      });
      cache.isStillInFlight.mockReturnValue(false);

      await service.generate('recruiter-1', dto);

      expect(gemini.generateDraft).toHaveBeenCalledTimes(1);
      // consume được gọi nhưng trả replayed -> không có lượt mới nào bị trừ.
      expect(quota.consume).toHaveBeenCalledTimes(1);
    });

    it('không có clientRequestId: giữ nguyên hành vi cũ, không đọc và không ghi cache', async () => {
      const { clientRequestId: _omitted, ...withoutKey } = dto as { clientRequestId?: string };

      await service.generate('recruiter-1', withoutKey as typeof dto);

      expect(cache.read).not.toHaveBeenCalled();
      expect(cache.write).not.toHaveBeenCalled();
      expect(gemini.generateDraft).toHaveBeenCalledTimes(1);
    });
    // `reverse()` giữ lại dòng CONSUME (sổ chỉ ghi thêm), nên một lần gọi model thất
    // bại vẫn để lại key đã dùng. Nếu chỉ xét thời gian thì lần bấm lại ngay sau đó
    // bị chẩn đoán sai là "đang chạy" -- người dùng vừa thấy thông báo lỗi, bấm thử
    // lại, và nhận "yêu cầu đang được xử lý".
    it('lần trước THẤT BẠI và đã hoàn lượt: cho chạy lại ngay, không báo đang xử lý', async () => {
      quota.consume.mockResolvedValue({
        usage: { id: 'usage-1', createdAt: new Date() },
        replayed: true,
      });
      cache.isStillInFlight.mockReturnValue(true);
      prisma.subscriptionUsage.findUnique.mockResolvedValue({ reversal: { id: 'reversal-1' } });

      await service.generate('recruiter-1', dto);

      expect(gemini.generateDraft).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Thang đọc file, và bất biến đi kèm: mọi thứ fail một cách xác định ở đây đều
   * xảy ra TRƯỚC `withJdCredit`, nên recruiter không bị trừ lượt cho một file mà
   * hệ thống chưa từng gửi cho model. Vì vậy gần như mọi ca dưới đây đều assert
   * `quota.consume` không được gọi -- đó là điểm chính, không phải chi tiết phụ.
   */
  describe('thang đọc file khi import JD', () => {
    const pdf = (name = 'jd.pdf'): JobPostAiUploadFile => ({
      // Chữ ký %PDF- là thứ `prepareFile` kiểm trước khi chạm tới pdfjs.
      buffer: Buffer.from('%PDF-1.7 nội dung giả, pdfjs đã được mock'),
      mimetype: 'application/pdf',
      originalname: name,
      size: 42,
    });

    function pdfPages(texts: string[]) {
      const pages = texts.map((text, index) => ({
        num: index + 1,
        text,
        letters: countLetters(text),
      }));
      return { pageCount: pages.length, pages, text: texts.join('\n') };
    }

    beforeEach(() => {
      extractPdfTextMock.mockReset();
    });

    it('PDF có text layer: gửi text cho model và KHÔNG gửi file', async () => {
      extractPdfTextMock.mockResolvedValue(pdfPages([REAL_JD_VI]));

      await service.extractFile('recruiter-1', pdf());

      const source = gemini.extractDraft.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(source.sourceText).toContain('Mô tả công việc');
      expect(source.file).toBeUndefined();
    });

    it('PDF scan: rơi xuống vision model với base64', async () => {
      extractPdfTextMock.mockResolvedValue(pdfPages(['', '']));

      await service.extractFile('recruiter-1', pdf());

      const source = gemini.extractDraft.mock.calls[0]?.[0] as {
        file?: { mimeType: string; base64Data: string };
        sourceText?: string;
      };
      expect(source.sourceText).toBeUndefined();
      expect(source.file?.mimeType).toBe('application/pdf');
      expect(source.file?.base64Data.length).toBeGreaterThan(0);
    });

    it('PDF đặt mật khẩu: báo lỗi và KHÔNG trừ lượt', async () => {
      extractPdfTextMock.mockRejectedValue(new UnreadablePdfError('password'));

      await expect(service.extractFile('recruiter-1', pdf())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(quota.consume).not.toHaveBeenCalled();
      expect(gemini.extractDraft).not.toHaveBeenCalled();
    });

    it('PDF hỏng: báo lỗi và KHÔNG trừ lượt', async () => {
      extractPdfTextMock.mockRejectedValue(new UnreadablePdfError('corrupt'));

      await expect(service.extractFile('recruiter-1', pdf())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('ảnh đổi tên thành .pdf: chặn ngay ở chữ ký, KHÔNG trừ lượt', async () => {
      // `file.mimetype` do client khai nên fileFilter của Multer không phát hiện được.
      const disguised: JobPostAiUploadFile = {
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        mimetype: 'application/pdf',
        originalname: 'jd.pdf',
        size: 6,
      };

      await expect(service.extractFile('recruiter-1', disguised)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(extractPdfTextMock).not.toHaveBeenCalled();
      expect(quota.consume).not.toHaveBeenCalled();
    });

    it('lỗi lạ từ thư viện đọc PDF: rơi xuống vision thay vì làm chết request', async () => {
      // Một bug trong pdfjs không được phép làm chết endpoint vốn chạy tốt bằng vision.
      extractPdfTextMock.mockRejectedValue(new TypeError('worker setup blew up'));

      await service.extractFile('recruiter-1', pdf());

      const source = gemini.extractDraft.mock.calls[0]?.[0] as { file?: unknown };
      expect(source.file).toBeDefined();
    });

    it('TXT quá ngắn: vẫn báo lỗi trước khi trừ lượt', async () => {
      const tooShort: JobPostAiUploadFile = {
        buffer: Buffer.from('JD ngắn'),
        mimetype: 'text/plain',
        originalname: 'jd.txt',
        size: 7,
      };

      await expect(service.extractFile('recruiter-1', tooShort)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(quota.consume).not.toHaveBeenCalled();
    });
  });
});
