import { Module } from '@nestjs/common';
import { EmploymentTypesService } from './employment-types.service';
import { EmploymentTypesController } from './employment-types.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [EmploymentTypesController],
  providers: [EmploymentTypesService, PrismaService],
})
export class EmploymentTypesModule {}
