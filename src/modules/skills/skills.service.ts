import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toComparableName } from '../../common/utils/comparable-name';
import { CreateSkillDto, CreateSkillCategoryDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Skill Categories ────────────────────────────────────────────────────

  async createCategory(dto: CreateSkillCategoryDto) {
    const existing = await this.prisma.skillCategory.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Skill category name already exists');
    return this.prisma.skillCategory.create({ data: dto });
  }

  async findAllCategories() {
    return this.prisma.skillCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { skills: true } } },
    });
  }

  async updateCategory(id: string, dto: Partial<CreateSkillCategoryDto>) {
    const existing = await this.prisma.skillCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Skill category not found');
    return this.prisma.skillCategory.update({
      where: { id },
      data: dto,
    });
  }

  async removeCategory(id: string) {
    const existing = await this.prisma.skillCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Skill category not found');
    return this.prisma.skillCategory.delete({ where: { id } });
  }

  async getTaxonomyStats() {
    const [totalSkills, activeSkills, totalSkillCategories, totalJobCategories, activeJobCategories] =
      await Promise.all([
        this.prisma.skill.count(),
        this.prisma.skill.count({ where: { isActive: true } }),
        this.prisma.skillCategory.count(),
        this.prisma.jobCategory.count(),
        this.prisma.jobCategory.count({ where: { isActive: true } }),
      ]);

    return {
      totalSkills,
      activeSkills,
      totalSkillCategories,
      totalJobCategories,
      activeJobCategories,
    };
  }

  async findAdminSkills(query: {
    page?: number;
    limit?: number;
    q?: string;
    categoryId?: string;
    isActive?: boolean;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 10));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.categoryId && query.categoryId !== 'all') {
      where.categoryId = query.categoryId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.q && query.q.trim()) {
      where.name = { contains: query.q.trim(), mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.skill.findMany({
        where,
        include: {
          category: true,
          _count: {
            select: {
              jobPostSkills: true,
              candidateSkills: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.skill.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // ─── Skills ──────────────────────────────────────────────────────────────

  async create(dto: CreateSkillDto) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Tên kỹ năng không được để trống');

    // The unique index only catches an exact string match, which lets "ReactJS", "React JS" and
    // "react js" all land in the catalog as separate skills. Compare on the normalised key instead.
    const comparable = toComparableName(name);
    const duplicate = (await this.prisma.skill.findMany({ select: { id: true, name: true } })).find(
      (skill) => toComparableName(skill.name) === comparable,
    );
    if (duplicate) {
      throw new ConflictException(`Kỹ năng "${duplicate.name}" đã có trong danh mục`);
    }

    return this.prisma.skill.create({
      data: { ...dto, name },
      include: { category: true },
    });
  }

  async search(query: string) {
    return this.prisma.skill.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' },
        isActive: true,
      },
      include: { category: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }

  async findAll(categoryId?: string) {
    return this.prisma.skill.findMany({
      where: { ...(categoryId ? { categoryId } : {}) },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.skill.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!record) throw new NotFoundException('Skill not found');
    return record;
  }

  async update(id: string, dto: UpdateSkillDto) {
    await this.findOne(id);
    return this.prisma.skill.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.skill.delete({ where: { id } });
  }
}
