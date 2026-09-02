/**
 * Làm sạch rich text của các tin tuyển dụng đã nằm trong cơ sở dữ liệu.
 *
 * `JobPostsService` giờ lọc `description`/`requirements`/`benefits` lúc ghi, nhưng điều đó chỉ
 * bảo vệ nội dung mới. Mọi tin tạo trước thay đổi đó vẫn được lưu nguyên trạng và vẫn được
 * frontend render bằng `dangerouslySetInnerHTML`, nên việc lọc lúc ghi tự nó chưa đóng lỗ hổng.
 *
 * Chạy một lần sau khi deploy:
 *
 *   pnpm tsx scripts/sanitize-existing-job-posts.ts --dry-run   # xem trước, không ghi
 *   pnpm tsx scripts/sanitize-existing-job-posts.ts
 *
 * Chỉ ghi lại những dòng thực sự thay đổi, và cố ý **không** đụng `updatedAt` bằng cách nào khác
 * ngoài hành vi mặc định của Prisma — một lần dọn bảo mật không nên hiện ra như thể recruiter
 * vừa sửa tin.
 */
import { PrismaClient } from '@prisma/client';
import { sanitizeJobPostHtml } from '../src/modules/job-posts/job-post-content.policy';

const prisma = new PrismaClient();
const BATCH_SIZE = 200;

type Row = {
  id: string;
  description: string;
  requirements: string | null;
  benefits: string | null;
};

function clean(value: string | null): string | null {
  if (value === null) return null;
  return sanitizeJobPostHtml(value);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '[dry-run] không ghi gì cả' : '[ghi thật]');

  let cursor: string | undefined;
  let scanned = 0;
  let changed = 0;

  for (;;) {
    const rows: Row[] = await prisma.jobPost.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, description: true, requirements: true, benefits: true },
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    for (const row of rows) {
      const next = {
        description: sanitizeJobPostHtml(row.description),
        requirements: clean(row.requirements),
        benefits: clean(row.benefits),
      };

      const differs =
        next.description !== row.description ||
        next.requirements !== row.requirements ||
        next.benefits !== row.benefits;

      if (!differs) continue;
      changed += 1;

      if (dryRun) {
        console.log(`  sẽ sửa ${row.id}`);
        continue;
      }

      await prisma.jobPost.update({ where: { id: row.id }, data: next });
    }

    console.log(`  đã quét ${scanned}, cần sửa ${changed}`);
  }

  console.log(
    `Xong. Quét ${scanned} tin, ${changed} tin ${dryRun ? 'sẽ được' : 'đã được'} làm sạch.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
