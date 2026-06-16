import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  controllers: [HomeController],
  providers: [HomeService, PrismaService],
})
export class HomeModule {}
