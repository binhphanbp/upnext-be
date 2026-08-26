import { ConflictException } from '@nestjs/common';
import { PostStatus, PostType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PostSlugService } from './post-slug.service';
import { PostsService } from './posts.service';

const postId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const thumbnailFileId = '44444444-4444-4444-8444-444444444444';
const coverImageFileId = '55555555-5555-4555-8555-555555555555';
const firstPublishedAt = new Date('2026-08-20T12:00:00.000Z');
const currentUpdatedAt = new Date('2026-08-26T12:00:00.000Z');

const basePost = (overrides: Record<string, unknown> = {}) => ({
  id: postId,
  title: 'A practical guide to writing articles',
  slug: 'practical-article-guide',
  excerpt: 'e'.repeat(60),
  content: `<p>${'word '.repeat(300)}</p>`,
  categoryId,
  thumbnailFileId,
  coverImageFileId,
  thumbnailAlt: 'An editor writing an article',
  coverImageAlt: 'A laptop with an article draft',
  metaTitle: 'm'.repeat(40),
  metaDescription: 'd'.repeat(140),
  canonicalUrl: null,
  status: PostStatus.DRAFT,
  type: PostType.BLOG,
  publishedAt: null,
  updatedAt: currentUpdatedAt,
  ...overrides,
});

function createService(post = basePost()) {
  const tx = {
    post: {
      create: jest.fn().mockResolvedValue(post),
      findUnique: jest.fn().mockResolvedValue(post),
      update: jest.fn().mockResolvedValue(post),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    postCategory: {
      findUnique: jest.fn().mockResolvedValue({ id: categoryId }),
    },
    tag: {
      count: jest.fn().mockResolvedValue(0),
    },
    postTag: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const slugService = {
    assertAvailable: jest.fn().mockResolvedValue(undefined),
    recordPreviousSlug: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new PostsService(
      prisma as unknown as PrismaService,
      slugService as unknown as PostSlugService,
    ),
    prisma,
    tx,
    slugService,
  };
}

describe('PostsService editorial workflow', () => {
  it('creates a partial no-title draft with an ID-based fallback slug', async () => {
    const { service, tx } = createService();

    await service.create(adminId, { content: '<p>Working outline</p>' });

    const createArguments = tx.post.create.mock.calls[0][0];
    expect(createArguments.data).toEqual(
      expect.objectContaining({ id: expect.any(String), status: PostStatus.DRAFT }),
    );
    expect(createArguments.data.slug).toBe(`draft-${createArguments.data.id}`);
  });

  it('sanitizes draft HTML before persisting it', async () => {
    const { service, tx } = createService();

    await service.create(adminId, {
      title: 'Safe draft',
      content: '<p onclick="steal()">Hello</p><script>steal()</script>',
    });

    expect(tx.post.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: '<p>Hello</p>' }),
      }),
    );
  });

  it('rejects an autosave when the editor timestamp is stale', async () => {
    const { service, tx } = createService();

    await expect(
      service.update(postId, {
        expectedUpdatedAt: '2026-08-26T11:59:59.000Z',
        title: 'A newer editor title',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.post.update).not.toHaveBeenCalled();
  });

  it('replaces tag links inside the same transaction as an autosave', async () => {
    const tagId = '66666666-6666-4666-8666-666666666666';
    const { service, prisma, tx } = createService();
    tx.tag.count.mockResolvedValue(1);

    await service.update(postId, {
      expectedUpdatedAt: currentUpdatedAt.toISOString(),
      tagIds: [tagId],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.postTag.deleteMany).toHaveBeenCalledWith({ where: { postId } });
    expect(tx.postTag.createMany).toHaveBeenCalledWith({ data: [{ postId, tagId }] });
  });

  it('preserves the first publication time when publishing an already published post', async () => {
    const existingPublishedPost = basePost({
      status: PostStatus.PUBLISHED,
      publishedAt: firstPublishedAt,
    });
    const { service, tx } = createService(existingPublishedPost);

    await service.publish(postId, { expectedUpdatedAt: currentUpdatedAt.toISOString() });

    expect(tx.post.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PostStatus.PUBLISHED,
          publishedAt: firstPublishedAt,
        }),
      }),
    );
  });

  it('archives and later republishes without replacing the original publication time', async () => {
    const archivedPost = basePost({ status: PostStatus.ARCHIVED, publishedAt: firstPublishedAt });
    const { service, tx } = createService(archivedPost);

    await service.archive(postId, { expectedUpdatedAt: currentUpdatedAt.toISOString() });
    await service.publish(postId, { expectedUpdatedAt: currentUpdatedAt.toISOString() });

    expect(tx.post.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ status: PostStatus.ARCHIVED }) }),
    );
    expect(tx.post.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: PostStatus.PUBLISHED,
          publishedAt: firstPublishedAt,
        }),
      }),
    );
  });

  it('reserves the old slug when an autosave changes the canonical slug', async () => {
    const { service, slugService } = createService();

    await service.update(postId, {
      expectedUpdatedAt: currentUpdatedAt.toISOString(),
      slug: 'updated-article-guide',
    });

    expect(slugService.assertAvailable).toHaveBeenCalledWith('updated-article-guide', postId);
    expect(slugService.recordPreviousSlug).toHaveBeenCalledWith(
      expect.anything(),
      postId,
      'practical-article-guide',
    );
  });

  it('does not persist a publish request that fails content policy validation', async () => {
    const { service, tx } = createService(basePost({ content: '<p>Too short</p>' }));

    await expect(
      service.publish(postId, { expectedUpdatedAt: currentUpdatedAt.toISOString() }),
    ).rejects.toMatchObject({ status: 400 });

    expect(tx.post.update).not.toHaveBeenCalled();
  });
});
