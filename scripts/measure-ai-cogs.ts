/**
 * Đo COGS thật cho D3b/D3c (KE-HOACH-SUBSCRIPTION-THUC-THI.md mục 20/21):
 * chạy N lượt gọi model thật cho từng feature key, rồi đọc lại `ai_usage_logs`
 * để ra số VND/lượt trung bình -- thay `PRICE_TBD` bằng số đo được, không phải
 * số phỏng đoán.
 *
 * ## Bắt buộc trước khi chạy
 *
 * - `.env` phải có `GEMINI_API_KEY` THẬT (không phải key sandbox/rỗng) -- nếu
 *   không, mọi request sẽ lỗi và `ai_usage_logs` không có gì để đo.
 * - PHẢI chạy bằng `ts-node`, KHÔNG được chạy bằng `tsx`. Mọi service trong
 *   app này inject qua kiểu (`constructor(x: SomeService)`, không
 *   `@Inject()`), nên NestJS DI cần Reflect metadata (`emitDecoratorMetadata`)
 *   mà TypeScript thật mới sinh ra được -- `tsx` dùng esbuild, không sinh
 *   metadata này, nên `NestFactory.createApplicationContext()` sẽ báo lỗi
 *   "Nest can't resolve dependencies..." trên hầu như MỌI service (đã tự đi
 *   vào vết này khi viết script, mất một lúc mới lần ra nguyên nhân thật --
 *   ghi lại đây để không ai lặp lại). Dùng `pnpm measure-ai-cogs -- <args>`
 *   (script đã cấu hình `ts-node` trong `package.json`) hoặc gọi trực tiếp
 *   `pnpm ts-node -P tsconfig.json scripts/measure-ai-cogs.ts -- <args>`.
 * - Chạy trên database KHÔNG PHẢI production. Script gọi thẳng service layer,
 *   KHÔNG qua HTTP/auth, và với riêng AI Copilot còn KHÔNG qua bước reserve
 *   quota candidate -- mục đích duy nhất là đo COGS, không phải kiểm quota.
 *   Chạy trên database dùng chung là chạy AI thật, tốn tiền thật, mà không
 *   qua đường kiểm soát bình thường.
 * - JD generate và CV matching VẪN tiêu quota thật qua
 *   `SubscriptionQuotaService.consume()` (không bypass được -- nó nằm trong
 *   chính service, không phải một lớp ngoài) -- công ty dùng để đo cần còn đủ
 *   hạn mức `ai_jd_generate`/`ai_cv_matching` cho N lượt. `RECRUITER_PRO`
 *   (is_public=false, mục 19) là lựa chọn hợp lý vì hạn mức đủ cao và không
 *   ai nhìn thấy nó trên trang giá.
 *
 * ## Chạy
 *
 * ```bash
 * # JD generate + extract, N=20, dùng công ty của recruiter cho sẵn
 * pnpm measure-ai-cogs -- --feature=jd_generate --n=20 --recruiter-id=<uuid>
 *
 * # CV matching -- N applications của một job post đã có ứng viên
 * pnpm measure-ai-cogs -- --feature=cv_matching --n=20 --recruiter-id=<uuid> --job-post-id=<uuid>
 *
 * # AI Copilot -- N lượt hỏi của một candidate có sẵn
 * pnpm measure-ai-cogs -- --feature=copilot --n=20 --candidate-account-id=<uuid>
 *
 * # Chỉ in báo cáo từ log đã có, không chạy request mới
 * pnpm measure-ai-cogs -- --feature=report
 * ```
 *
 * Mỗi lần chạy (trừ `report`) in ra báo cáo `ai_usage_logs` tính từ lúc script
 * bắt đầu -- chạy nhiều feature liên tiếp thì gọi lại script với `--since=<ISO
 * timestamp>` của lần chạy trước để cộng gộp, hoặc dùng `--feature=report` để
 * xem toàn bộ log chưa lọc theo thời gian.
 *
 * ## Đã kiểm thật (không chỉ đọc code)
 *
 * `jd_generate` (N=1, recruiter thật trên RECRUITER_PRO) và `copilot` (N=1,
 * candidate thật) đã chạy thật với Gemini API key thật trên máy phát triển,
 * xác nhận `ai_usage_logs` ghi đúng token/cost/succeeded -- kể cả nhánh thất
 * bại (`copilot` lần chạy thử rơi vào `AI_CONTEXT_NOT_FOUND` vì candidate thử
 * nghiệm thiếu dữ liệu hồ sơ; script đúng đắn ghi `succeeded=false`, không
 * tính `costEstimate`). `cv_matching` chỉ kiểm được bằng `tsc`/`eslint` --
 * không có job post nào sẵn có application để chạy thật trên máy này.
 */
import { NestFactory } from '@nestjs/core';
import { AiConversationContext } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JobPostAiService } from '../src/modules/job-post-ai/job-post-ai.service';
import { JobPostOutputLanguage, JobPostPresentationStyle } from '../src/modules/job-post-ai/dto/generate-job-post-draft.dto';
import { CvScreeningService } from '../src/modules/cv-screening/cv-screening.service';
import { AiCopilotService } from '../src/modules/ai/copilot/ai-copilot.service';
import { AiConversationsService } from '../src/modules/ai/copilot/ai-conversations.service';

type Args = {
  feature: 'jd_generate' | 'cv_matching' | 'copilot' | 'report';
  n: number;
  recruiterId?: string;
  jobPostId?: string;
  candidateAccountId?: string;
  since?: string;
};

const SAMPLE_JD_TITLES = [
  'Senior Backend Engineer (Node.js)',
  'Frontend Developer (React/TypeScript)',
  'DevOps Engineer',
  'Data Analyst',
  'Product Manager (Fintech)',
  'QA Automation Engineer',
  'Mobile Developer (React Native)',
  'UI/UX Designer',
];

const SAMPLE_COPILOT_PROMPTS = [
  'CV của tôi còn thiếu gì để ứng tuyển vị trí Backend Developer?',
  'Gợi ý cho tôi vài công việc phù hợp với kỹ năng React và TypeScript.',
  'Tôi nên chuẩn bị gì cho buổi phỏng vấn vị trí DevOps Engineer?',
  'So sánh giúp tôi hai tin tuyển dụng tôi đã lưu.',
  'Mức lương trung bình cho vị trí Data Analyst ở Hà Nội là bao nhiêu?',
];

function parseArgs(): Args {
  const raw = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? 'true'];
    }),
  );
  const feature = raw.get('feature');
  if (feature !== 'jd_generate' && feature !== 'cv_matching' && feature !== 'copilot' && feature !== 'report') {
    throw new Error(
      "--feature phải là jd_generate | cv_matching | copilot | report, ví dụ: --feature=jd_generate",
    );
  }
  return {
    feature,
    n: Number(raw.get('n') ?? 10),
    recruiterId: raw.get('recruiter-id'),
    jobPostId: raw.get('job-post-id'),
    candidateAccountId: raw.get('candidate-account-id'),
    since: raw.get('since'),
  };
}

async function runJdGenerate(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>, recruiterId: string, n: number) {
  const service = app.get(JobPostAiService);
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < n; i += 1) {
    const title = SAMPLE_JD_TITLES[i % SAMPLE_JD_TITLES.length];
    try {
      await service.generate(recruiterId, {
        title: `${title} #${i + 1}`,
        outputLanguage: JobPostOutputLanguage.VI,
        presentationStyle: JobPostPresentationStyle.TRADITIONAL,
      });
      ok += 1;
      process.stdout.write(`  [jd_generate] ${i + 1}/${n} OK\n`);
    } catch (error) {
      failed += 1;
      process.stdout.write(
        `  [jd_generate] ${i + 1}/${n} LỖI: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  process.stdout.write(`jd_generate: ${ok} thành công, ${failed} lỗi.\n`);
}

async function runCvMatching(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  recruiterId: string,
  jobPostId: string,
  n: number,
) {
  const service = app.get(CvScreeningService);
  const { runId } = await service.startRun(recruiterId, { jobPostId, limit: n });
  process.stdout.write(`  [cv_matching] Đã tạo run ${runId}, đang chờ xử lý xong...\n`);

  // xử lý chạy qua setImmediate() trong CHÍNH process này (không phải job
  // queue riêng) -- nếu vòng lặp này bỏ cuộc và process thoát (process.exit ở
  // main()), phần đang chấm điểm CHẾT GIỮA ĐƯỜNG, kẹt ở status=processing mãi
  // (đã tự đi vào vết này khi viết script: run kẹt ở 8/100 sau khi polling hết
  // giờ). concurrency=1 có chủ đích (né rate limit Gemini) nên tốc độ thật
  // ~60-90s/CV -- N=100 cần khoảng 2 giờ. Timeout ở đây phải đủ dài để process
  // luôn sống tới khi xử lý xong, không phải một giới hạn an toàn ngắn.
  const POLL_INTERVAL_MS = 15_000;
  const MAX_ATTEMPTS = 720; // 720 * 15s = 3 giờ, đủ margin cho N=100 ở concurrency=1
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const run = await service.getRun(recruiterId, runId);
    if (attempt % 4 === 0) {
      process.stdout.write(
        `  [cv_matching] ${run.status} -- đã xử lý ${run.processedCount}/${run.totalApplications}, lỗi ${run.failedCount}\n`,
      );
    }
    if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'PARTIAL_FAILED') {
      process.stdout.write(
        `  [cv_matching] Xong: ${run.status} -- ${run.processedCount}/${run.totalApplications}, lỗi ${run.failedCount}\n`,
      );
      return;
    }
  }
  process.stdout.write(
    `  [cv_matching] Quá ${MAX_ATTEMPTS * POLL_INTERVAL_MS / 3_600_000} giờ chờ -- kiểm tra run ${runId} bằng tay ` +
      `(CHÚ Ý: nếu process này thoát trong khi run chưa xong, phần đang xử lý sẽ kẹt ở status=processing).\n`,
  );
}

async function runCopilot(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  candidateAccountId: string,
  n: number,
) {
  const prisma = app.get(PrismaService);
  const profile = await prisma.candidateProfile.findUnique({
    where: { candidateAccountId },
    select: { id: true },
  });
  if (!profile) {
    throw new Error(`Không tìm thấy CandidateProfile cho candidateAccountId=${candidateAccountId}`);
  }

  const conversations = app.get(AiConversationsService);
  const copilot = app.get(AiCopilotService);

  // Mỗi lượt ghi 2 tin nhắn (user + assistant); MAX_MESSAGES_PER_CONVERSATION=100
  // (ai-conversations.service.ts) nên một hội thoại chỉ chịu được ~50 lượt trước
  // khi appendUserMessage() ném lỗi -- không phải lỗi Gemini, lỗi ở chính script
  // này khi n lớn dùng chung một conversation. Xoay vòng conversation mới mỗi 40
  // lượt (80 tin nhắn, còn dư margin) để n=100+ vẫn chạy hết.
  const ITERATIONS_PER_CONVERSATION = 40;
  let conversation = await conversations.createForCandidate(
    profile.id,
    AiConversationContext.GENERAL,
    null,
    'vi',
  );
  process.stdout.write(`  [copilot] Đã tạo conversation ${conversation.id}\n`);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < n; i += 1) {
    if (i > 0 && i % ITERATIONS_PER_CONVERSATION === 0) {
      conversation = await conversations.createForCandidate(
        profile.id,
        AiConversationContext.GENERAL,
        null,
        'vi',
      );
      process.stdout.write(`  [copilot] Đã tạo conversation mới ${conversation.id}\n`);
    }
    const prompt = SAMPLE_COPILOT_PROMPTS[i % SAMPLE_COPILOT_PROMPTS.length];
    try {
      await conversations.appendUserMessage(conversation.id, prompt);
      const events: unknown[] = [];
      for await (const event of copilot.run({
        conversationId: conversation.id,
        candidateProfileId: profile.id,
        candidateAccountId,
        prompt,
        contextType: AiConversationContext.GENERAL,
        contextId: null,
        locale: 'vi',
        signal: new AbortController().signal,
      })) {
        events.push(event);
      }
      ok += 1;
      process.stdout.write(`  [copilot] ${i + 1}/${n} OK (${events.length} event)\n`);
    } catch (error) {
      failed += 1;
      process.stdout.write(
        `  [copilot] ${i + 1}/${n} LỖI: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }
  process.stdout.write(`copilot: ${ok} thành công, ${failed} lỗi.\n`);
}

async function printReport(prisma: PrismaService, since?: Date) {
  const rows = await prisma.aiUsageLog.groupBy({
    by: ['feature', 'succeeded'],
    where: since ? { createdAt: { gte: since } } : undefined,
    _count: { _all: true },
    _avg: { inputTokens: true, outputTokens: true, costEstimate: true },
    _sum: { costEstimate: true },
  });

  if (rows.length === 0) {
    process.stdout.write('Không có dòng ai_usage_logs nào khớp điều kiện.\n');
    return;
  }

  process.stdout.write('\n=== Báo cáo COGS (ai_usage_logs) ===\n');
  process.stdout.write(since ? `Từ: ${since.toISOString()}\n\n` : '(toàn bộ, không lọc thời gian)\n\n');
  for (const row of rows) {
    const avgCost = row._avg.costEstimate ? Number(row._avg.costEstimate) : null;
    const totalCost = row._sum.costEstimate ? Number(row._sum.costEstimate) : null;
    process.stdout.write(
      `${row.feature.padEnd(18)} succeeded=${String(row.succeeded).padEnd(5)} n=${String(row._count._all).padEnd(5)} ` +
        `avg_input=${Math.round(row._avg.inputTokens ?? 0).toString().padEnd(7)} ` +
        `avg_output=${Math.round(row._avg.outputTokens ?? 0).toString().padEnd(7)} ` +
        `avg_cost_vnd=${avgCost !== null ? avgCost.toFixed(2) : 'N/A'.padEnd(10)} ` +
        `total_cost_vnd=${totalCost !== null ? totalCost.toFixed(2) : 'N/A'}\n`,
    );
  }
  process.stdout.write(
    '\nGhi vào KE-HOACH-SUBSCRIPTION-THUC-THI.md mục 21 (D3b/D3c): avg_cost_vnd của dòng succeeded=true ' +
      'chính là số COGS/lượt thật, dùng để chốt PRICE_TBD -- nhân với hạn mức dự kiến của Pro để kiểm ' +
      '"SUM(limit × COGS) ≤ 60% doanh thu" (mục 12 bản thiết kế).\n',
  );
}

async function main() {
  const args = parseArgs();
  const startedAt = new Date();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    if (args.feature === 'jd_generate') {
      if (!args.recruiterId) throw new Error('--recruiter-id là bắt buộc cho --feature=jd_generate');
      await runJdGenerate(app, args.recruiterId, args.n);
    } else if (args.feature === 'cv_matching') {
      if (!args.recruiterId || !args.jobPostId) {
        throw new Error('--recruiter-id và --job-post-id là bắt buộc cho --feature=cv_matching');
      }
      await runCvMatching(app, args.recruiterId, args.jobPostId, args.n);
    } else if (args.feature === 'copilot') {
      if (!args.candidateAccountId) throw new Error('--candidate-account-id là bắt buộc cho --feature=copilot');
      await runCopilot(app, args.candidateAccountId, args.n);
    }

    const prisma = app.get(PrismaService);
    const since = args.feature === 'report' ? (args.since ? new Date(args.since) : undefined) : startedAt;
    await printReport(prisma, since);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
