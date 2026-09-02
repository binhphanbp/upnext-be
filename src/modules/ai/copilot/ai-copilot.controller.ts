import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActorType, AiConversationContext } from '@prisma/client';
import { SubscriptionFeature } from '../../subscriptions/feature-registry';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserThrottlerGuard } from '../../../common/guards/user-throttler.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AiStreamEvent } from '../contracts/copilot.contracts';
import { CandidateContextAssembler } from '../context/candidate-context.assembler';
import {
  CreateConversationDto,
  MessageFeedbackDto,
  ResolveActionDto,
  SendMessageDto,
} from '../dto/copilot.dto';
import { AiActionsService } from './ai-actions.service';
import { AiBudgetService } from './ai-budget.service';
import { AiConversationsService } from './ai-conversations.service';
import { AiCopilotService } from './ai-copilot.service';
import { AiRunTrackerService } from './ai-run-tracker.service';
import { CandidateSubscriptionQuotaService } from '../../subscriptions/candidate-subscription-quota.service';
import { CandidateKnowledgeRetrievalService } from '../retrieval/candidate-knowledge-retrieval.service';

/** Một người dùng được mở tối đa bấy nhiêu lượt chat song song. */
const MAX_CONCURRENT_RUNS_PER_USER = 2;

/**
 * Trần cho toàn bộ một lượt chạy, không phải cho từng lời gọi model.
 *
 * `gemini-llm.adapter.ts` giới hạn 15s cho router và 20s cho câu trả lời —
 * nhưng đó là hai lời gọi tách biệt, cộng thêm tối đa 3 truy vấn tool ở giữa
 * (mỗi cái tự giới hạn 5s ở `tool-registry.service.ts`). Cộng dồn, một lượt hợp
 * lệ có thể chạy quá 35s mà không lời timeout riêng lẻ nào bắt được. Đây là
 * trần chốt chặn cuối.
 */
const TOTAL_RUN_TIMEOUT_MS = 45_000;

/**
 * API công khai của Candidate Copilot (§14.1).
 *
 * Streaming dùng `res.write` thủ công thay vì decorator `@Sse()` của Nest vì
 * `@Sse()` chỉ hoạt động với GET, còn gửi tin nhắn phải là POST — câu hỏi của
 * người dùng không thuộc về URL, và nó có thể dài tới 2.000 ký tự.
 */
@ApiTags('Candidate - AI Copilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
@Roles(ActorType.CANDIDATE)
// Trần mặc định cho các route đọc (list/detail) — route ghi/gọi model tự khai
// mức riêng ở dưới vì giá của chúng khác nhau rất nhiều.
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('ai')
export class AiCopilotController {
  private readonly logger = new Logger(AiCopilotController.name);

  constructor(
    private readonly copilot: AiCopilotService,
    private readonly conversations: AiConversationsService,
    private readonly actions: AiActionsService,
    private readonly context: CandidateContextAssembler,
    private readonly budget: AiBudgetService,
    private readonly runTracker: AiRunTrackerService,
    private readonly candidateQuota: CandidateSubscriptionQuotaService,
    private readonly knowledge: CandidateKnowledgeRetrievalService,
  ) {}

  @Get('knowledge/:id')
  @ApiOperation({ summary: 'Mở nguồn hướng dẫn đã được Candidate Copilot trích dẫn' })
  @ApiParam({ name: 'id', description: 'Opaque id from a Candidate Copilot citation' })
  async knowledgeSource(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.knowledge.getPublishedSource(id) };
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Danh sách hội thoại của ứng viên đang đăng nhập' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const candidateProfileId = await this.context.resolveProfileId(user.id);
    const conversations = await this.conversations.listForCandidate(candidateProfileId);
    return { data: conversations };
  }

  @Post('conversations')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tạo hội thoại mới' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversationDto) {
    const candidateProfileId = await this.context.resolveProfileId(user.id);
    const conversation = await this.conversations.createForCandidate(
      candidateProfileId,
      dto.contextType ?? AiConversationContext.GENERAL,
      dto.contextId ?? null,
      dto.locale ?? 'vi',
    );
    return { data: conversation };
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Lịch sử tin nhắn của một hội thoại' })
  @ApiParam({ name: 'id' })
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const candidateProfileId = await this.context.resolveProfileId(user.id);
    const conversation = await this.conversations.getOwnedOrThrow(id, candidateProfileId);
    const messages = await this.conversations.messages(id, candidateProfileId);
    return { data: { ...conversation, messages } };
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Ẩn hội thoại (xoá mềm — không xoá dữ liệu người dùng)' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const candidateProfileId = await this.context.resolveProfileId(user.id);
    await this.conversations.archive(id, candidateProfileId);
  }

  @Post('messages/:id/feedback')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Đánh giá tốt/xấu một câu trả lời. Bấm lại cùng giá trị là bỏ đánh giá',
  })
  @ApiOkResponse({ schema: { properties: { rating: { type: 'string', nullable: true } } } })
  async feedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageFeedbackDto,
  ) {
    const candidateProfileId = await this.context.resolveProfileId(user.id);
    const result = await this.conversations.setFeedback(
      id,
      candidateProfileId,
      user.id,
      dto.rating,
    );
    return { data: result };
  }

  @Post('actions/:id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Xác nhận hoặc từ chối một hành động AI đề xuất. Backend thực hiện, không phải AI',
  })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: ResolveActionDto })
  async resolveAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveActionDto,
  ) {
    const candidateProfileId = await this.context.resolveProfileId(user.id);
    const result = await this.actions.resolve(id, candidateProfileId, dto.decision);
    return { data: result };
  }

  /**
   * Gửi tin nhắn và nhận câu trả lời dạng SSE.
   *
   * Bốn thứ bắt buộc với một endpoint SSE, thiếu cái nào cũng sinh lỗi khó tìm:
   *
   * - `X-Accel-Buffering: no` — Nginx mặc định đệm response, làm stream tới
   *   client thành một cục sau khi xong. Đây là lỗi chỉ xuất hiện khi deploy.
   * - `flushHeaders()` — gửi header ngay, không đợi byte đầu của body.
   * - Heartbeat — proxy đóng kết nối im lặng sau ~30–60 giây. Một comment SSE
   *   (`:`) mỗi 15 giây giữ kết nối mà không gây nhiễu cho client.
   * - Huỷ khi client ngắt — nếu không, model vẫn chạy và vẫn bị tính tiền sau
   *   khi người dùng đã đóng tab.
   */
  @Post('conversations/:id/messages')
  // Route đắt nhất của cả API: mỗi request gọi 2 lần Gemini (router + tổng
  // hợp). Trần bằng đúng mức `job-post-ai` đã dùng cho tính năng AI còn lại —
  // 2-4 câu hỏi/phút là hành vi người dùng thật, 10/phút chỉ cắt vòng lặp.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Gửi tin nhắn, nhận câu trả lời streaming (SSE)' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: SendMessageDto })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const candidateProfileId = await this.context.resolveProfileId(user.id);
    const conversation = await this.conversations.getOwnedOrThrow(id, candidateProfileId);

    /**
     * Bốn lớp chặn dưới đây đều chạy **trước** `writeHead` một cách cố ý: chỉ
     * lúc này lỗi còn trả được bằng mã HTTP bình thường (409) qua exception
     * filter của Nest. Sau khi header SSE đã gửi, mọi từ chối chỉ còn cách phát
     * event `error` trong một stream 200 — đúng nhưng dễ bị client hiểu nhầm là
     * "đã bắt đầu trả lời rồi mới hỏng".
     */
    if (await this.conversations.hasActiveRun(id)) {
      throw new ConflictException({
        code: 'AI_RUN_IN_PROGRESS',
        message: 'Hội thoại này đang có một lượt trả lời chưa xong.',
      });
    }

    await this.budget.assertWithinDailyBudget(candidateProfileId);
    await this.budget.assertBelowBlockedToolThreshold(candidateProfileId);

    if (!this.runTracker.tryAcquire(user.id, MAX_CONCURRENT_RUNS_PER_USER)) {
      throw new ConflictException({
        code: 'AI_TOO_MANY_CONCURRENT_RUNS',
        message: 'Bạn đang có quá nhiều lượt chat mở cùng lúc. Đóng bớt rồi thử lại.',
      });
    }

    try {
      await this.sendMessageStream(
        user,
        id,
        dto,
        candidateProfileId,
        conversation,
        request,
        response,
      );
    } finally {
      this.runTracker.release(user.id);
    }
  }

  private async sendMessageStream(
    user: AuthenticatedUser,
    id: string,
    dto: SendMessageDto,
    candidateProfileId: string,
    conversation: { contextType: AiConversationContext; contextId: string | null; locale: string },
    request: Request,
    response: Response,
  ): Promise<void> {
    // Reserve trước khi ghi prompt và trước khi mở SSE. Khi hết lượt, client
    // nhận 409 bình thường (không phải một stream 200 rồi thất bại) và lịch sử
    // không có câu hỏi dang dở. Không giữ DB transaction trong lúc gọi model:
    // phần quota tự ghi counter + ledger atomically, sau đó được hoàn đúng một
    // lần nếu run không kết thúc bằng event `done`.
    const quotaReservation = await this.candidateQuota.reserve({
      candidateProfileId,
      feature: SubscriptionFeature.AI_COPILOT_RUN,
      referenceType: 'ai_copilot_run',
      referenceId: randomUUID(),
      idempotencyKey: `ai-copilot:${randomUUID()}`,
    });
    let completed = false;

    try {
      // Chỉ ghi tin nhắn của người dùng sau khi chắc chắn lượt này thực sự
      // được phép chạy. Nếu ghi DB hoặc provider lỗi, finally hoàn lượt.
      await this.conversations.appendUserMessage(id, dto.prompt);

      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.flushHeaders();

      const abort = new AbortController();
      const onClose = () => abort.abort(new Error('client_disconnected'));
      request.on('close', onClose);
      const totalTimeout = setTimeout(
        () => abort.abort(new Error('total_run_timeout')),
        TOTAL_RUN_TIMEOUT_MS,
      );

      const heartbeat = setInterval(() => {
        if (!response.writableEnded) response.write(': ping\n\n');
      }, 15_000);

      const write = (event: AiStreamEvent) => {
        if (response.writableEnded) return;
        response.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
      };

      try {
        for await (const event of this.copilot.run({
          conversationId: id,
          candidateProfileId,
          candidateAccountId: user.id,
          prompt: dto.prompt,
          contextType: dto.contextType ?? conversation.contextType,
          contextId: dto.contextId ?? conversation.contextId,
          locale: conversation.locale,
          signal: abort.signal,
        })) {
          if (event.event === 'done') completed = true;
          write(event);
        }
      } catch (error) {
        // `run()` đã tự bọc lỗi thành event; tới đây là lỗi ngoài dự kiến của
        // chính generator. Vẫn phải gửi một event error, nếu không client treo ở
        // trạng thái streaming vĩnh viễn.
        this.logger.error(
          `Stream Copilot đứt bất thường: ${error instanceof Error ? error.message : 'unknown'}`,
        );
        write({
          event: 'error',
          data: {
            code: 'AI_SERVICE_UNAVAILABLE',
            detail: 'Kết nối tới dịch vụ AI bị ngắt.',
            status: 'model_unavailable',
          },
        });
      } finally {
        clearInterval(heartbeat);
        clearTimeout(totalTimeout);
        request.off('close', onClose);
        if (!response.writableEnded) response.end();
      }
    } finally {
      if (!completed && !quotaReservation.replayed) {
        try {
          await this.candidateQuota.reverseUsage(quotaReservation.usage.id, 'copilot_run_failed');
        } catch (error) {
          // Không che lỗi stream đã gửi cho ứng viên. Usage ledger có unique
          // reversal nên có thể kiểm tra/hoàn lại an toàn bằng job vận hành nếu
          // database tạm thời không phản hồi.
          this.logger.error(
            `Không thể hoàn lượt Copilot ${quotaReservation.usage.id}: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
        }
      }
    }
  }
}
