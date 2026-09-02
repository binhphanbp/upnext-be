import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KeywordAnalyticsQueryDto, KeywordTrendQueryDto } from './dto/keyword-analytics-query.dto';

/**
 * Các báo cáo phân tích từ khóa cho admin.
 *
 * Tách khỏi `SearchKeywordService` (lo việc ghi log và chuẩn hóa) vì đây là hướng đọc,
 * chạy truy vấn tổng hợp, và chỉ admin gọi được.
 *
 * Mọi truy vấn đếm người dùng theo `COALESCE(user_id, session_id)`: `COUNT(DISTINCT user_id)`
 * bỏ qua NULL, nên lượt tìm của khách chưa đăng nhập trước đây đếm thành 0 người.
 */
@Injectable()
export class KeywordAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(query: { days: number; from?: string; to?: string }) {
    if (query.from || query.to) {
      if (!query.from || !query.to) {
        throw new BadRequestException('Cần cả from và to khi dùng khoảng tùy chọn.');
      }

      const from = new Date(query.from);
      const to = new Date(query.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new BadRequestException('Ngày không hợp lệ.');
      }
      if (from > to) {
        throw new BadRequestException('from phải trước to.');
      }

      to.setHours(23, 59, 59, 999);
      return { from, to };
    }

    const to = new Date();
    const from = new Date(to.getTime() - query.days * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  /**
   * Từ khóa người dùng tìm mà không ra kết quả nào.
   *
   * Đây là câu hỏi đáng tiền nhất: mỗi dòng là một nhu cầu có thật mà sàn chưa có tin
   * tuyển dụng nào đáp ứng.
   */
  async getZeroResultKeywords(query: KeywordAnalyticsQueryDto) {
    const { from, to } = this.resolveRange(query);

    const items = await this.prisma.$queryRaw<
      Array<{
        canonicalKeyword: string;
        keyword: string;
        searchCount: number;
        uniqueVisitors: number;
        lastSearchedAt: Date;
      }>
    >`
      SELECT
        canonical_keyword AS "canonicalKeyword",
        (ARRAY_AGG(keyword ORDER BY created_at DESC))[1] AS "keyword",
        COUNT(*)::integer AS "searchCount",
        COUNT(DISTINCT COALESCE(user_id, session_id))::integer AS "uniqueVisitors",
        MAX(created_at) AS "lastSearchedAt"
      FROM search_keyword_logs
      WHERE created_at >= ${from}
        AND created_at <= ${to}
        AND result_count = 0
        AND (${query.source}::text IS NULL OR source = ${query.source})
      GROUP BY canonical_keyword
      ORDER BY "searchCount" DESC, "lastSearchedAt" DESC
      LIMIT ${query.limit}
    `;

    return { from, to, items };
  }

  /**
   * Đối chiếu cầu (lượt tìm) với cung (tin tuyển dụng đang mở).
   *
   * Ghép từ khóa với `skills.name` đã chuẩn hóa cùng cách như `canonical_keyword`, nên chỉ
   * bắt được từ khóa trùng tên kỹ năng — đủ cho phần lớn trường hợp (react, python, aws).
   * Từ khóa dạng câu ("senior react remote hcm") sẽ không khớp và hiện 0 tin đang mở;
   * `matchedSkill` cho biết dòng nào ghép được để đọc số cho đúng.
   */
  async getSupplyGap(query: KeywordAnalyticsQueryDto) {
    const { from, to } = this.resolveRange(query);

    const items = await this.prisma.$queryRaw<
      Array<{
        canonicalKeyword: string;
        keyword: string;
        searchCount: number;
        uniqueVisitors: number;
        openJobs: number;
        matchedSkill: string | null;
      }>
    >`
      WITH demand AS (
        SELECT
          canonical_keyword,
          (ARRAY_AGG(keyword ORDER BY created_at DESC))[1] AS keyword,
          COUNT(*)::integer AS search_count,
          COUNT(DISTINCT COALESCE(user_id, session_id))::integer AS unique_visitors
        FROM search_keyword_logs
        WHERE created_at >= ${from}
          AND created_at <= ${to}
          AND (${query.source}::text IS NULL OR source = ${query.source})
        GROUP BY canonical_keyword
      ),
      supply AS (
        SELECT
          -- Cùng phép chuẩn hóa như canonical_keyword: bỏ dấu, hạ chữ thường.
          lower(translate(s.name, 'ĐđÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúý', 'DdAAAAEEEIIOOOOUUYaaaaeeeiioooouuy')) AS skill_key,
          MIN(s.name) AS skill_name,
          COUNT(DISTINCT jp.id)::integer AS open_jobs
        FROM skills s
        JOIN job_post_skills jps ON jps.skill_id = s.id
        JOIN job_posts jp ON jp.id = jps.job_post_id
          AND jp.status = 'published'
          AND jp.is_hidden = false
          AND jp.deleted_at IS NULL
          AND (jp.expired_at IS NULL OR jp.expired_at > NOW())
        GROUP BY 1
      )
      SELECT
        d.canonical_keyword AS "canonicalKeyword",
        d.keyword AS "keyword",
        d.search_count AS "searchCount",
        d.unique_visitors AS "uniqueVisitors",
        COALESCE(sp.open_jobs, 0) AS "openJobs",
        sp.skill_name AS "matchedSkill"
      FROM demand d
      LEFT JOIN supply sp ON sp.skill_key = d.canonical_keyword
      ORDER BY
        (d.search_count::numeric / GREATEST(COALESCE(sp.open_jobs, 0), 1)) DESC,
        d.search_count DESC
      LIMIT ${query.limit}
    `;

    return { from, to, items };
  }

  /**
   * Lượt tìm theo từng ngày, cho cả hệ thống hoặc cho một từ khóa.
   *
   * Sinh đủ dãy ngày bằng `generate_series` rồi LEFT JOIN: thiếu ngày không có lượt tìm
   * thì đồ thị sẽ nối liền hai điểm cách nhau cả tuần và trông như không có khoảng trống.
   */
  async getTrend(query: KeywordTrendQueryDto) {
    const { from, to } = this.resolveRange(query);
    const keyword = query.keyword?.trim() || null;

    const points = await this.prisma.$queryRaw<
      Array<{ day: Date; searchCount: number; uniqueVisitors: number }>
    >`
      WITH days AS (
        SELECT generate_series(${from}::date, ${to}::date, INTERVAL '1 day')::date AS day
      ),
      hits AS (
        SELECT
          created_at::date AS day,
          COUNT(*)::integer AS search_count,
          COUNT(DISTINCT COALESCE(user_id, session_id))::integer AS unique_visitors
        FROM search_keyword_logs
        WHERE created_at >= ${from}
          AND created_at <= ${to}
          AND (${keyword}::text IS NULL OR canonical_keyword = ${keyword})
          AND (${query.source}::text IS NULL OR source = ${query.source})
        GROUP BY 1
      )
      SELECT
        days.day AS "day",
        COALESCE(hits.search_count, 0) AS "searchCount",
        COALESCE(hits.unique_visitors, 0) AS "uniqueVisitors"
      FROM days
      LEFT JOIN hits ON hits.day = days.day
      ORDER BY days.day
    `;

    return { from, to, keyword, points };
  }

  /**
   * Số tổng của khoảng đang xem, kèm mức thay đổi so với khoảng liền trước cùng độ dài.
   *
   * Tổng một khoảng tự nó không nói được gì; phải có mốc so sánh mới biết đang lên hay xuống.
   */
  async getOverview(query: KeywordAnalyticsQueryDto) {
    const { from, to } = this.resolveRange(query);
    const span = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - span);
    const previousTo = from;

    const [current, previous] = await Promise.all([
      this.summarize(from, to, query.source),
      this.summarize(previousFrom, previousTo, query.source),
    ]);

    return {
      from,
      to,
      current,
      previous,
      previousRange: { from: previousFrom, to: previousTo },
    };
  }

  private async summarize(from: Date, to: Date, source?: string) {
    const [row] = await this.prisma.$queryRaw<
      Array<{
        searchCount: number;
        uniqueVisitors: number;
        distinctKeywords: number;
        zeroResultSearches: number;
      }>
    >`
      SELECT
        COUNT(*)::integer AS "searchCount",
        COUNT(DISTINCT COALESCE(user_id, session_id))::integer AS "uniqueVisitors",
        COUNT(DISTINCT canonical_keyword)::integer AS "distinctKeywords",
        COUNT(*) FILTER (WHERE result_count = 0)::integer AS "zeroResultSearches"
      FROM search_keyword_logs
      WHERE created_at >= ${from}
        AND created_at <= ${to}
        AND (${source ?? null}::text IS NULL OR source = ${source ?? null})
    `;

    return row ?? { searchCount: 0, uniqueVisitors: 0, distinctKeywords: 0, zeroResultSearches: 0 };
  }
}
