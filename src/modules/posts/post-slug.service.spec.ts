import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePostSlug, PostSlugService } from './post-slug.service';

type SlugPrismaBoundary = {
  post: {
    findFirst: jest.Mock;
  };
  postSlugHistory: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
};

function createService() {
  const prisma: SlugPrismaBoundary = {
    post: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    postSlugHistory: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'history-1',
        postId: 'post-1',
        slug: 'old-slug',
        createdAt: new Date('2026-08-26T00:00:00.000Z'),
      }),
    },
  };

  return {
    service: new PostSlugService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('normalizePostSlug', () => {
  it('normalizes Vietnamese text into a canonical URL slug', () => {
    expect(normalizePostSlug(' Hướng dẫn viết CV 2026 ')).toBe('huong-dan-viet-cv-2026');
  });

  it('caps canonical slugs at 200 characters', () => {
    expect(normalizePostSlug('s'.repeat(201))).toBe('s'.repeat(200));
  });
});

describe('PostSlugService.assertAvailable', () => {
  it('rejects a slug already used by a current post', async () => {
    const { service, prisma } = createService();
    prisma.post.findFirst.mockImplementation(async ({ where }) =>
      where.slug === 'current-slug' && !where.id ? { id: 'post-1' } : null,
    );

    await expect(service.assertAvailable('current-slug')).rejects.toThrow(ConflictException);
  });

  it('rejects a slug reserved by history', async () => {
    const { service, prisma } = createService();
    prisma.postSlugHistory.findUnique.mockImplementation(async ({ where }) =>
      where.slug === 'old-slug' ? { id: 'history-1' } : null,
    );

    await expect(service.assertAvailable(' Old Slug ')).rejects.toThrow(ConflictException);
  });

  it('allows the current post to retain its canonical slug', async () => {
    const { service, prisma } = createService();
    prisma.post.findFirst.mockImplementation(async ({ where }) =>
      where.id?.not === 'post-1' ? null : { id: 'post-1' },
    );

    await expect(service.assertAvailable('current-slug', 'post-1')).resolves.toBeUndefined();
  });
});

describe('PostSlugService.resolvePublicSlug', () => {
  it('resolves a published current slug to its post', async () => {
    const { service, prisma } = createService();
    prisma.post.findFirst.mockImplementation(async ({ where }) =>
      where.slug === 'current-slug' && where.status === 'PUBLISHED' ? { id: 'post-1' } : null,
    );

    await expect(service.resolvePublicSlug('current-slug')).resolves.toEqual({
      kind: 'post',
      postId: 'post-1',
    });
  });

  it('resolves an old slug to the published canonical slug', async () => {
    const { service, prisma } = createService();
    prisma.postSlugHistory.findUnique.mockImplementation(async ({ where }) =>
      where.slug === 'old-slug' ? { post: { slug: 'current-slug', status: 'PUBLISHED' } } : null,
    );

    await expect(service.resolvePublicSlug('old-slug')).resolves.toEqual({
      kind: 'redirect',
      canonicalSlug: 'current-slug',
    });
  });

  it('does not expose a historical slug for an unpublished post', async () => {
    const { service, prisma } = createService();
    prisma.postSlugHistory.findUnique.mockImplementation(async ({ where }) =>
      where.slug === 'old-slug' ? { post: { slug: 'archived-slug', status: 'ARCHIVED' } } : null,
    );

    await expect(service.resolvePublicSlug('old-slug')).resolves.toBeNull();
  });
});

describe('PostSlugService.recordPreviousSlug', () => {
  it('writes the normalized old slug inside the caller transaction', async () => {
    const { service } = createService();
    const createPreviousSlug = jest.fn().mockResolvedValue({
      id: 'history-1',
      postId: 'post-1',
      slug: 'huong-dan-cu',
      createdAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    const tx = {
      postSlugHistory: {
        create: createPreviousSlug,
      },
    } as unknown as Prisma.TransactionClient;

    await service.recordPreviousSlug(tx, 'post-1', ' Hướng dẫn cũ ');

    expect(createPreviousSlug).toHaveBeenCalledWith({
      data: { postId: 'post-1', slug: 'huong-dan-cu' },
    });
  });
});
