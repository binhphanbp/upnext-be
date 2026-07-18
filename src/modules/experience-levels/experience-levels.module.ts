import { Module } from '@nestjs/common';
import { ExperienceLevelsService } from './experience-levels.service';
import { ExperienceLevelsController } from './experience-levels.controller';

@Module({
  controllers: [ExperienceLevelsController],
  providers: [ExperienceLevelsService],
})
export class ExperienceLevelsModule {}
