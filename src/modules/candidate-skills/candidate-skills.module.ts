import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateSkillsController } from './candidate-skills.controller';
import { CandidateSkillsService } from './candidate-skills.service';

@Module({
  controllers: [CandidateSkillsController],
  providers: [CandidateSkillsService, PrismaService],
})
export class CandidateSkillsModule {}
