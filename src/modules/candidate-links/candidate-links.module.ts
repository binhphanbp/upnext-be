import { Module } from '@nestjs/common';
import { CandidateLinksController } from './candidate-links.controller';
import { CandidateLinksService } from './candidate-links.service';

@Module({
  controllers: [CandidateLinksController],
  providers: [CandidateLinksService],
})
export class CandidateLinksModule {}
