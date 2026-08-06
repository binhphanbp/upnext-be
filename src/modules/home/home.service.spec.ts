import { HomeService } from './home.service';
import { JobStatus, ModerationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('HomeService', () => {
  const prismaMock: any = {
    jobPost: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  let service: HomeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HomeService(prismaMock as PrismaService);
  });

  it('builds a public predicate that only exposes approved, published, visible jobs', () => {
    const where = (service as any).buildPublicJobWhere('all', 'candidate-id');

    expect(where).toMatchObject({
      status: JobStatus.PUBLISHED,
      moderationStatus: ModerationStatus.APPROVED,
      deletedAt: null,
      isHidden: false,
      publishedAt: { not: null },
      applications: { none: { candidateProfileId: 'candidate-id' } },
      company: { status: 'ACTIVE' },
    });
    expect(where.OR).toHaveLength(2);
  });

  it('limits expiring jobs to the next fourteen days', () => {
    const where = (service as any).buildPublicJobWhere('expiring');
    expect(where.expiredAt.gt).toBeInstanceOf(Date);
    expect(where.expiredAt.lte).toBeInstanceOf(Date);
    expect(where.expiredAt.lte.getTime() - where.expiredAt.gt.getTime()).toBeGreaterThanOrEqual(
      14 * 24 * 60 * 60 * 1000 - 1000,
    );
    expect(where.OR).toBeUndefined();
  });

  it('requires a real recent view for popular jobs and keeps expiring jobs in their own section', () => {
    const where = (service as any).buildPublicJobWhere('popular');

    expect(where.views.some.viewedAt.gte).toBeInstanceOf(Date);
    expect(where.OR).toHaveLength(2);
    expect(where.OR[1].expiredAt.gt).toBeInstanceOf(Date);
  });

  it('ranks popular jobs by real engagement before recency', () => {
    expect((service as any).getFeaturedJobOrderBy('popular')).toEqual([
      { views: { _count: 'desc' } },
      { savedJobs: { _count: 'desc' } },
      { publishedAt: 'desc' },
    ]);
  });

  it('returns empty pagination without inventing job cards', async () => {
    prismaMock.jobPost.findMany.mockResolvedValue([]);
    prismaMock.jobPost.count.mockResolvedValue(0);

    await expect(service.getFeaturedJobs('latest', 1, 8)).resolves.toMatchObject({
      items: [],
      pagination: {
        page: 1,
        limit: 8,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });
  });
});
