import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';

@Injectable()
export class SpecializationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSpecializationDto) {
    const existing = await this.prisma.specialization.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('Specialization slug already exists');
    return this.prisma.specialization.create({ data: dto });
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
