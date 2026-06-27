# Uprise Launch Checklist

## Pre-Launch Gates

- [ ] `pnpm --filter api build` passes
- [ ] `pnpm --filter admin build` passes
- [ ] `pnpm --filter api test` passes
- [ ] `pnpm --filter admin test` passes
- [ ] `prisma:deploy` tested in staging
- [ ] Twilio credentials validated
- [ ] Action Network connection validated
- [ ] Internal source connection validated
- [ ] Stream token secret configured and consistent across all API instances
- [ ] Compliance defaults confirmed (quiet hours, opt-out policy)
- [ ] Redis configured (`BULLMQ_REDIS_URL`)
- [ ] Worker service starts cleanly and stays running
- [ ] BullMQ feature flags configured per environment

## Release Sequence

1. Apply DB migration (`prisma:deploy`).
2. Deploy API.
3. Smoke-check health endpoint.
4. Deploy web.
5. Verify dashboard/audience/analytics/inbox navigation and blast detail/composer routes.
6. Run a small canary blast to a test audience.
7. Verify analytics and inbox updates.
8. Confirm worker logs show completed queue jobs and no stalled spikes.

## Rollback Gates

Rollback immediately if any of:

- API error rate > 5% for 5 minutes
- Blast failure category spikes unexpectedly
- DB migration causes query timeout or lock contention
- Authentication failures across all endpoints
- Worker health check failures or queue backlog growth

Rollback actions:

1. Pause send operations.
2. Disable BullMQ feature flags (`FEATURE_BULLMQ_UPLOAD_ENABLED`, `FEATURE_BULLMQ_BLAST_ENABLED`).
2. Revert API/web images to previous versions.
3. Restore DB snapshot if schema incompatibility is confirmed.
4. Validate with health and canary checks before resuming sends.
