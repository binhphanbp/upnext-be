import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateJobLocationDto } from './dto/create-job-location.dto';
import { UpdateJobLocationDto } from './dto/update-job-location.dto';

@Injectable()
export class JobLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateJobLocationDto) {
    return this.prisma.companyLocation.create({ data: dto });
  }

  async findAll() {
    return this.prisma.companyLocation.findMany({
      orderBy: [{ city: 'asc' }, { district: 'asc' }],
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.companyLocation.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Job location not found');
    return record;
  }

  async update(id: string, dto: UpdateJobLocationDto) {
    await this.findOne(id);
    return this.prisma.companyLocation.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.companyLocation.delete({ where: { id } });
  }
}
