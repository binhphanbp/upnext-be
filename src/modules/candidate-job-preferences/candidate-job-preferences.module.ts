import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateJobPreferencesController } from './candidate-job-preferences.controller';
import { CandidateJobPreferencesService } from './candidate-job-preferences.service';

@Module({
  controllers: [CandidateJobPreferencesController],
  providers: [CandidateJobPreferencesService, PrismaService],
})
export class CandidateJobPreferencesModule {}
