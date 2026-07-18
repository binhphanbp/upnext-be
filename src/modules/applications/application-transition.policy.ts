import { ConflictException, Injectable } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';

const transitions: Record<ApplicationStatus, ReadonlySet<ApplicationStatus>> = {
  [ApplicationStatus.SUBMITTED]: new Set([
    ApplicationStatus.VIEWED,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ]),
  [ApplicationStatus.VIEWED]: new Set([
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.INTERVIEWING,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ]),
  [ApplicationStatus.SHORTLISTED]: new Set([
    ApplicationStatus.INTERVIEWING,
    ApplicationStatus.OFFERED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ]),
  [ApplicationStatus.INTERVIEWING]: new Set([
    ApplicationStatus.OFFERED,
    ApplicationStatus.HIRED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ]),
  [ApplicationStatus.OFFERED]: new Set([
    ApplicationStatus.HIRED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ]),
  [ApplicationStatus.HIRED]: new Set(),
  [ApplicationStatus.REJECTED]: new Set([
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.INTERVIEWING,
    ApplicationStatus.OFFERED,
  ]),
  [ApplicationStatus.WITHDRAWN]: new Set([
    ApplicationStatus.INTERVIEWING,
    ApplicationStatus.OFFERED,
  ]),
};

@Injectable()
export class ApplicationTransitionPolicy {
  assertAllowed(from: ApplicationStatus, to: ApplicationStatus) {
    if (!transitions[from].has(to)) {
      throw new ConflictException({
        code: 'INVALID_APPLICATION_TRANSITION',
        message: `Cannot transition application from ${from} to ${to}`,
      });
    }
  }
}
