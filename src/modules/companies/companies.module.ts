import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, PrismaService],
})
export class CompaniesModule {}
