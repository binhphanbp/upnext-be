import { Module } from '@nestjs/common';
import { EmploymentTypesService } from './employment-types.service';
import { EmploymentTypesController } from './employment-types.controller';

@Module({
  controllers: [EmploymentTypesController],
  providers: [EmploymentTypesService],
})
export class EmploymentTypesModule {}
