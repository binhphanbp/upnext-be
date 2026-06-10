import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecruiterPermissionsController } from './recruiter-permissions.controller';
import { RecruiterRolesController } from './recruiter-roles.controller';
import { RecruiterRolesService } from './recruiter-roles.service';

@Module({
  controllers: [RecruiterRolesController, RecruiterPermissionsController],
  providers: [RecruiterRolesService, PrismaService],
})
export class RecruiterRolesModule {}
