# Migration and Rollback Runbook

## Preconditions

- Confirm backup policy for Postgres is active.
- Confirm `.env` has a correct `DATABASE_URL`.
- Confirm API image includes latest Prisma schema and migrations.

## Deploy Migration

1. Generate and test locally:

```bash
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
pnpm --filter api test
pnpm --filter api build
```

2. Apply in target environment:

```bash
pnpm --filter api prisma:deploy
```

3. Validate:
- `GET /api/v1/health` returns `ok: true`.
- Critical reads/writes for audiences, blasts, analytics, inbox succeed.

## Rollback Strategy

Prisma migrations are forward-oriented. For rollback:

1. Stop writes to impacted endpoints (maintenance mode or temporary feature flag disable).
2. Restore database snapshot to last known-good point.
3. Redeploy previous API image version.
4. Re-enable traffic and verify health plus read/write smoke checks.

## Emergency Patch Migration

If a hotfix migration is required:

1. Create targeted migration in a dedicated branch.
2. Run against staging with production-like data volume.
3. Execute `prisma:deploy` during low-traffic window.
4. Watch DB locks, API latency, and error rates for 15-30 minutes.
