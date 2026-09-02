import { ConflictException } from '@nestjs/common';
import { getUniqueConstraintNames } from '../../prisma/unique-constraint-error';

/**
 * `job_boost_one_live_per_job` (migration `20260901120000_job_boost_rollout_p0`)
 * is a partial unique index guaranteeing at most one `scheduled`/`active` boost
 * per job post. Two concurrent "boost this job" requests can both pass the
 * application-level pre-check in `JobBoostService.createBoost` before either
 * commits -- the loser hits `P2002` here, and without this helper that becomes
 * an opaque 500 for a perfectly normal race.
 */
export function isJobBoostRace(error: unknown): boolean {
  return getUniqueConstraintNames(error).includes('job_boost_one_live_per_job');
}

/**
 * Error surfaced to the client when it loses the "boost this job" race.
 *
 * 409, not 500: this is not a system failure -- another request just boosted
 * the same job first. The client's own pre-check (`runningBoost` query in
 * `createBoost`) missed it only because of the race window; retrying will see
 * the winner's boost and should offer to cancel/wait instead of blindly
 * resubmitting.
 */
export function jobBoostRaceError(): ConflictException {
  return new ConflictException({
    code: 'JOB_BOOST_ALREADY_ACTIVE',
    message: 'Một yêu cầu khác vừa đẩy tin này. Vui lòng tải lại trang.',
  });
}
