import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEmploymentTypeDto } from './dto/create-employment-type.dto';
import { UpdateEmploymentTypeDto } from './dto/update-employment-type.dto';

@Injectable()
export class EmploymentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEmploymentTypeDto) {
    const existing = await this.prisma.employmentType.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Employment type name already exists');
    return this.prisma.employmentType.create({ data: dto });
  }

  async findAll() {
    return this.prisma.employmentType.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const record = await this.prisma.employmentType.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Employment type not found');
    return record;
  }

  async update(id: string, dto: UpdateEmploymentTypeDto) {
    await this.findOne(id);
    return this.prisma.employmentType.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.employmentType.delete({ where: { id } });
  }
}
