import { Module } from '@nestjs/common';
import { JobLocationsService } from './job-locations.service';
import { JobLocationsController } from './job-locations.controller';

@Module({
  controllers: [JobLocationsController],
  providers: [JobLocationsService],
})
export class JobLocationsModule {}
