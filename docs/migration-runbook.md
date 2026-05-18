# Migration and Rollback Runbook

## Preconditions

- Confirm backup policy for Postgres is active.
- Confirm `.env` has a correct `DATABASE_URL`.
- Confirm API image includes latest Prisma schema and migrations.
- Confirm Redis is reachable via `BULLMQ_REDIS_URL`.
- Confirm worker service is deployed and `/health` returns `ok: true`.

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
- Worker `GET /metrics` shows queue activity and no startup errors.
- `dispatch-due` and `dispatch-imports` endpoints return queue enqueue results when BullMQ flags are enabled.

## BullMQ Feature-Flag Cutover

1. Enable in staging:
   - `FEATURE_BULLMQ_UPLOAD_ENABLED=true`
   - `FEATURE_BULLMQ_BLAST_ENABLED=true`
2. Verify uploads and blasts process via worker queues.
3. Promote to production by cohort/tenant waves.

## Rollback Strategy

Prisma migrations are forward-oriented. For rollback:

1. Stop writes to impacted endpoints (maintenance mode or temporary feature flag disable).
2. Restore database snapshot to last known-good point.
3. Redeploy previous API image version.
4. Re-enable traffic and verify health plus read/write smoke checks.

### Queue-specific rollback

1. Toggle off:
   - `FEATURE_BULLMQ_UPLOAD_ENABLED=false`
   - `FEATURE_BULLMQ_BLAST_ENABLED=false`
2. Keep worker online until active jobs drain or pause queues explicitly.
3. Confirm cron dispatch routes continue processing with legacy in-process path.

## Emergency Patch Migration

If a hotfix migration is required:

1. Create targeted migration in a dedicated branch.
2. Run against staging with production-like data volume.
3. Execute `prisma:deploy` during low-traffic window.
4. Watch DB locks, API latency, and error rates for 15-30 minutes.
