/**
 * Nạp các chip "Tìm kiếm phổ biến" vào bảng `popular_search_keywords`.
 *
 * Nội dung lấy từ `prisma/data/popular-search-keywords.json`, sao y danh sách đang nằm
 * cứng trong frontend để giao diện không đổi khi chuyển sang đọc từ DB.
 *
 * Chạy: pnpm tsx scripts/seed-popular-keywords.ts
 *
 * Idempotent theo `(placement, locale, query)`: chạy lại chỉ cập nhật nhãn, thứ tự và
 * nhóm. Chip bị bỏ khỏi file JSON sẽ được tắt (`is_active = false`) thay vì xoá, để
 * không mất lịch sử và để bật lại được.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PopularSearchKeywordPlacement, PrismaClient } from '@prisma/client';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

type SeedRow = {
  locale: string;
  label: string;
  shortLabel?: string;
  query: string;
  priority: number;
  category?: string;
};

const PLACEMENTS = {
  home_hero: PopularSearchKeywordPlacement.HOME_HERO,
  jobs_search: PopularSearchKeywordPlacement.JOBS_SEARCH,
} as const;

function loadSeed() {
  const path = join(__dirname, '..', 'prisma', 'data', 'popular-search-keywords.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, SeedRow[]> & { note?: string };
}

async function main() {
  const data = loadSeed();

  console.log('================================================================');
  console.log('🌱 NẠP CHIP "TÌM KIẾM PHỔ BIẾN"');
  console.log('================================================================\n');

  for (const [key, placement] of Object.entries(PLACEMENTS)) {
    const rows = data[key] ?? [];
    if (rows.length === 0) {
      console.log(`· ${key}: không có dòng nào trong file JSON, bỏ qua`);
      continue;
    }

    for (const row of rows) {
      const payload = {
        label: row.label,
        shortLabel: row.shortLabel ?? null,
        priority: row.priority,
        category: row.category ?? null,
        isActive: true,
      };

      await prisma.popularSearchKeyword.upsert({
        where: {
          placement_locale_query: { placement, locale: row.locale, query: row.query },
        },
        update: payload,
        create: { placement, locale: row.locale, query: row.query, ...payload },
      });
    }

    // Chip đã rút khỏi file thì tắt đi, không xoá.
    const retired = await prisma.popularSearchKeyword.updateMany({
      where: { placement, query: { notIn: rows.map((row) => row.query) }, isActive: true },
      data: { isActive: false },
    });

    const locales = [...new Set(rows.map((row) => row.locale))].sort();
    console.log(`✓ ${key}: ${rows.length} chip (${locales.join(', ')})`);
    if (retired.count > 0) {
      console.log(`    đã tắt ${retired.count} chip không còn trong danh sách`);
    }
  }

  const total = await prisma.popularSearchKeyword.count({ where: { isActive: true } });
  console.log(`\nTổng chip đang bật: ${total}`);
  console.log('\n================================================================\n');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
