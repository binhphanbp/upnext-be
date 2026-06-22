import { Module } from '@nestjs/common';
import { CandidateProjectsController } from './candidate-projects.controller';
import { CandidateProjectsService } from './candidate-projects.service';

@Module({
  controllers: [CandidateProjectsController],
  providers: [CandidateProjectsService],
})
export class CandidateProjectsModule {}
