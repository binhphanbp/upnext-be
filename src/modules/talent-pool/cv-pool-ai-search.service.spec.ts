import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../cv-screening/embedding.service';
import { SubscriptionQuotaService } from '../subscriptions/subscription-quota.service';
import { CvPoolAiSearchService } from './cv-pool-ai-search.service';

describe('CvPoolAiSearchService', () => {
  const companyId = 'company-1';
  const jobPostId = 'job-1';
  const idempotencyKey = 'idem-1';

  let prisma: {
    candidateProfile: { findMany: jest.Mock };
    cV: { findMany: jest.Mock };
    jobPost: { findFirst: jest.Mock };
  };
  let embeddings: {
    getOrCreateCvEmbeddings: jest.Mock;
    getOrCreateJobEmbedding: jest.Mock;
    rankCvEmbeddings: jest.Mock;
  };
  let quota: { assertFeatureEnabled: jest.Mock; consume: jest.Mock };
  let service: CvPoolAiSearchService;

  function cvRow(
    candidateProfileId: string,
    versionId: string | null = `${candidateProfileId}-v1`,
  ) {
    return {
      candidateProfileId,
      versions: versionId ? [{ id: versionId }] : [],
    };
  }

  function profileRow(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      description: null,
      preferredSearchCity: null,
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      jobSearchStatus: 'OPEN_TO_WORK',
      account: { fullName: `Ứng viên ${id}` },
      skills: [],
      experiences: [],
      jobPreference: null,
      cvs: [{ id: 'cv-1' }],
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      candidateProfile: { findMany: jest.fn().mockResolvedValue([]) },
      cV: { findMany: jest.fn().mockResolvedValue([]) },
      jobPost: { findFirst: jest.fn() },
    };
    embeddings = {
      getOrCreateCvEmbeddings: jest.fn().mockResolvedValue(new Map()),
      getOrCreateJobEmbedding: jest.fn().mockResolvedValue({ vector: [0.1, 0.2] }),
      rankCvEmbeddings: jest.fn().mockResolvedValue([]),
    };
    quota = {
      assertFeatureEnabled: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn().mockResolvedValue({ usage: { id: 'usage-1' }, replayed: false }),
    };
    service = new CvPoolAiSearchService(
      prisma as unknown as PrismaService,
      embeddings as unknown as EmbeddingService,
      quota as unknown as SubscriptionQuotaService,
    );
  });

  it('kiểm quota TRƯỚC mọi truy vấn -- công ty chưa mua gói không tốn một query nào', async () => {
    quota.assertFeatureEnabled.mockRejectedValue(new Error('FEATURE_DISABLED'));

    await expect(service.search(companyId, jobPostId, idempotencyKey)).rejects.toThrow(
      'FEATURE_DISABLED',
    );
    expect(prisma.candidateProfile.findMany).not.toHaveBeenCalled();
  });

  it('không ứng viên nào đủ điều kiện ⇒ rỗng, không gọi embedding', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue([]);

    const result = await service.search(companyId, jobPostId, idempotencyKey);

    expect(result).toEqual({ data: [] });
    expect(embeddings.getOrCreateCvEmbeddings).not.toHaveBeenCalled();
  });

  it('tập ứng viên vượt ngưỡng fallback ⇒ 503, không charge', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue(
      Array.from({ length: 2001 }, (_, i) => ({ id: `p${i}` })),
    );

    await expect(service.search(companyId, jobPostId, idempotencyKey)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('ứng viên đủ điều kiện nhưng KHÔNG ai có CV mặc định ⇒ rỗng, không gọi embedding', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.cV.findMany.mockResolvedValue([]);

    const result = await service.search(companyId, jobPostId, idempotencyKey);

    expect(result).toEqual({ data: [] });
    expect(embeddings.getOrCreateCvEmbeddings).not.toHaveBeenCalled();
  });

  it('BUG ĐÃ SỬA: phải GET-OR-CREATE embedding CV, không chỉ đọc bảng cv_embeddings', async () => {
    // Trước khi sửa, service chỉ `cvEmbedding.findMany()` -- một read thuần.
    // Không nơi nào trong repo từng ghi vào bảng đó cho CV nên nó luôn rỗng và
    // tính năng luôn trả về rỗng bất kể input. Test này khoá đúng hành vi mới:
    // phải gọi `getOrCreateCvEmbeddings()` với cvVersionId của CV mặc định mới
    // nhất, để embedding còn thiếu được TẠO chứ không chỉ được đọc.
    prisma.candidateProfile.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    prisma.cV.findMany.mockResolvedValue([cvRow('p1', 'v1'), cvRow('p2', 'v2')]);
    embeddings.getOrCreateCvEmbeddings.mockResolvedValue(
      new Map([
        ['v1', { vector: [1, 0], text: 't1', modelName: 'm', updatedAt: new Date() }],
        ['v2', { vector: [0, 1], text: 't2', modelName: 'm', updatedAt: new Date() }],
      ]),
    );
    embeddings.rankCvEmbeddings.mockResolvedValue([
      { cvVersionId: 'v1', semanticScore: 91.4, text: 't1', updatedAt: new Date() },
    ]);
    // Gọi lần 1: tập đủ điều kiện. Gọi lần 2: enrich hồ sơ sau khi rank xong.
    prisma.candidateProfile.findMany.mockReset();
    prisma.candidateProfile.findMany.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }]);
    prisma.candidateProfile.findMany.mockResolvedValueOnce([profileRow('p1')]);

    const result = await service.search(companyId, jobPostId, idempotencyKey);

    expect(embeddings.getOrCreateCvEmbeddings).toHaveBeenCalledWith(
      expect.arrayContaining(['v1', 'v2']),
      expect.any(Number),
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ candidateProfileId: 'p1', matchScore: 91 });
  });

  it('lấy đúng CV mặc định, phiên bản mới nhất -- không phải phiên bản bất kỳ', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.cV.findMany.mockResolvedValue([cvRow('p1', 'v1')]);

    await service.search(companyId, jobPostId, idempotencyKey);

    const [args] = prisma.cV.findMany.mock.calls[0]!;
    expect(args.where).toMatchObject({ isDefault: true });
    expect(args.select.versions.orderBy).toEqual({ versionNo: 'desc' });
    expect(args.select.versions.take).toBe(1);
  });

  it('ứng viên không có CV mặc định (versions rỗng) bị loại, không vỡ request', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.cV.findMany.mockResolvedValue([cvRow('p1', null)]);

    const result = await service.search(companyId, jobPostId, idempotencyKey);

    expect(result).toEqual({ data: [] });
    expect(embeddings.getOrCreateCvEmbeddings).not.toHaveBeenCalled();
  });

  it('embedding tạo thất bại cho một CV (map thiếu key) ⇒ ứng viên đó bị loại khỏi rank, không vỡ request', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    prisma.cV.findMany.mockResolvedValue([cvRow('p1', 'v1'), cvRow('p2', 'v2')]);
    // `getOrCreateCvEmbeddings` tự log+skip lỗi tạo embedding cho từng CV --
    // map trả về có thể thiếu key dù input có 2 phần tử.
    embeddings.getOrCreateCvEmbeddings.mockResolvedValue(
      new Map([['v1', { vector: [1, 0], text: 't1', modelName: 'm', updatedAt: new Date() }]]),
    );
    embeddings.rankCvEmbeddings.mockResolvedValue([
      { cvVersionId: 'v1', semanticScore: 80, text: 't1', updatedAt: new Date() },
    ]);
    prisma.candidateProfile.findMany.mockReset();
    prisma.candidateProfile.findMany.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }]);
    prisma.candidateProfile.findMany.mockResolvedValueOnce([profileRow('p1')]);

    await service.search(companyId, jobPostId, idempotencyKey);

    // Chỉ v1 (embedding tạo thành công) được đưa vào rank -- v2 bị loại.
    const [, cvVersionIdsArg] = embeddings.rankCvEmbeddings.mock.calls[0]!;
    expect(cvVersionIdsArg).toEqual(['v1']);
  });

  it('cả tập KHÔNG ai tạo được embedding ⇒ rỗng, không rank, không charge', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.cV.findMany.mockResolvedValue([cvRow('p1', 'v1')]);
    embeddings.getOrCreateCvEmbeddings.mockResolvedValue(new Map());

    const result = await service.search(companyId, jobPostId, idempotencyKey);

    expect(result).toEqual({ data: [] });
    expect(embeddings.getOrCreateJobEmbedding).not.toHaveBeenCalled();
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('rank ra 0 kết quả ⇒ rỗng, KHÔNG trừ quota (khác Discovery, xem doc comment)', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.cV.findMany.mockResolvedValue([cvRow('p1', 'v1')]);
    embeddings.getOrCreateCvEmbeddings.mockResolvedValue(
      new Map([['v1', { vector: [1, 0], text: 't1', modelName: 'm', updatedAt: new Date() }]]),
    );
    embeddings.rankCvEmbeddings.mockResolvedValue([]);

    const result = await service.search(companyId, jobPostId, idempotencyKey);

    expect(result).toEqual({ data: [] });
    expect(quota.consume).not.toHaveBeenCalled();
  });

  it('có kết quả ⇒ trừ đúng 1 quota với idempotencyKey đã truyền', async () => {
    prisma.candidateProfile.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.cV.findMany.mockResolvedValue([cvRow('p1', 'v1')]);
    embeddings.getOrCreateCvEmbeddings.mockResolvedValue(
      new Map([['v1', { vector: [1, 0], text: 't1', modelName: 'm', updatedAt: new Date() }]]),
    );
    embeddings.rankCvEmbeddings.mockResolvedValue([
      { cvVersionId: 'v1', semanticScore: 77.9, text: 't1', updatedAt: new Date() },
    ]);
    prisma.candidateProfile.findMany.mockReset();
    prisma.candidateProfile.findMany.mockResolvedValueOnce([{ id: 'p1' }]);
    prisma.candidateProfile.findMany.mockResolvedValueOnce([profileRow('p1')]);

    await service.search(companyId, jobPostId, idempotencyKey);

    expect(quota.consume).toHaveBeenCalledTimes(1);
    expect(quota.consume).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        companyId,
        feature: 'cv_pool_ai_search',
        idempotencyKey,
      }),
    );
  });

  it('matchScore là số nguyên làm tròn từ semanticScore', async () => {
    prisma.candidateProfile.findMany.mockResolvedValueOnce([{ id: 'p1' }]);
    prisma.cV.findMany.mockResolvedValue([cvRow('p1', 'v1')]);
    embeddings.getOrCreateCvEmbeddings.mockResolvedValue(
      new Map([['v1', { vector: [1, 0], text: 't1', modelName: 'm', updatedAt: new Date() }]]),
    );
    embeddings.rankCvEmbeddings.mockResolvedValue([
      { cvVersionId: 'v1', semanticScore: 77.6, text: 't1', updatedAt: new Date() },
    ]);
    prisma.candidateProfile.findMany.mockResolvedValueOnce([profileRow('p1')]);

    const result = await service.search(companyId, jobPostId, idempotencyKey);

    expect(result.data[0]?.matchScore).toBe(78);
  });

  describe('assertJobPostOwnedByCompany', () => {
    it('job thuộc công ty ⇒ không ném lỗi', async () => {
      prisma.jobPost.findFirst.mockResolvedValue({ id: jobPostId });

      await expect(
        service.assertJobPostOwnedByCompany(companyId, jobPostId),
      ).resolves.toBeUndefined();
    });

    it('job không tồn tại hoặc không thuộc công ty ⇒ 404', async () => {
      prisma.jobPost.findFirst.mockResolvedValue(null);

      await expect(service.assertJobPostOwnedByCompany(companyId, jobPostId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
