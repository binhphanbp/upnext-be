import {
  buildLegacyContactEligibilityWhere,
  hasNotApplied,
  notBlockedByCandidate,
  OPEN_AND_PUBLIC_WHERE,
} from './candidate-eligibility';

describe('candidate-eligibility', () => {
  const companyId = 'company-1';
  const jobPostId = 'job-1';

  describe('buildLegacyContactEligibilityWhere', () => {
    it('khớp đúng phép AND cho ngữ cảnh có job', () => {
      // Assertion dùng `toEqual` chứ không `toMatchObject`: đây là bản khoá
      // chống drift, nên một điều kiện bị **thêm** hay bị **bỏ** đều phải làm
      // test đỏ. `toMatchObject` chỉ so tập con và đã bỏ lọt đúng lỗi này ở
      // `talent-pool.service.spec.ts` trước khi predicate dùng chung ra đời.
      expect(buildLegacyContactEligibilityWhere({ companyId, jobPostId })).toEqual({
        jobSearchStatus: 'OPEN_TO_WORK',
        profileVisibility: 'PUBLIC',
        contactPreference: { is: { status: 'OPTED_IN' } },
        companyBlocks: { none: { companyId, revokedAt: null } },
        applications: { none: { jobPostId } },
      });
    });

    it('bỏ mảnh "đã ứng tuyển" khi không có ngữ cảnh job', () => {
      const where = buildLegacyContactEligibilityWhere({ companyId });

      expect(where).not.toHaveProperty('applications');
      // Mảnh block thì không bao giờ được bỏ -- nó không phụ thuộc job.
      expect(where.companyBlocks).toEqual({ none: { companyId, revokedAt: null } });
    });

    it('có mảnh block mà ba bản cũ ở talent-pool bỏ sót', () => {
      expect(buildLegacyContactEligibilityWhere({ companyId }).companyBlocks).toEqual({
        none: { companyId, revokedAt: null },
      });
    });

    it('bắt đầu từ trạng thái hồ sơ do ứng viên tự đặt', () => {
      expect(buildLegacyContactEligibilityWhere({ companyId })).toMatchObject(
        OPEN_AND_PUBLIC_WHERE,
      );
    });
  });

  describe('mảnh dùng chung', () => {
    it('notBlockedByCandidate chỉ tính chặn còn hiệu lực', () => {
      // `CompanyCandidateBlock` là append-only, thu hồi bằng `revokedAt`. Bỏ
      // điều kiện này sẽ khiến một lần chặn đã bỏ vẫn còn tác dụng vĩnh viễn.
      expect(notBlockedByCandidate(companyId)).toEqual({
        companyBlocks: { none: { companyId, revokedAt: null } },
      });
    });

    it('hasNotApplied loại ứng viên đã nằm trong luồng application', () => {
      expect(hasNotApplied(jobPostId)).toEqual({ applications: { none: { jobPostId } } });
    });
  });
});
