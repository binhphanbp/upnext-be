# Subscription lifecycle rollout

This release makes the candidate subscription lifecycle explicit without
pretending that a payment provider exists yet. The sandbox checkout route is a
controlled test capability, not a public billing solution.

## Data model and invariants

- `subscription_checkouts` is immutable evidence of one upgrade attempt. Its
  unique key is `(audience, owner_id, idempotency_key)`, so a double click or a
  network retry cannot create two subscriptions.
- `subscription_lifecycle_events` is append-only audit evidence. It describes
  why a subscription became active, expired, or was scheduled for cancellation;
  quota counters remain the source of truth for allowance consumption.
- Every activated paid plan stores a snapshot of its price, duration, and
  included features. Later edits to a plan must not rewrite what a customer
  accepted.
- At every quota/entitlement lookup, overdue active subscriptions are
  atomically persisted as `EXPIRED` or `CANCELLED`. Access therefore never
  depends on a scheduled job being alive.
- The legacy recruiter grant endpoint is admin-only. It rejects candidate plans
  and records `ADMIN_GRANT`; it is not a checkout endpoint.

## Candidate sandbox capability

`POST /candidate-subscriptions/sandbox-checkout` accepts only a public,
active, non-free candidate plan and a client-generated idempotency key.
It is disabled by default.

Enable it only in an isolated testing environment:

```env
SUBSCRIPTION_SANDBOX_CHECKOUT_ENABLED=true
```

The route deliberately does **not** collect payment data, issue invoices, or
claim that money was charged. A real checkout must later be implemented as a
provider-specific state machine (`PENDING` -> provider callback verification ->
`COMPLETED`) before this flag is enabled for users.

## Safe deployment order

1. Deploy this backend revision with the feature flag left `false`.
2. Run `pnpm prisma:deploy` once against the target database.
3. Call `GET /candidate-subscriptions/me` as a candidate to verify existing
   Free provisioning and the new lifecycle fields.
4. In a non-production test account only, enable the sandbox flag and test:
   checkout, exact replay of the same idempotency key, cancellation request,
   cancellation revocation, and expiry.
5. Keep the flag off after the test unless sandbox upgrades are explicitly
   needed for the environment.

### Recovery for a previously failed migration

The candidate quota migration immediately preceding this release uses the
PostgreSQL enum value `active` and shortened index names. If an environment
recorded that migration as failed before this revision, do not delete rows from
`_prisma_migrations` or rerun SQL by hand. First take a database backup and
inspect the migration row and created objects. Only when it has no completed
steps or leftover schema objects should an operator mark that specific
migration rolled back with Prisma, then run `pnpm prisma:deploy` again. A
partially applied schema needs a reviewed, environment-specific recovery.

## Operational queries

Audit recent candidate transitions without exposing plan snapshots publicly:

```sql
SELECT audience, owner_id, event_type, subscription_plan_id, created_at
FROM subscription_lifecycle_events
WHERE audience = 'CANDIDATE'
ORDER BY created_at DESC
LIMIT 50;
```

Before adding a real payment provider, add verified webhook handling,
provider payment identifiers, reconciliation monitoring, and refund policy.
