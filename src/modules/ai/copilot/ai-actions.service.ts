import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActorType, AiActionStatus, AiActionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiActionRequestPayload } from '../contracts/copilot.contracts';

/**
 * Human-in-the-loop: AI đề xuất, người dùng xác nhận, **backend** thực hiện.
 *
 * §1.3: *"Mọi hành động ghi dữ liệu phải được người dùng xác nhận."* §4.1 đặt
 * việc ghi ở backend, không ở service AI. Cả hai quy tắc gặp nhau ở đây, và
 * cách hiện thực có ba tính chất đáng nói:
 *
 * 1. **Payload là snapshot.** Nếu dữ liệu nguồn đổi giữa lúc đề xuất và lúc xác
 *    nhận, hành động vẫn ghi đúng thứ người dùng đã đọc và đồng ý — không phải
 *    thứ mới hơn mà họ chưa thấy.
 * 2. **Executor là hàm thuần theo actionType**, không nhận gì từ model. Model
 *    quyết định *đề xuất gì*, không quyết định *ghi thế nào*.
 * 3. **Hết hạn có thời gian thật.** Một đề xuất treo ba ngày rồi được bấm là
 *    một hành động người dùng không còn nhớ ngữ cảnh.
 */

const ACTION_TTL_MS = 30 * 60 * 1_000;

type SaveJobPayload = { jobPostId: string; jobTitle: string; companyName: string; slug: string };

@Injectable()
export class AiActionsService {
  private readonly logger = new Logger(AiActionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Tạo đề xuất. Chưa ghi gì vào dữ liệu nghiệp vụ. */
  async propose(input: {
    conversationId: string;
    messageId: string;
    candidateProfileId: string;
    actionType: AiActionType;
    payload: Record<string, unknown>;
    display: Omit<AiActionRequestPayload, 'id' | 'status'>;
  }): Promise<AiActionRequestPayload> {
    const created = await this.prisma.aIActionRequest.create({
      data: {
        conversationId: input.conversationId,
        messageId: input.messageId,
        actorType: ActorType.CANDIDATE,
        actorId: input.candidateProfileId,
        actionType: input.actionType,
        // Gộp cả phần dữ liệu để thực thi và phần hiển thị: người dùng thấy gì
        // thì hệ thống ghi đúng cái đó, hai thứ không thể lệch nhau.
        payloadJson: {
          execute: input.payload,
          display: input.display,
        } as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + ACTION_TTL_MS),
      },
      select: { id: true, status: true },
    });

    return { ...input.display, id: created.id, status: 'PENDING' };
  }

  /**
   * Xử lý quyết định của người dùng.
   *
   * Kiểm quyền bằng cách đưa `actorId` vào `where` — không có đường nào xác nhận
   * hành động của người khác kể cả khi biết id.
   */
  async resolve(
    actionId: string,
    candidateProfileId: string,
    decision: 'CONFIRMED' | 'REJECTED',
  ): Promise<{ id: string; status: AiActionStatus }> {
    const action = await this.prisma.aIActionRequest.findFirst({
      where: { id: actionId, actorId: candidateProfileId },
      select: {
        id: true,
        status: true,
        actionType: true,
        payloadJson: true,
        expiresAt: true,
      },
    });

    if (!action) throw new NotFoundException('Không tìm thấy đề xuất này');

    if (action.status !== AiActionStatus.PENDING) {
      // Bấm hai lần không được thực hiện hai lần. Trả trạng thái hiện tại thay
      // vì báo lỗi — với người dùng, việc đã xong rồi là kết quả đúng.
      return { id: action.id, status: action.status };
    }

    if (action.expiresAt.getTime() < Date.now()) {
      await this.prisma.aIActionRequest.update({
        where: { id: action.id },
        data: { status: AiActionStatus.EXPIRED },
      });
      throw new BadRequestException(
        'Đề xuất đã hết hiệu lực. Bạn hỏi lại để nhận đề xuất mới nhé.',
      );
    }

    if (decision === 'REJECTED') {
      await this.prisma.aIActionRequest.update({
        where: { id: action.id },
        data: { status: AiActionStatus.REJECTED, confirmedAt: new Date() },
      });
      return { id: action.id, status: AiActionStatus.REJECTED };
    }

    await this.prisma.aIActionRequest.update({
      where: { id: action.id },
      data: { status: AiActionStatus.CONFIRMED, confirmedAt: new Date() },
    });

    try {
      const payload = action.payloadJson as { execute: Record<string, unknown> };
      await this.execute(action.actionType, candidateProfileId, payload.execute);

      await this.prisma.aIActionRequest.update({
        where: { id: action.id },
        data: { status: AiActionStatus.EXECUTED, executedAt: new Date() },
      });
      return { id: action.id, status: AiActionStatus.EXECUTED };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Lỗi không xác định';
      this.logger.error(`Thực hiện hành động ${action.id} thất bại: ${reason}`);
      await this.prisma.aIActionRequest.update({
        where: { id: action.id },
        data: { status: AiActionStatus.FAILED, failureReason: reason.slice(0, 500) },
      });
      return { id: action.id, status: AiActionStatus.FAILED };
    }
  }

  /**
   * Bộ thực thi. Mỗi nhánh là một thao tác ghi cụ thể, hẹp, không nhận gì từ
   * model ngoài id đã được kiểm ở lúc đề xuất.
   */
  private async execute(
    actionType: AiActionType,
    candidateProfileId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    switch (actionType) {
      case AiActionType.SAVE_JOB: {
        const { jobPostId } = payload as unknown as SaveJobPayload;
        if (!jobPostId) throw new Error('Thiếu jobPostId');

        // Kiểm lại tin vẫn còn mở tại thời điểm ghi, không tin snapshot: tin có
        // thể đã bị đóng hoặc bị kiểm duyệt gỡ sau lúc AI đề xuất.
        const job = await this.prisma.jobPost.findFirst({
          where: {
            id: jobPostId,
            status: 'PUBLISHED',
            moderationStatus: 'APPROVED',
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!job) throw new Error('Tin tuyển dụng không còn khả dụng');

        await this.prisma.savedJob.upsert({
          where: { candidateProfileId_jobPostId: { candidateProfileId, jobPostId } },
          create: { candidateProfileId, jobPostId },
          update: {},
        });
        return;
      }

      // Hai loại còn lại cần bộ phân tích CV có cấu trúc, chưa thuộc phạm vi bản
      // này. Khai báo trong enum để hợp đồng ổn định, nhưng chặn ở đây thay vì
      // ghi bừa — thà báo lỗi rõ ràng hơn là sửa hồ sơ người dùng bằng dữ liệu
      // chưa được kiểm.
      case AiActionType.APPLY_CV_SUGGESTION:
      case AiActionType.UPDATE_JOB_PREFERENCE:
        throw new Error('Loại hành động này chưa được hỗ trợ');

      default: {
        const exhaustive: never = actionType;
        throw new Error(`Loại hành động không xác định: ${String(exhaustive)}`);
      }
    }
  }
}
