import { Module } from '@nestjs/common';
import { CandidateCertificationsController } from './candidate-certifications.controller';
import { CandidateCertificationsService } from './candidate-certifications.service';

@Module({
  controllers: [CandidateCertificationsController],
  providers: [CandidateCertificationsService],
})
export class CandidateCertificationsModule {}
