import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PopularSearchKeywordPlacement } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LogSearchKeywordDto } from './dto/log-search-keyword.dto';
import { GetPopularKeywordsDto } from './dto/get-popular-keywords.dto';
import { GetTopSearchKeywordsDto, SearchRange } from './dto/get-top-search-keywords.dto';

@Injectable()
export class SearchKeywordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  normalizeSearchKeyword(keyword: string): string {
    if (!keyword) return '';
    return keyword
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacritics
      .replace(/đ/g, 'd') // replace Vietnamese specific character đ
      .replace(/Đ/g, 'd')
      .replace(/[^a-z0-9\s+#.]/g, ' ') // keep +, #, . and alphanumeric/spaces
      .replace(/\s+/g, ' ') // replace multiple spaces with single space
      .trim();
  }

  canonicalizeSearchKeyword(normalizedKeyword: string): string {
    if (!normalizedKeyword) return '';

    const KEYWORD_SYNONYM_MAP: Record<string, string> = {
      react: 'reactjs',
      reactjs: 'reactjs',
      'react js': 'reactjs',
      'react.js': 'reactjs',
      next: 'nextjs',
      nextjs: 'nextjs',
      'next js': 'nextjs',
      'next.js': 'nextjs',
      node: 'nodejs',
      nodejs: 'nodejs',
      'node js': 'nodejs',
      'node.js': 'nodejs',
      js: 'javascript',
      javascript: 'javascript',
      ts: 'typescript',
      typescript: 'typescript',
    };

    // 1. Check exact normalizedKeyword first
    const exactMatch = KEYWORD_SYNONYM_MAP[normalizedKeyword];
    if (exactMatch) {
      return exactMatch;
    }

    // 2. Check compact keyword by removing spaces and dots
    const compactKeyword = normalizedKeyword.replace(/[\s.]/g, '');
    const compactMatch = KEYWORD_SYNONYM_MAP[compactKeyword];
    if (compactMatch) {
      return compactMatch;
    }

    // 3. Return normalizedKeyword if no match
    return normalizedKeyword;
  }

  async logSearchKeyword(dto: LogSearchKeywordDto, authHeader?: string, ipAddress?: string) {
    const keyword = dto.keyword.trim();
    const normalizedKeyword = this.normalizeSearchKeyword(keyword);
    const canonicalKeyword = this.canonicalizeSearchKeyword(normalizedKeyword);

    // Skip if empty or too short (length < 2)
    if (canonicalKeyword.length < 2) {
      return;
    }

    // Optional: Parse user ID from JWT token
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const payload = await this.jwtService.verifyAsync(token);
        userId = payload.sub || null;
      } catch {
        // Ignore invalid token for logging purpose
      }
    }

    // Save search keyword log
    await this.prisma.searchKeywordLog.create({
      data: {
        keyword,
        normalizedKeyword,
        canonicalKeyword,
        userId,
        sessionId: dto.sessionId || null,
        ipAddress: ipAddress || null,
        source: dto.source || null,
        resultCount: dto.resultCount !== undefined ? dto.resultCount : null,
      },
    });
  }

  /**
   * Danh sách chip "Tìm kiếm phổ biến" cho trang chủ / trang việc làm.
   *
   * Đây là danh sách biên tập, không phải số đo — nên nó đọc `popular_search_keywords`
   * chứ không đọc `search_keyword_logs`. Nếu lấy từ log thì chip sẽ phản chiếu chính
   * những chip mình đã hiện, vì người dùng bấm vào chúng.
   */
  async getPopularKeywords(query: GetPopularKeywordsDto) {
    const placement = query.placement ?? PopularSearchKeywordPlacement.HOME_HERO;
    const locale = query.locale ?? 'vi';

    const items = await this.prisma.popularSearchKeyword.findMany({
      where: { placement, locale, isActive: true },
      orderBy: [{ priority: 'asc' }, { label: 'asc' }],
      take: query.limit,
      select: { label: true, shortLabel: true, query: true, priority: true, category: true },
    });

    return { placement, locale, items };
  }

  async getTopSearchKeywords(query: GetTopSearchKeywordsDto) {
    const { range = SearchRange.WEEK, from, to, limit = 10, source } = query;

    let fromDate: Date;
    let toDate: Date;

    if (from || to) {
      if (from && to) {
        fromDate = new Date(from);
        toDate = new Date(to);
        // Set to end of day for toDate
        toDate.setHours(23, 59, 59, 999);
      } else {
        throw new BadRequestException('Both from and to dates are required for custom range');
      }
    } else {
      const now = new Date();
      toDate = new Date();

      switch (range) {
        case SearchRange.TODAY:
          fromDate = new Date();
          fromDate.setHours(0, 0, 0, 0);
          break;
        case SearchRange.MONTH:
          fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case SearchRange.YEAR:
          fromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case SearchRange.WEEK:
        default:
          fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date format for custom range');
    }

    // Run aggregate query raw using safe PostgreSQL count/min/max
    // Prioritize displaying the latest raw keyword (keyword) and latest normalized_keyword (normalizedKeyword) inside the canonical group
    const items = source
      ? await this.prisma.$queryRaw<any[]>`
          SELECT
            canonical_keyword AS "canonicalKeyword",
            (ARRAY_AGG(keyword ORDER BY created_at DESC))[1] AS "keyword",
            (ARRAY_AGG(normalized_keyword ORDER BY created_at DESC))[1] AS "normalizedKeyword",
            COUNT(*)::integer AS "searchCount",
            COUNT(DISTINCT user_id)::integer AS "uniqueUsers",
            MAX(created_at) AS "lastSearchedAt"
          FROM search_keyword_logs
          WHERE created_at >= ${fromDate}
            AND created_at <= ${toDate}
            AND source = ${source}
          GROUP BY canonical_keyword
          ORDER BY "searchCount" DESC
          LIMIT ${limit}
        `
      : await this.prisma.$queryRaw<any[]>`
          SELECT
            canonical_keyword AS "canonicalKeyword",
            (ARRAY_AGG(keyword ORDER BY created_at DESC))[1] AS "keyword",
            (ARRAY_AGG(normalized_keyword ORDER BY created_at DESC))[1] AS "normalizedKeyword",
            COUNT(*)::integer AS "searchCount",
            COUNT(DISTINCT user_id)::integer AS "uniqueUsers",
            MAX(created_at) AS "lastSearchedAt"
          FROM search_keyword_logs
          WHERE created_at >= ${fromDate}
            AND created_at <= ${toDate}
          GROUP BY canonical_keyword
          ORDER BY "searchCount" DESC
          LIMIT ${limit}
        `;

    return {
      range: from || to ? 'custom' : range,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      items: items.map((item) => ({
        keyword: item.keyword,
        normalizedKeyword: item.normalizedKeyword,
        canonicalKeyword: item.canonicalKeyword,
        searchCount: Number(item.searchCount),
        uniqueUsers: Number(item.uniqueUsers),
        lastSearchedAt: item.lastSearchedAt,
      })),
    };
  }
}
