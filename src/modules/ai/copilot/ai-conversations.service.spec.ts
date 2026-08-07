import { AiConversationContext, AiMessageRole, AiRunStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiConversationsService } from './ai-conversations.service';

describe('AiConversationsService — chống lạm dụng', () => {
  const count = jest.fn();
  const create = jest.fn();
  const findFirst = jest.fn();
  const updateMany = jest.fn();

  const prismaMock = {
    aIConversation: { count, create },
    aIMessage: { count, create, findFirst, updateMany },
  } as unknown as PrismaService;

  let service: AiConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiConversationsService(prismaMock);
  });

  describe('createForCandidate — trần số hội thoại', () => {
    it('tạo bình thường khi chưa chạm trần', async () => {
      count.mockResolvedValue(49);
      create.mockResolvedValue({
        id: 'c1',
        title: '',
        contextType: 'GENERAL',
        updatedAt: new Date(),
      });

      await service.createForCandidate('candidate-1', AiConversationContext.GENERAL, null, 'vi');

      expect(create).toHaveBeenCalled();
    });

    it('từ chối khi đã đạt trần, và KHÔNG tạo thêm bản ghi', async () => {
      count.mockResolvedValue(50);

      await expect(
        service.createForCandidate('candidate-1', AiConversationContext.GENERAL, null, 'vi'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_CONVERSATION_LIMIT_REACHED' }),
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('chỉ đếm hội thoại chưa ẩn — hội thoại đã archive không tính vào trần', async () => {
      count.mockResolvedValue(0);
      create.mockResolvedValue({
        id: 'c1',
        title: '',
        contextType: 'GENERAL',
        updatedAt: new Date(),
      });

      await service.createForCandidate('candidate-1', AiConversationContext.GENERAL, null, 'vi');

      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isArchived: false }) }),
      );
    });
  });

  describe('appendUserMessage — trần số tin nhắn', () => {
    it('ghi bình thường khi chưa chạm trần', async () => {
      count.mockResolvedValue(99);
      create.mockResolvedValue({ id: 'm1' });

      await service.appendUserMessage('conv-1', 'Xin chào');

      expect(create).toHaveBeenCalled();
    });

    it('từ chối khi hội thoại đã đầy, và KHÔNG ghi thêm prompt rác', async () => {
      count.mockResolvedValue(100);

      await expect(service.appendUserMessage('conv-1', 'Xin chào')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_MESSAGE_LIMIT_REACHED' }),
      });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('hasActiveRun — khoá một run mỗi hội thoại', () => {
    it('báo đang chạy khi có tin nhắn trợ lý còn STREAMING gần đây', async () => {
      findFirst.mockResolvedValue({ id: 'm1' });

      const active = await service.hasActiveRun('conv-1');

      expect(active).toBe(true);
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('báo không chạy khi không có tin nhắn STREAMING nào', async () => {
      findFirst.mockResolvedValue(null);
      updateMany.mockResolvedValue({ count: 0 });

      const active = await service.hasActiveRun('conv-1');

      expect(active).toBe(false);
    });

    it('dọn rác: STREAMING quá 2 phút bị coi là mồ côi, không khoá hội thoại vĩnh viễn', async () => {
      // Không có bản ghi STREAMING *gần đây* — bản ghi cũ (nếu có) đã bị lọc bởi
      // `createdAt: { gte: staleBefore }` trong chính câu query, nên `findFirst`
      // trả về null đúng như trường hợp còn lại; điều cần khẳng định là
      // `updateMany` dọn rác được gọi để bản ghi cũ không kẹt ở STREAMING mãi.
      findFirst.mockResolvedValue(null);
      updateMany.mockResolvedValue({ count: 1 });

      const active = await service.hasActiveRun('conv-1');

      expect(active).toBe(false);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: 'conv-1',
            role: AiMessageRole.ASSISTANT,
            status: AiRunStatus.STREAMING,
          }),
          data: expect.objectContaining({ status: AiRunStatus.FAILED }),
        }),
      );
    });
  });
});
