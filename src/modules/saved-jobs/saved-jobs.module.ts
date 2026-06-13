import { Module } from '@nestjs/common';
import { SavedJobsService } from './saved-jobs.service';
import { SavedJobsController } from './saved-jobs.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [SavedJobsController],
  providers: [SavedJobsService, PrismaService],
})
export class SavedJobsModule {}
