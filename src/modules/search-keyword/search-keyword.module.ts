import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SearchKeywordController } from './search-keyword.controller';
import { SearchKeywordService } from './search-keyword.service';

@Module({
  controllers: [SearchKeywordController],
  providers: [SearchKeywordService, PrismaService],
  exports: [SearchKeywordService],
})
export class SearchKeywordModule {}
