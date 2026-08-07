import { ConflictException, Injectable } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';

@Injectable()
export class ApplicationTransitionPolicy {
  assertAllowed(from: ApplicationStatus, to: ApplicationStatus) {
    if (to === ApplicationStatus.WITHDRAWN) {
      throw new ConflictException({
        code: 'INVALID_APPLICATION_TRANSITION',
        message: `Cannot transition application from ${from} to ${to}`,
      });
    }
  }
}
