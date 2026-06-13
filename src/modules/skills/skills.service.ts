import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
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

  // ─── Skills ──────────────────────────────────────────────────────────────

  async create(dto: CreateSkillDto) {
    const existing = await this.prisma.skill.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Skill name already exists');
    return this.prisma.skill.create({
      data: dto,
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
