import { Module } from '@nestjs/common';
import { CompanyMembersController } from './company-members.controller';
import { CompanyMembersService } from './company-members.service';

@Module({
  controllers: [CompanyMembersController],
  providers: [CompanyMembersService],
})
export class CompanyMembersModule {}
