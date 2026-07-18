import { Module } from '@nestjs/common';
import { SearchKeywordController } from './search-keyword.controller';
import { SearchKeywordService } from './search-keyword.service';

@Module({
  controllers: [SearchKeywordController],
  providers: [SearchKeywordService],
  exports: [SearchKeywordService],
})
export class SearchKeywordModule {}
