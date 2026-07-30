import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toComparableName } from '../../common/utils/comparable-name';
import { slugify } from '../../common/utils/slugify';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';

@Injectable()
export class SpecializationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSpecializationDto) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Tên chuyên ngành không được để trống');

    // `name` carries no unique index — only `slug` does — so the same specialization could be added
    // twice under two slugs. Match on the normalised name as well, and derive the slug when the
    // caller has none to give (the recruiter form only knows the display name).
    const comparable = toComparableName(name);
    const existing = await this.prisma.specialization.findMany({
      select: { id: true, name: true, slug: true },
    });
    const duplicate = existing.find(
      (item) => toComparableName(item.name) === comparable || item.slug === (dto.slug ?? ''),
    );
    if (duplicate) {
      throw new ConflictException(`Chuyên ngành "${duplicate.name}" đã có trong danh mục`);
    }

    // `slugify` drops "đ" instead of folding it to "d" ("tự động" -> "tu-ong"), and other modules
    // already depend on that behaviour, so fold it here rather than changing the shared helper.
    const baseSlug = dto.slug?.trim() || slugify(name.replace(/đ/g, 'd').replace(/Đ/g, 'D'));
    const takenSlugs = new Set(existing.map((item) => item.slug));
    let slug = baseSlug;
    for (let suffix = 2; takenSlugs.has(slug); suffix += 1) {
      slug = `${baseSlug}-${suffix}`;
    }

    return this.prisma.specialization.create({ data: { name, slug } });
  }

  async findAll() {
    return this.prisma.specialization.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const record = await this.prisma.specialization.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Specialization not found');
    return record;
  }

  async update(id: string, dto: UpdateSpecializationDto) {
    await this.findOne(id);
    return this.prisma.specialization.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.specialization.delete({ where: { id } });
  }
}
