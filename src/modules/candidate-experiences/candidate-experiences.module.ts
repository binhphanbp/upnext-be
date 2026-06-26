import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateExperiencesController } from './candidate-experiences.controller';
import { CandidateExperiencesService } from './candidate-experiences.service';

@Module({
  controllers: [CandidateExperiencesController],
  providers: [CandidateExperiencesService, PrismaService],
})
export class CandidateExperiencesModule {}
