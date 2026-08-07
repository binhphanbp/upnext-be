import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  AiConversationContext,
  AiMessageRole,
  AiRunStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiCard, AiCitation, AiToolCall } from '../contracts/copilot.contracts';

/**
 * Lưu trữ hội thoại.
 *
 * §13.1 bước 4 và 13: backend lưu tin nhắn người dùng *trước khi* gọi AI, và
 * lưu tin nhắn cuối *sau khi* stream đóng. Thứ tự đó quan trọng: nếu chỉ lưu
 * sau khi xong, một lượt bị lỗi giữa dòng sẽ mất luôn câu hỏi của người dùng và
 * họ phải gõ lại.
 */

const TITLE_MAX = 60;

/**
 * Cả hai trần dưới đây chặn *tạo dữ liệu rác*, không liên quan tới gọi model —
 * `POST /conversations` không tốn một lời gọi Gemini nào, nên không throttle
 * nào ở tầng route bảo vệ được nó khỏi bị spam hàng triệu bản ghi rỗng.
 */
const MAX_CONVERSATIONS_PER_CANDIDATE = 50;
const MAX_MESSAGES_PER_CONVERSATION = 100;

/**
 * Một tin nhắn trợ lý còn ở trạng thái STREAMING quá ngần này bị coi là mồ côi
 * (tiến trình xử lý nó đã chết, ví dụ server restart giữa chừng) chứ không phải
 * đang chạy thật — nếu không, một lần sập server sẽ khoá hội thoại đó vĩnh viễn.
 */
const STALE_STREAM_MS = 2 * 60 * 1000;

export type ConversationSummary = {
  id: string;
  title: string;
  contextType: AiConversationContext;
  updatedAt: Date;
  messageCount: number;
};

@Injectable()
export class AiConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForCandidate(candidateProfileId: string, limit = 30): Promise<ConversationSummary[]> {
    const conversations = await this.prisma.aIConversation.findMany({
      where: { candidateProfileId, isArchived: false },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        contextType: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      contextType: conversation.contextType,
      updatedAt: conversation.updatedAt,
      messageCount: conversation._count.messages,
    }));
  }

  async createForCandidate(
    candidateProfileId: string,
    contextType: AiConversationContext,
    contextId: string | null,
    locale: string,
  ) {
    const conversationCount = await this.prisma.aIConversation.count({
      where: { candidateProfileId, isArchived: false },
    });
    if (conversationCount >= MAX_CONVERSATIONS_PER_CANDIDATE) {
      throw new ConflictException({
        code: 'AI_CONVERSATION_LIMIT_REACHED',
        message: 'Bạn đã đạt số hội thoại tối đa. Hãy ẩn bớt hội thoại cũ trước khi tạo mới.',
      });
    }

    return this.prisma.aIConversation.create({
      data: {
        actorType: ActorType.CANDIDATE,
        candidateProfileId,
        contextType,
        contextId,
        locale,
      },
      select: { id: true, title: true, contextType: true, updatedAt: true },
    });
  }

  /**
   * Nạp hội thoại kèm quyền sở hữu.
   *
   * `candidateProfileId` nằm trong `where`, không phải kiểm sau khi đọc — nghĩa
   * là không có đường nào đọc hội thoại của người khác kể cả khi biết id.
   */
  async getOwnedOrThrow(conversationId: string, candidateProfileId: string) {
    const conversation = await this.prisma.aIConversation.findFirst({
      where: { id: conversationId, candidateProfileId },
      select: { id: true, contextType: true, contextId: true, locale: true, title: true },
    });
    if (!conversation) {
      throw new ForbiddenException('Hội thoại này không thuộc tài khoản của bạn');
    }
    return conversation;
  }

  async messages(conversationId: string, candidateProfileId: string, limit = 50) {
    await this.getOwnedOrThrow(conversationId, candidateProfileId);
    return this.prisma.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        status: true,
        intent: true,
        citationsJson: true,
        cardsJson: true,
        toolCallsJson: true,
        suggestionsJson: true,
        modelName: true,
        promptVersion: true,
        inputTokens: true,
        outputTokens: true,
        latencyMs: true,
        errorCode: true,
        createdAt: true,
        feedback: { select: { rating: true } },
        actionRequest: { select: { id: true, actionType: true, payloadJson: true, status: true } },
      },
    });
  }

  /**
   * Mười tin nhắn gần nhất, dùng làm ngữ cảnh cho lượt tiếp theo (§13.4).
   *
   * Chỉ lấy tin đã hoàn tất — một tin `failed` hoặc rỗng đưa vào ngữ cảnh chỉ
   * làm model bối rối, và một tin `partial` bị cắt giữa câu còn tệ hơn.
   */
  async recentTurns(conversationId: string, take = 10) {
    const messages = await this.prisma.aIMessage.findMany({
      where: {
        conversationId,
        status: AiRunStatus.COMPLETED,
        content: { not: '' },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: { role: true, content: true },
    });
    return messages.reverse();
  }

  /**
   * Có run nào đang thật sự chạy trong hội thoại này không.
   *
   * Nhân tiện dọn rác: bản ghi STREAMING quá hạn bị đánh dấu FAILED ngay trong
   * lần kiểm tra này, nên không cần một cron riêng chỉ để việc đó.
   */
  async hasActiveRun(conversationId: string): Promise<boolean> {
    const staleBefore = new Date(Date.now() - STALE_STREAM_MS);

    const active = await this.prisma.aIMessage.findFirst({
      where: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        status: AiRunStatus.STREAMING,
        createdAt: { gte: staleBefore },
      },
      select: { id: true },
    });
    if (active) return true;

    await this.prisma.aIMessage.updateMany({
      where: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        status: AiRunStatus.STREAMING,
        createdAt: { lt: staleBefore },
      },
      data: { status: AiRunStatus.FAILED, errorCode: 'AI_SERVICE_UNAVAILABLE' },
    });
    return false;
  }

  async appendUserMessage(conversationId: string, content: string) {
    const messageCount = await this.prisma.aIMessage.count({ where: { conversationId } });
    if (messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
      throw new ConflictException({
        code: 'AI_MESSAGE_LIMIT_REACHED',
        message: 'Hội thoại này đã đạt số tin nhắn tối đa. Hãy tạo hội thoại mới để tiếp tục.',
      });
    }

    return this.prisma.aIMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.USER,
        content,
        status: AiRunStatus.COMPLETED,
      },
      select: { id: true },
    });
  }

  /** Tạo sẵn bản ghi tin nhắn trợ lý để có id đưa vào event `done`. */
  async createAssistantPlaceholder(conversationId: string) {
    return this.prisma.aIMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        status: AiRunStatus.STREAMING,
      },
      select: { id: true },
    });
  }

  async finalizeAssistantMessage(input: {
    messageId: string;
    conversationId: string;
    content: string;
    status: AiRunStatus;
    intent: string | null;
    citations: AiCitation[];
    cards: AiCard[];
    toolCalls: AiToolCall[];
    suggestions: string[];
    modelName: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    errorCode: string | null;
  }) {
    const asJson = (value: unknown[]): Prisma.InputJsonValue | undefined =>
      value.length ? (value as unknown as Prisma.InputJsonValue) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.aIMessage.update({
        where: { id: input.messageId },
        data: {
          content: input.content,
          status: input.status,
          intent: input.intent,
          citationsJson: asJson(input.citations),
          cardsJson: asJson(input.cards),
          toolCallsJson: asJson(input.toolCalls),
          suggestionsJson: asJson(input.suggestions),
          modelName: input.modelName,
          promptVersion: input.promptVersion,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          latencyMs: input.latencyMs,
          errorCode: input.errorCode,
        },
      });

      // Đặt tiêu đề từ câu hỏi đầu tiên, một lần duy nhất. Làm trong cùng
      // transaction để danh sách hội thoại không bao giờ hiện tiêu đề rỗng.
      const conversation = await tx.aIConversation.findUnique({
        where: { id: input.conversationId },
        select: { title: true },
      });

      if (conversation && !conversation.title) {
        const firstUserMessage = await tx.aIMessage.findFirst({
          where: { conversationId: input.conversationId, role: AiMessageRole.USER },
          orderBy: { createdAt: 'asc' },
          select: { content: true },
        });
        if (firstUserMessage) {
          await tx.aIConversation.update({
            where: { id: input.conversationId },
            data: { title: deriveTitle(firstUserMessage.content) },
          });
        }
      } else {
        // Vẫn phải chạm vào hội thoại để `updatedAt` đẩy nó lên đầu danh sách.
        await tx.aIConversation.update({
          where: { id: input.conversationId },
          data: { updatedAt: new Date() },
        });
      }
    });
  }

  async archive(conversationId: string, candidateProfileId: string) {
    await this.getOwnedOrThrow(conversationId, candidateProfileId);
    // Xoá mềm: §7.1 kế hoạch subscription và §6.3 nói chung — không xoá dữ liệu
    // người dùng, chỉ ẩn. Hội thoại là nội dung của họ.
    await this.prisma.aIConversation.update({
      where: { id: conversationId },
      data: { isArchived: true },
    });
  }

  /** Feedback tốt/xấu. Bấm lại cùng giá trị là bỏ đánh giá. */
  async setFeedback(
    messageId: string,
    candidateProfileId: string,
    actorId: string,
    rating: 'UP' | 'DOWN',
  ) {
    const message = await this.prisma.aIMessage.findFirst({
      where: {
        id: messageId,
        role: AiMessageRole.ASSISTANT,
        conversation: { candidateProfileId },
      },
      select: { id: true, feedback: { select: { rating: true } } },
    });
    if (!message) throw new NotFoundException('Không tìm thấy tin nhắn');

    if (message.feedback?.rating === rating) {
      await this.prisma.aIMessageFeedback.delete({ where: { messageId } });
      return { rating: null };
    }

    await this.prisma.aIMessageFeedback.upsert({
      where: { messageId },
      create: {
        messageId,
        actorType: ActorType.CANDIDATE,
        actorId,
        rating,
      },
      update: { rating },
    });
    return { rating };
  }
}

function deriveTitle(content: string): string {
  const text = content.trim().replace(/\s+/g, ' ');
  if (text.length <= TITLE_MAX) return text;
  return `${text.slice(0, TITLE_MAX).trimEnd()}…`;
}
