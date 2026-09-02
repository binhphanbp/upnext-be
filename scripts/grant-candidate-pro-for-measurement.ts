/**
 * One-off: give a real candidate an active CANDIDATE_PRO subscription so
 * `scripts/measure-ai-cogs.ts --feature=copilot` has quota to run N≈100 real
 * calls for D3c. Not part of the seed catalogue -- this candidate already
 * exists on the local dev DB, this only activates a subscription for them.
 *
 * Run with: pnpm tsx scripts/grant-candidate-pro-for-measurement.ts <candidateAccountId>
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set in the environment (.env).');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const candidateAccountId = process.argv[2];
  if (!candidateAccountId)
    throw new Error('Usage: grant-candidate-pro-for-measurement.ts <candidateAccountId>');

  const profile = await prisma.candidateProfile.findUnique({
    where: { candidateAccountId },
  });
  if (!profile) throw new Error(`No CandidateProfile for account ${candidateAccountId}`);

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { code: 'CANDIDATE_PRO' },
  });
  if (!plan) throw new Error('CANDIDATE_PRO plan not found -- run prisma:seed first.');

  const now = new Date('2026-08-26T00:00:00Z');
  const expiredAt = new Date('2026-09-25T00:00:00Z');

  const existing = await prisma.candidateSubscription.findFirst({
    where: { candidateProfileId: profile.id, status: 'ACTIVE' },
  });
  if (existing) {
    console.log('Candidate already has an ACTIVE subscription:', existing.id);
    return;
  }

  const sub = await prisma.candidateSubscription.create({
    data: {
      planId: plan.id,
      candidateProfileId: profile.id,
      startedAt: now,
      expiredAt,
      currentPeriodStart: now,
      currentPeriodEnd: expiredAt,
      source: 'MEASUREMENT_SCRIPT',
      status: 'ACTIVE',
    },
  });
  console.log('Created CandidateSubscription', sub.id, 'on CANDIDATE_PRO for', candidateAccountId);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
