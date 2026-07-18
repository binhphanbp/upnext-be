import { Module } from '@nestjs/common';
import { RecruiterShortlistsService } from './recruiter-shortlists.service';
import { RecruiterShortlistsController } from './recruiter-shortlists.controller';

@Module({
  controllers: [RecruiterShortlistsController],
  providers: [RecruiterShortlistsService],
})
export class RecruiterShortlistsModule {}
