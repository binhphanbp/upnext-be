import { ConflictException } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import { ApplicationTransitionPolicy } from './application-transition.policy';

describe('ApplicationTransitionPolicy', () => {
  const policy = new ApplicationTransitionPolicy();

  describe('Allowed transitions (Forward progression & skipping stages)', () => {
    it.each([
      // Step-by-step forward
      [ApplicationStatus.SUBMITTED, ApplicationStatus.VIEWED],
      [ApplicationStatus.VIEWED, ApplicationStatus.SHORTLISTED],
      [ApplicationStatus.SHORTLISTED, ApplicationStatus.INTERVIEWING],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.OFFERED],
      [ApplicationStatus.OFFERED, ApplicationStatus.HIRED],

      // Forward skipping (nhảy cóc)
      [ApplicationStatus.SUBMITTED, ApplicationStatus.SHORTLISTED],
      [ApplicationStatus.SUBMITTED, ApplicationStatus.INTERVIEWING],
      [ApplicationStatus.SUBMITTED, ApplicationStatus.OFFERED],
      [ApplicationStatus.SUBMITTED, ApplicationStatus.HIRED],
      [ApplicationStatus.VIEWED, ApplicationStatus.INTERVIEWING],
      [ApplicationStatus.VIEWED, ApplicationStatus.OFFERED],
      [ApplicationStatus.VIEWED, ApplicationStatus.HIRED],
      [ApplicationStatus.SHORTLISTED, ApplicationStatus.OFFERED],
      [ApplicationStatus.SHORTLISTED, ApplicationStatus.HIRED],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.HIRED],

      // Rejecting from active states
      [ApplicationStatus.SUBMITTED, ApplicationStatus.REJECTED],
      [ApplicationStatus.VIEWED, ApplicationStatus.REJECTED],
      [ApplicationStatus.SHORTLISTED, ApplicationStatus.REJECTED],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.REJECTED],
      [ApplicationStatus.OFFERED, ApplicationStatus.REJECTED],

      // Same status idempotent
      [ApplicationStatus.SUBMITTED, ApplicationStatus.SUBMITTED],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.INTERVIEWING],
    ])('allows %s -> %s', (from, to) => {
      expect(() => policy.assertAllowed(from, to)).not.toThrow();
    });
  });

  describe('Rejected transitions (Backward transitions, CONSIDERING, WITHDRAWN, Terminal)', () => {
    it.each([
      // Backward transitions (Tuyệt đối không được lùi trạng thái)
      [ApplicationStatus.VIEWED, ApplicationStatus.SUBMITTED],
      [ApplicationStatus.SHORTLISTED, ApplicationStatus.VIEWED],
      [ApplicationStatus.SHORTLISTED, ApplicationStatus.SUBMITTED],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.SHORTLISTED],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.VIEWED],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.SUBMITTED],
      [ApplicationStatus.OFFERED, ApplicationStatus.INTERVIEWING],
      [ApplicationStatus.OFFERED, ApplicationStatus.SHORTLISTED],
      [ApplicationStatus.OFFERED, ApplicationStatus.VIEWED],
      [ApplicationStatus.OFFERED, ApplicationStatus.SUBMITTED],

      // Terminal state HIRED cannot change or go back
      [ApplicationStatus.HIRED, ApplicationStatus.OFFERED],
      [ApplicationStatus.HIRED, ApplicationStatus.INTERVIEWING],
      [ApplicationStatus.HIRED, ApplicationStatus.SUBMITTED],
      [ApplicationStatus.HIRED, ApplicationStatus.REJECTED],

      // Terminal state REJECTED cannot change or go back
      [ApplicationStatus.REJECTED, ApplicationStatus.INTERVIEWING],
      [ApplicationStatus.REJECTED, ApplicationStatus.OFFERED],
      [ApplicationStatus.REJECTED, ApplicationStatus.SUBMITTED],
      [ApplicationStatus.REJECTED, ApplicationStatus.HIRED],

      // Terminal state WITHDRAWN cannot change
      [ApplicationStatus.WITHDRAWN, ApplicationStatus.SUBMITTED],
      [ApplicationStatus.WITHDRAWN, ApplicationStatus.INTERVIEWING],

      // Cannot transition TO WITHDRAWN (candidate only)
      [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN],
      [ApplicationStatus.VIEWED, ApplicationStatus.WITHDRAWN],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.WITHDRAWN],

      // Cannot transition TO CONSIDERING (bỏ trạng thái cân nhắc)
      [ApplicationStatus.SUBMITTED, ApplicationStatus.CONSIDERING],
      [ApplicationStatus.VIEWED, ApplicationStatus.CONSIDERING],
      [ApplicationStatus.SHORTLISTED, ApplicationStatus.CONSIDERING],
      [ApplicationStatus.INTERVIEWING, ApplicationStatus.CONSIDERING],
    ])('rejects %s -> %s', (from, to) => {
      expect(() => policy.assertAllowed(from, to)).toThrow(ConflictException);
    });
  });
});
