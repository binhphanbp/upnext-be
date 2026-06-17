import { Module } from '@nestjs/common';
import { CvTemplatesController } from './cv-templates.controller';
import { CvTemplatesService } from './cv-templates.service';
import { CvVersionsController } from './cv-versions.controller';
import { CvVersionsService } from './cv-versions.service';
import { CvsController } from './cvs.controller';
import { CvsService } from './cvs.service';

@Module({
  controllers: [CvsController, CvVersionsController, CvTemplatesController],
  providers: [CvsService, CvVersionsService, CvTemplatesService],
  exports: [CvsService, CvVersionsService, CvTemplatesService],
})
export class CvsModule {}
