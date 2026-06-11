import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateJobCategoryDto } from './dto/create-job-category.dto';
import { UpdateJobCategoryDto } from './dto/update-job-category.dto';

@Injectable()
export class JobCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateJobCategoryDto) {
    const existing = await this.prisma.jobCategory.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Job category name already exists');
    return this.prisma.jobCategory.create({ data: dto });
  }

  async findAll() {
    return this.prisma.jobCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async findOne(id: string) {
    const category = await this.prisma.jobCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Job category not found');
    return category;
  }

  async update(id: string, dto: UpdateJobCategoryDto) {
    await this.findOne(id);
    return this.prisma.jobCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.jobCategory.delete({ where: { id } });
  }
}
