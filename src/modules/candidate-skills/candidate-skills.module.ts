import { Module } from '@nestjs/common';
import { CandidateSkillsController } from './candidate-skills.controller';
import { CandidateSkillsService } from './candidate-skills.service';

@Module({
  controllers: [CandidateSkillsController],
  providers: [CandidateSkillsService],
})
export class CandidateSkillsModule {}
