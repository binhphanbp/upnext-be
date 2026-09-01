import { Prisma } from '@prisma/client';

/**
 * The classic Prisma docs shape for a P2002 violation is
 * `error.meta.target: string | string[]` naming the columns. That is NOT what
 * this project's stack actually reports: `PrismaService` uses
 * `@prisma/adapter-pg` (driver adapters), and under Prisma 7.8.0 +
 * `@prisma/adapter-pg` a P2002 raised **inside a transaction** carries no
 * `meta.target` at all -- the only place the violated constraint's name shows
 * up is Postgres' own message, forwarded verbatim at
 * `error.meta.driverAdapterError.cause.originalMessage` (e.g. `duplicate key
 * value violates unique constraint "job_boost_one_live_per_job"`). Verified
 * empirically by reproducing a real two-request race against a partial unique
 * index (`job_boost_one_live_per_job`) -- `meta.target` was `undefined`.
 *
 * Every race-detector in this codebase that matches P2002 by constraint name
 * (`isActiveSubscriptionRace`, `isJobBoostRace`) MUST go through this helper
 * instead of reading `error.meta.target` directly, or it will silently never
 * match on this stack and every race becomes an unhandled 500.
 */
export function getUniqueConstraintNames(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return [];
  }

  const target: unknown = error.meta?.['target'];
  const fromTarget = Array.isArray(target)
    ? target.filter((value): value is string => typeof value === 'string')
    : typeof target === 'string'
      ? [target]
      : [];
  if (fromTarget.length > 0) return fromTarget;

  const driverAdapterError = error.meta?.['driverAdapterError'];
  const originalMessage =
    typeof driverAdapterError === 'object' &&
    driverAdapterError !== null &&
    'cause' in driverAdapterError
      ? (driverAdapterError as { cause?: unknown }).cause
      : undefined;
  const message =
    typeof originalMessage === 'object' &&
    originalMessage !== null &&
    'originalMessage' in originalMessage
      ? (originalMessage as { originalMessage?: unknown }).originalMessage
      : undefined;

  if (typeof message === 'string') {
    const match = message.match(/constraint "([^"]+)"/);
    if (match?.[1]) return [match[1]];
  }

  return [];
}
