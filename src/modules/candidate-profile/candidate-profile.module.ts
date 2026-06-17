import { Module } from '@nestjs/common';
import { CandidateProfileController } from './candidate-profile.controller';
import { CandidateProfileService } from './candidate-profile.service';

@Module({
  controllers: [CandidateProfileController],
  providers: [CandidateProfileService],
})
export class CandidateProfileModule {}
