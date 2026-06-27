import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PostStatus, PostType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '../../common/utils/slugify';
import { CreatePostDto } from './dto/create-post.dto';
import { ListAdminPostsQueryDto } from './dto/list-admin-posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';

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
        postTags: dto.tagIds && dto.tagIds.length > 0
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

    // Determine sorting field and order
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

  async getCategories() {
    return this.prisma.postCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async getTags() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
