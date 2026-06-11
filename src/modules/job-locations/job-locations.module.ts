import { Module } from '@nestjs/common';
import { JobLocationsService } from './job-locations.service';
import { JobLocationsController } from './job-locations.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [JobLocationsController],
  providers: [JobLocationsService, PrismaService],
})
export class JobLocationsModule {}
