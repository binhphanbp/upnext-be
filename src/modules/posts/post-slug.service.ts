import { ConflictException, Injectable } from '@nestjs/common';
import { PostStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type PublicSlugResolution =
  | { kind: 'post'; postId: string }
  | { kind: 'redirect'; canonicalSlug: string };

export function normalizePostSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
    .replace(/-+$/g, '');
}

@Injectable()
export class PostSlugService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAvailable(slug: string, excludePostId?: string): Promise<void> {
    const canonicalSlug = normalizePostSlug(slug);
    const [currentPost, historicalSlug] = await Promise.all([
      this.prisma.post.findFirst({
        where: {
          slug: canonicalSlug,
          ...(excludePostId ? { id: { not: excludePostId } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.postSlugHistory.findUnique({
        where: { slug: canonicalSlug },
        select: { id: true },
      }),
    ]);

    if (currentPost || historicalSlug) {
      throw new ConflictException('Slug is already in use.');
    }
  }

  async resolvePublicSlug(slug: string): Promise<PublicSlugResolution | null> {
    const canonicalSlug = normalizePostSlug(slug);
    if (!canonicalSlug) {
      return null;
    }

    const currentPost = await this.prisma.post.findFirst({
      where: { slug: canonicalSlug, status: PostStatus.PUBLISHED },
      select: { id: true },
    });
    if (currentPost) {
      return { kind: 'post', postId: currentPost.id };
    }

    const historicalSlug = await this.prisma.postSlugHistory.findUnique({
      where: { slug: canonicalSlug },
      select: {
        post: {
          select: { slug: true, status: true },
        },
      },
    });

    if (historicalSlug?.post.status !== PostStatus.PUBLISHED) {
      return null;
    }

    return { kind: 'redirect', canonicalSlug: historicalSlug.post.slug };
  }

  async recordPreviousSlug(
    tx: Prisma.TransactionClient,
    postId: string,
    slug: string,
  ): Promise<void> {
    await tx.postSlugHistory.create({
      data: { postId, slug: normalizePostSlug(slug) },
    });
  }
}
