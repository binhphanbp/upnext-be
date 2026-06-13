import { Module } from '@nestjs/common';
import { CompanyFollowsService } from './company-follows.service';
import { CompanyFollowsController } from './company-follows.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [CompanyFollowsController],
  providers: [CompanyFollowsService, PrismaService],
})
export class CompanyFollowsModule {}
