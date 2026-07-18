import { ConflictException } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import { ApplicationTransitionPolicy } from './application-transition.policy';

describe('ApplicationTransitionPolicy', () => {
  const policy = new ApplicationTransitionPolicy();

  it.each([
    [ApplicationStatus.SUBMITTED, ApplicationStatus.VIEWED],
    [ApplicationStatus.VIEWED, ApplicationStatus.INTERVIEWING],
    [ApplicationStatus.INTERVIEWING, ApplicationStatus.OFFERED],
    [ApplicationStatus.OFFERED, ApplicationStatus.HIRED],
    [ApplicationStatus.REJECTED, ApplicationStatus.INTERVIEWING],
  ])('allows %s -> %s', (from, to) => {
    expect(() => policy.assertAllowed(from, to)).not.toThrow();
  });

  it.each([
    [ApplicationStatus.SUBMITTED, ApplicationStatus.HIRED],
    [ApplicationStatus.HIRED, ApplicationStatus.REJECTED],
    [ApplicationStatus.OFFERED, ApplicationStatus.SUBMITTED],
  ])('rejects %s -> %s', (from, to) => {
    expect(() => policy.assertAllowed(from, to)).toThrow(ConflictException);
  });
});
