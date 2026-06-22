import { Module } from '@nestjs/common';
import { CandidateLanguagesController } from './candidate-languages.controller';
import { CandidateLanguagesService } from './candidate-languages.service';

@Module({
  controllers: [CandidateLanguagesController],
  providers: [CandidateLanguagesService],
})
export class CandidateLanguagesModule {}
