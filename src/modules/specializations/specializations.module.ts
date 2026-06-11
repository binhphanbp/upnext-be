import { Module } from '@nestjs/common';
import { SpecializationsService } from './specializations.service';
import { SpecializationsController } from './specializations.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [SpecializationsController],
  providers: [SpecializationsService, PrismaService],
})
export class SpecializationsModule {}
