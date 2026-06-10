import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CompanyMembersController } from './company-members.controller';
import { CompanyMembersService } from './company-members.service';

@Module({
  controllers: [CompanyMembersController],
  providers: [CompanyMembersService, PrismaService],
})
export class CompanyMembersModule {}
