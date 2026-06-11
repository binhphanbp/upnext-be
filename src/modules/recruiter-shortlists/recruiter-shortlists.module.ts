import { Module } from '@nestjs/common';
import { RecruiterShortlistsService } from './recruiter-shortlists.service';
import { RecruiterShortlistsController } from './recruiter-shortlists.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [RecruiterShortlistsController],
  providers: [RecruiterShortlistsService, PrismaService],
})
export class RecruiterShortlistsModule {}
