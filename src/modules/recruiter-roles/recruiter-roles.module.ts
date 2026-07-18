import { Module } from '@nestjs/common';
import { RecruiterPermissionsController } from './recruiter-permissions.controller';
import { RecruiterRolesController } from './recruiter-roles.controller';
import { RecruiterRolesService } from './recruiter-roles.service';

@Module({
  controllers: [RecruiterRolesController, RecruiterPermissionsController],
  providers: [RecruiterRolesService],
})
export class RecruiterRolesModule {}
