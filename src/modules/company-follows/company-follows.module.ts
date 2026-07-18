import { Module } from '@nestjs/common';
import { CompanyFollowsService } from './company-follows.service';
import { CompanyFollowsController } from './company-follows.controller';

@Module({
  controllers: [CompanyFollowsController],
  providers: [CompanyFollowsService],
})
export class CompanyFollowsModule {}
