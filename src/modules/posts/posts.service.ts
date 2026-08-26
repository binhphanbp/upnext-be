import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostStatus, PostType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slugify';
import { CreatePostDto } from './dto/create-post.dto';
import { ListAdminPostsQueryDto } from './dto/list-admin-posts-query.dto';
import { ListPublicPostsQueryDto } from './dto/list-public-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreatePostCategoryDto, UpdatePostCategoryDto } from './dto/category-dto';
import { CreateTagDto, UpdateTagDto } from './dto/tag-dto';
import { PublishPostDto } from './dto/publish-post.dto';
import { normalizePostSlug, PostSlugService } from './post-slug.service';
import { sanitizePostHtml, validateDraft, validatePublish } from './post-content.policy';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postSlugService: PostSlugService,
  ) {}

  async create(adminId: string, dto: CreatePostDto) {
    const content = sanitizePostHtml(dto.content ?? '');
    const title = dto.title?.trim() ?? '';
    validateDraft({ title, content });
    const id = randomUUID();
    const slug = normalizePostSlug(dto.slug ?? title) || `draft-${id}`;
    await this.postSlugService.assertAvailable(slug);

    return this.prisma.$transaction(async (tx) => {
      await this.assertRelations(tx, dto);
      return tx.post.create({
        data: {
          id,
          title,
          slug,
          content,
          status: PostStatus.DRAFT,
          type: dto.type ?? PostType.BLOG,
          adminId,
          categoryId: dto.categoryId ?? null,
          thumbnailFileId: dto.thumbnailFileId ?? null,
          coverImageFileId: dto.coverImageFileId ?? null,
          socialImageFileId: dto.socialImageFileId ?? null,
          excerpt: dto.excerpt ?? null,
          thumbnailAlt: dto.thumbnailAlt ?? null,
          coverImageAlt: dto.coverImageAlt ?? null,
          socialImageAlt: dto.socialImageAlt ?? null,
          metaTitle: dto.metaTitle ?? null,
          metaDescription: dto.metaDescription ?? null,
          metaKeywords: dto.metaKeywords ?? null,
          focusKeyword: dto.focusKeyword ?? null,
          canonicalUrl: dto.canonicalUrl ?? null,
          isIndexable: dto.isIndexable ?? true,
          isFollowable: dto.isFollowable ?? true,
          socialTitle: dto.socialTitle ?? null,
          socialDescription: dto.socialDescription ?? null,
          postTags: dto.tagIds?.length
            ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
            : undefined,
        },
        include: this.postInclude,
      });
    });
  }

  async findAllForAdmin(query: ListAdminPostsQueryDto) {
    const where: Prisma.PostWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { content: { contains: query.q, mode: 'insensitive' } },
              { metaTitle: { contains: query.q, mode: 'insensitive' } },
              { metaDescription: { contains: query.q, mode: 'insensitive' } },
              { metaKeywords: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const validSortFields = ['createdAt', 'updatedAt', 'title', 'status', 'type'];
    const sortBy = validSortFields.includes(query.sortBy || '') ? query.sortBy : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortBy!]: sortOrder };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: query.limit,
        orderBy,
        include: {
          category: true,
          admin: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true,
            },
          },
          thumbnailFile: true,
          coverImageFile: true,
          postTags: {
            include: {
              tag: true,
            },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
    };
  }

  async findAllPublic(query: ListPublicPostsQueryDto) {
    const searchKeyword = query.q || query.search;
    const where: Prisma.PostWhereInput = {
      status: PostStatus.PUBLISHED,
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.categorySlug
        ? {
            category: {
              OR: [{ slug: query.categorySlug }, { parent: { slug: query.categorySlug } }],
            },
          }
        : {}),
      ...(query.tagId
        ? {
            postTags: {
              some: {
                tagId: query.tagId,
              },
            },
          }
        : {}),
      ...(query.tag
        ? {
            postTags: {
              some: {
                tag: {
                  OR: [{ id: query.tag }, { slug: query.tag }, { name: query.tag }],
                },
              },
            },
          }
        : {}),
      ...(searchKeyword
        ? {
            OR: [
              { title: { contains: searchKeyword, mode: 'insensitive' } },
              { content: { contains: searchKeyword, mode: 'insensitive' } },
              { metaTitle: { contains: searchKeyword, mode: 'insensitive' } },
              { metaDescription: { contains: searchKeyword, mode: 'insensitive' } },
              { metaKeywords: { contains: searchKeyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const validSortFields = ['createdAt', 'updatedAt', 'title', 'viewCount'];
    const sortBy = validSortFields.includes(query.sortBy || '') ? query.sortBy : 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortBy!]: sortOrder };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: query.limit,
        orderBy,
        include: {
          category: true,
          admin: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          thumbnailFile: true,
          coverImageFile: true,
          postTags: {
            include: {
              tag: true,
            },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
    };
  }

  async findPublicBySlug(slug: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        slug,
        status: PostStatus.PUBLISHED,
      },
      include: {
        category: true,
        admin: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        thumbnailFile: true,
        coverImageFile: true,
        postTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.prisma.post.update({
      where: { id: post.id },
      data: { viewCount: { increment: 1 } },
    });
    post.viewCount += 1;

    return post;
  }

  async findPublicById(id: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        id,
        status: PostStatus.PUBLISHED,
      },
      include: {
        category: true,
        admin: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        thumbnailFile: true,
        coverImageFile: true,
        postTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.prisma.post.update({
      where: { id: post.id },
      data: { viewCount: { increment: 1 } },
    });
    post.viewCount += 1;

    return post;
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        category: true,
        admin: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
          },
        },
        thumbnailFile: true,
        coverImageFile: true,
        postTags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async update(id: string, dto: UpdatePostDto) {
    return this.prisma.$transaction(async (tx) => {
      const post = await this.findPostForEdit(tx, id);
      this.assertFresh(post.updatedAt, dto.expectedUpdatedAt);
      const content = dto.content === undefined ? post.content : sanitizePostHtml(dto.content);
      const title = dto.title === undefined ? post.title : dto.title.trim();
      validateDraft({ title, content });
      const slug = dto.slug === undefined ? post.slug : normalizePostSlug(dto.slug);
      if (!slug) {
        throw new BadRequestException({ fieldErrors: { slug: 'Slug must not be empty.' } });
      }
      if (slug !== post.slug) {
        await this.postSlugService.assertAvailable(slug, id);
        await this.postSlugService.recordPreviousSlug(tx, id, post.slug);
      }
      await this.assertRelations(tx, dto);
      if (dto.tagIds !== undefined) {
        await tx.postTag.deleteMany({ where: { postId: id } });
        if (dto.tagIds.length) {
          await tx.postTag.createMany({ data: dto.tagIds.map((tagId) => ({ postId: id, tagId })) });
        }
      }
      return tx.post.update({
        where: { id },
        data: {
          title,
          slug,
          content,
          type: dto.type,
          categoryId: dto.categoryId === undefined ? undefined : dto.categoryId,
          thumbnailFileId: dto.thumbnailFileId === undefined ? undefined : dto.thumbnailFileId,
          coverImageFileId: dto.coverImageFileId === undefined ? undefined : dto.coverImageFileId,
          socialImageFileId:
            dto.socialImageFileId === undefined ? undefined : dto.socialImageFileId,
          excerpt: dto.excerpt,
          thumbnailAlt: dto.thumbnailAlt,
          coverImageAlt: dto.coverImageAlt,
          socialImageAlt: dto.socialImageAlt,
          metaTitle: dto.metaTitle,
          metaDescription: dto.metaDescription,
          metaKeywords: dto.metaKeywords,
          focusKeyword: dto.focusKeyword,
          canonicalUrl: dto.canonicalUrl,
          isIndexable: dto.isIndexable,
          isFollowable: dto.isFollowable,
          socialTitle: dto.socialTitle,
          socialDescription: dto.socialDescription,
        },
        include: this.postInclude,
      });
    });
  }

  async preview(id: string) {
    const post = await this.findOne(id);
    return { post, canonicalSlug: post.slug };
  }

  async slugAvailability(slug: string, excludePostId?: string) {
    const canonicalSlug = normalizePostSlug(slug);
    if (!canonicalSlug) {
      return { available: false, canonicalSlug };
    }
    try {
      await this.postSlugService.assertAvailable(canonicalSlug, excludePostId);
      return { available: true, canonicalSlug };
    } catch (error) {
      if (error instanceof ConflictException) {
        return { available: false, canonicalSlug };
      }
      throw error;
    }
  }

  async publish(id: string, dto: PublishPostDto) {
    return this.prisma.$transaction(async (tx) => {
      const post = await this.findPostForEdit(tx, id);
      this.assertFresh(post.updatedAt, dto.expectedUpdatedAt);
      const content = sanitizePostHtml(post.content);
      validatePublish({ ...post, content });
      return tx.post.update({
        where: { id },
        data: {
          content,
          status: PostStatus.PUBLISHED,
          publishedAt: post.publishedAt ?? new Date(),
        },
        include: this.postInclude,
      });
    });
  }

  async archive(id: string, dto: PublishPostDto) {
    return this.prisma.$transaction(async (tx) => {
      const post = await this.findPostForEdit(tx, id);
      this.assertFresh(post.updatedAt, dto.expectedUpdatedAt);
      return tx.post.update({
        where: { id },
        data: { status: PostStatus.ARCHIVED },
        include: this.postInclude,
      });
    });
  }

  private readonly postInclude = {
    category: true,
    admin: {
      select: { id: true, fullName: true, email: true, avatarUrl: true },
    },
    thumbnailFile: true,
    coverImageFile: true,
    postTags: { include: { tag: true } },
  } satisfies Prisma.PostInclude;

  private async findPostForEdit(tx: Prisma.TransactionClient, id: string) {
    const post = await tx.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  private assertFresh(updatedAt: Date, expectedUpdatedAt: string): void {
    if (updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new ConflictException('This post was updated by another editor. Reload and try again.');
    }
  }

  private async assertRelations(
    tx: Prisma.TransactionClient,
    dto: Pick<CreatePostDto, 'categoryId' | 'tagIds'>,
  ): Promise<void> {
    if (dto.categoryId) {
      const category = await tx.postCategory.findUnique({ where: { id: dto.categoryId } });
      if (!category) {
        throw new NotFoundException('Post category not found');
      }
    }
    if (dto.tagIds?.length) {
      const tagsCount = await tx.tag.count({ where: { id: { in: dto.tagIds } } });
      if (tagsCount !== new Set(dto.tagIds).size) {
        throw new BadRequestException('One or more tags not found');
      }
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.post.delete({
      where: { id },
    });
  }

  // ==================== Category Operations ==================== //

  async getCategories() {
    return this.prisma.postCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
  }

  async findOneCategory(id: string) {
    const category = await this.prisma.postCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });
    if (!category) {
      throw new NotFoundException('Post category not found');
    }
    return category;
  }

  async createCategory(dto: CreatePostCategoryDto) {
    const slug = dto.slug ? slugify(dto.slug) : `${slugify(dto.name)}-${Date.now().toString(36)}`;
    return this.prisma.postCategory.create({
      data: {
        name: dto.name,
        slug,
      },
    });
  }

  async updateCategory(id: string, dto: UpdatePostCategoryDto) {
    await this.findOneCategory(id);
    const data: Prisma.PostCategoryUpdateInput = {};
    if (dto.name) {
      data.name = dto.name;
    }
    if (dto.slug) {
      data.slug = slugify(dto.slug);
    } else if (dto.name) {
      data.slug = `${slugify(dto.name)}-${Date.now().toString(36)}`;
    }
    return this.prisma.postCategory.update({
      where: { id },
      data,
    });
  }

  async removeCategory(id: string) {
    await this.findOneCategory(id);
    await this.prisma.postCategory.delete({
      where: { id },
    });
  }

  // ==================== Tag Operations ==================== //

  async getTags() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { postTags: true },
        },
      },
    });
  }

  async findOneTag(id: string) {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: {
        _count: {
          select: { postTags: true },
        },
      },
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  async createTag(dto: CreateTagDto) {
    const slug = dto.slug ? slugify(dto.slug) : `${slugify(dto.name)}-${Date.now().toString(36)}`;
    return this.prisma.tag.create({
      data: {
        name: dto.name,
        slug,
      },
    });
  }

  async updateTag(id: string, dto: UpdateTagDto) {
    await this.findOneTag(id);
    const data: Prisma.TagUpdateInput = {};
    if (dto.name) {
      data.name = dto.name;
    }
    if (dto.slug) {
      data.slug = slugify(dto.slug);
    } else if (dto.name) {
      data.slug = `${slugify(dto.name)}-${Date.now().toString(36)}`;
    }
    return this.prisma.tag.update({
      where: { id },
      data,
    });
  }

  async removeTag(id: string) {
    await this.findOneTag(id);
    await this.prisma.tag.delete({
      where: { id },
    });
  }
}
