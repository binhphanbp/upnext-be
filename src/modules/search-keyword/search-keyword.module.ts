import { Module } from '@nestjs/common';
import { KeywordAnalyticsService } from './keyword-analytics.service';
import { SearchKeywordController } from './search-keyword.controller';
import { SearchKeywordService } from './search-keyword.service';

@Module({
  controllers: [SearchKeywordController],
  providers: [SearchKeywordService, KeywordAnalyticsService],
  exports: [SearchKeywordService],
})
export class SearchKeywordModule {}
