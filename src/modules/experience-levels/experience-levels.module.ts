import { Module } from '@nestjs/common';
import { ExperienceLevelsService } from './experience-levels.service';
import { ExperienceLevelsController } from './experience-levels.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [ExperienceLevelsController],
  providers: [ExperienceLevelsService, PrismaService],
})
export class ExperienceLevelsModule {}
