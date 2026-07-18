import { Module } from '@nestjs/common';
import { CandidateExperiencesController } from './candidate-experiences.controller';
import { CandidateExperiencesService } from './candidate-experiences.service';

@Module({
  controllers: [CandidateExperiencesController],
  providers: [CandidateExperiencesService],
})
export class CandidateExperiencesModule {}
