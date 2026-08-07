import {
  isJobPostAccessibleToRecruiter,
  recruiterAccessibleJobPostFilter,
} from './job-post-access';

describe('recruiterAccessibleJobPostFilter', () => {
  it('cho qua tin do chính recruiter tạo, kể cả khi có bản ghi thu hồi', () => {
    const filter = recruiterAccessibleJobPostFilter('recruiter-id');

    expect(filter).toEqual({
      OR: [
        { createdByRecruiterId: 'recruiter-id' },
        { accessRevocations: { none: { recruiterAccountId: 'recruiter-id' } } },
      ],
    });
  });
});

describe('isJobPostAccessibleToRecruiter', () => {
  it('người tạo tin luôn giữ quyền dù đã bị thu hồi', () => {
    const jobPost = {
      createdByRecruiterId: 'recruiter-id',
      accessRevocations: [{ id: 'revocation-id' }],
    };

    expect(isJobPostAccessibleToRecruiter(jobPost, 'recruiter-id')).toBe(true);
  });

  it('thành viên khác mặc định có quyền khi không bị thu hồi', () => {
    const jobPost = { createdByRecruiterId: 'someone-else', accessRevocations: [] };

    expect(isJobPostAccessibleToRecruiter(jobPost, 'recruiter-id')).toBe(true);
  });

  it('thành viên khác mất quyền khi đã bị thu hồi riêng cho tin đó', () => {
    const jobPost = {
      createdByRecruiterId: 'someone-else',
      accessRevocations: [{ id: 'revocation-id' }],
    };

    expect(isJobPostAccessibleToRecruiter(jobPost, 'recruiter-id')).toBe(false);
  });
});
