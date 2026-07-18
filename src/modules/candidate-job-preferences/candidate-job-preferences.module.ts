import { Module } from '@nestjs/common';
import { CandidateJobPreferencesController } from './candidate-job-preferences.controller';
import { CandidateJobPreferencesService } from './candidate-job-preferences.service';

@Module({
  controllers: [CandidateJobPreferencesController],
  providers: [CandidateJobPreferencesService],
})
export class CandidateJobPreferencesModule {}
