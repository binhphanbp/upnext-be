import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateExperienceLevelDto } from './dto/create-experience-level.dto';
import { UpdateExperienceLevelDto } from './dto/update-experience-level.dto';

@Injectable()
export class ExperienceLevelsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExperienceLevelDto) {
    const existing = await this.prisma.experienceLevel.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Experience level code already exists');
    return this.prisma.experienceLevel.create({ data: dto });
  }

  async findAll() {
    return this.prisma.experienceLevel.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const record = await this.prisma.experienceLevel.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Experience level not found');
    return record;
  }

  async update(id: string, dto: UpdateExperienceLevelDto) {
    await this.findOne(id);
    return this.prisma.experienceLevel.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.experienceLevel.delete({ where: { id } });
  }
}
