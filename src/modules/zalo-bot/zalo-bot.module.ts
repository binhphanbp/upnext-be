import { Module } from '@nestjs/common';
import { ZaloBotController } from './zalo-bot.controller';
import { ZaloBotService } from './zalo-bot.service';

@Module({
  controllers: [ZaloBotController],
  providers: [ZaloBotService],
  exports: [ZaloBotService],
})
export class ZaloBotModule {}
