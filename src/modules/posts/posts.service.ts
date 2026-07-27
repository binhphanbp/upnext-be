import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PostStatus, PostType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slugify';
import { CreatePostDto } from './dto/create-post.dto';
import { ListAdminPostsQueryDto } from './dto/list-admin-posts-query.dto';
import { ListPublicPostsQueryDto } from './dto/list-public-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreatePostCategoryDto, UpdatePostCategoryDto } from './dto/category-dto';
import { CreateTagDto, UpdateTagDto } from './dto/tag-dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(adminId: string, dto: CreatePostDto) {
    // Validate post category if categoryId is provided
    if (dto.categoryId) {
      const category = await this.prisma.postCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Post category not found');
      }
    }

    // Validate tags if tagIds are provided
    if (dto.tagIds && dto.tagIds.length > 0) {
      const tagsCount = await this.prisma.tag.count({
        where: { id: { in: dto.tagIds } },
      });
      if (tagsCount !== dto.tagIds.length) {
        throw new BadRequestException('One or more tags not found');
      }
    }

    // Generate unique slug
    const uniqueSuffix = Date.now().toString(36);
    const slug = `${slugify(dto.title)}-${uniqueSuffix}`;

    return this.prisma.post.create({
      data: {
        title: dto.title,
        slug,
        content: dto.content,
        status: dto.status ?? PostStatus.DRAFT,
        type: dto.type ?? PostType.BLOG,
        adminId,
        categoryId: dto.categoryId ?? null,
        thumbnailFileId: dto.thumbnailFileId ?? null,
        coverImageFileId: dto.coverImageFileId ?? null,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        metaKeywords: dto.metaKeywords ?? null,
        viewCount: dto.viewCount ?? 0,
        postTags:
          dto.tagIds && dto.tagIds.length > 0
            ? {
                create: dto.tagIds.map((tagId) => ({ tagId })),
              }
            : undefined,
      },
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
              OR: [
                { slug: query.categorySlug },
                { parent: { slug: query.categorySlug } },
              ],
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
    const post = await this.findOne(id);

    // Generate new slug if title changes
    let slug = post.slug;
    if (dto.title && dto.title !== post.title) {
      const uniqueSuffix = Date.now().toString(36);
      slug = `${slugify(dto.title)}-${uniqueSuffix}`;
    }

    // Validate post category if categoryId is updated
    if (dto.categoryId) {
      const category = await this.prisma.postCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Post category not found');
      }
    }

    // Validate and update tags if tagIds are updated
    if (dto.tagIds) {
      if (dto.tagIds.length > 0) {
        const tagsCount = await this.prisma.tag.count({
          where: { id: { in: dto.tagIds } },
        });
        if (tagsCount !== dto.tagIds.length) {
          throw new BadRequestException('One or more tags not found');
        }
      }
      // Delete existing post-tag links first
      await this.prisma.postTag.deleteMany({
        where: { postId: id },
      });
    }

    return this.prisma.post.update({
      where: { id },
      data: {
        title: dto.title,
        slug,
        content: dto.content,
        status: dto.status,
        type: dto.type,
        categoryId: dto.categoryId === undefined ? undefined : dto.categoryId,
        thumbnailFileId: dto.thumbnailFileId === undefined ? undefined : dto.thumbnailFileId,
        coverImageFileId: dto.coverImageFileId === undefined ? undefined : dto.coverImageFileId,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        metaKeywords: dto.metaKeywords,
        postTags: dto.tagIds
          ? {
              create: dto.tagIds.map((tagId) => ({ tagId })),
            }
          : undefined,
      },
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
