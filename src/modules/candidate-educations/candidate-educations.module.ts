import { Module } from '@nestjs/common';
import { CandidateEducationsController } from './candidate-educations.controller';
import { CandidateEducationsService } from './candidate-educations.service';

@Module({
  controllers: [CandidateEducationsController],
  providers: [CandidateEducationsService],
})
export class CandidateEducationsModule {}
