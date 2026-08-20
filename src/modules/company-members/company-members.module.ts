import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CompanyMembersController } from './company-members.controller';
import { CompanyMembersService } from './company-members.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [CompanyMembersController],
  providers: [CompanyMembersService],
})
export class CompanyMembersModule {}
