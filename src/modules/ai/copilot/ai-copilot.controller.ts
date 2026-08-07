import {
  Body,
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
import { ActorType, AiConversationContext } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
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
import { AiConversationsService } from './ai-conversations.service';
import { AiCopilotService } from './ai-copilot.service';

/**
 * API công khai của Candidate Copilot (§14.1).
 *
 * Streaming dùng `res.write` thủ công thay vì decorator `@Sse()` của Nest vì
 * `@Sse()` chỉ hoạt động với GET, còn gửi tin nhắn phải là POST — câu hỏi của
 * người dùng không thuộc về URL, và nó có thể dài tới 2.000 ký tự.
 */
@ApiTags('Candidate - AI Copilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.CANDIDATE)
@Controller('ai')
export class AiCopilotController {
  private readonly logger = new Logger(AiCopilotController.name);

  constructor(
    private readonly copilot: AiCopilotService,
    private readonly conversations: AiConversationsService,
    private readonly actions: AiActionsService,
    private readonly context: CandidateContextAssembler,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Danh sách hội thoại của ứng viên đang đăng nhập' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const candidateProfileId = await this.context.resolveProfileId(user.id);
    const conversations = await this.conversations.listForCandidate(candidateProfileId);
    return { data: conversations };
  }

  @Post('conversations')
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
        signal: abort.signal,
      })) {
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
      request.off('close', onClose);
      if (!response.writableEnded) response.end();
    }
  }
}
