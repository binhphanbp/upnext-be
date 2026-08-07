import { ActorType } from '@prisma/client';
import { CandidateContextAssembler } from '../context/candidate-context.assembler';
import { ToolRegistryService } from './tool-registry.service';

/**
 * Đây là bộ test bảo mật, không phải test tính năng.
 *
 * §16.2 liệt kê các ca prompt injection phải có expected behavior, và §16.3 đặt
 * nguyên tắc least privilege. Những khẳng định dưới đây là bằng chứng cho Demo 3
 * ở §29 — nếu một trong chúng đỏ thì câu chuyện bảo mật của đồ án không còn đúng.
 */
describe('ToolRegistryService', () => {
  // Giữ mock ở biến rời rồi mới ghép thành assembler: `expect(obj.method)` bị
  // eslint chặn vì truy cập method rời khỏi object mất `this`.
  const profile = jest.fn();
  const cvVersion = jest.fn();
  const applications = jest.fn();
  const jobPost = jest.fn();
  const candidateJobs = jest.fn();

  const assembler = {
    profile,
    cvVersion,
    applications,
    jobPost,
    candidateJobs,
  } as unknown as CandidateContextAssembler;

  let registry: ToolRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ToolRegistryService(assembler);
  });

  describe('phân quyền theo vai trò', () => {
    it('vai trò ứng viên chỉ thấy tool đọc dữ liệu của chính mình', () => {
      const names = registry.listFor(ActorType.CANDIDATE).map((tool) => tool.name);
      expect(names).toEqual([
        'get_own_profile',
        'get_own_cv',
        'get_own_applications',
        'get_public_job',
        'search_matching_jobs',
      ]);
    });

    it('KHÔNG để lộ tên tool của vai trò khác cho model', () => {
      const names = registry.listFor(ActorType.CANDIDATE).map((tool) => tool.name);
      for (const forbidden of [
        'search_visible_candidates',
        'get_visible_candidate',
        'draft_candidate_message',
        'get_report_case',
      ]) {
        expect(names).not.toContain(forbidden);
      }
    });

    it('vai trò chưa hỗ trợ nhận danh sách rỗng, không phải danh sách của candidate', () => {
      expect(registry.listFor(ActorType.RECRUITER)).toEqual([]);
      expect(registry.listFor(ActorType.ADMIN)).toEqual([]);
    });
  });

  describe('chặn tool ngoài quyền', () => {
    it('chặn tool của recruiter khi actor là ứng viên, và nói rõ lý do', async () => {
      const result = await registry.execute('search_visible_candidates', {
        actorType: ActorType.CANDIDATE,
        ownerId: 'profile-1',
      });

      expect(result.status).toBe('blocked');
      expect(result.detail).toContain('không thuộc quyền');
    });

    it('phân biệt "tool của role khác" với "tool không tồn tại"', async () => {
      const otherRole = await registry.execute('get_report_case', {
        actorType: ActorType.CANDIDATE,
        ownerId: 'profile-1',
      });
      const invented = await registry.execute('delete_all_applications', {
        actorType: ActorType.CANDIDATE,
        ownerId: 'profile-1',
      });

      expect(otherRole.status).toBe('blocked');
      expect(invented.status).toBe('blocked');
      // Hai thông báo phải khác nhau: một là thử vượt quyền, một là model bịa tên.
      expect(otherRole.detail).not.toBe(invented.detail);
      expect(invented.detail).toContain('không phải công cụ hợp lệ');
    });

    it('KHÔNG chạy tool nào khi bị chặn', async () => {
      await registry.execute('search_visible_candidates', {
        actorType: ActorType.CANDIDATE,
        ownerId: 'profile-1',
      });
      expect(profile).not.toHaveBeenCalled();
      expect(applications).not.toHaveBeenCalled();
    });
  });

  describe('thực thi', () => {
    it('luôn truyền ownerId của người đang đăng nhập xuống assembler', async () => {
      applications.mockResolvedValue([]);

      await registry.execute('get_own_applications', {
        actorType: ActorType.CANDIDATE,
        // Kể cả khi model gửi kèm argument, tool vẫn dùng ownerId của phiên.
        ownerId: 'profile-cua-toi',
        argument: 'profile-cua-nguoi-khac',
      });

      expect(applications).toHaveBeenCalledWith('profile-cua-toi');
    });

    it('tool lỗi trả failed thay vì ném ra ngoài', async () => {
      cvVersion.mockRejectedValue(new Error('Bạn chưa có CV nào'));

      const result = await registry.execute('get_own_cv', {
        actorType: ActorType.CANDIDATE,
        ownerId: 'profile-1',
      });

      expect(result.status).toBe('failed');
      expect(result.detail).toContain('chưa có CV');
    });

    it('get_public_job báo lỗi rõ khi thiếu id thay vì gọi bừa', async () => {
      const result = await registry.execute('get_public_job', {
        actorType: ActorType.CANDIDATE,
        ownerId: 'profile-1',
      });

      expect(result.status).toBe('failed');
      expect(jobPost).not.toHaveBeenCalled();
    });
  });
});
