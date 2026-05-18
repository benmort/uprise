# BullMQ Rollout Playbook

## Shadow Validation (Staging)

1. Keep `FEATURE_BULLMQ_*` disabled.
2. Capture baseline snapshots from Postgres for:
   - audience import progress rows
   - blast recipient statuses
3. Enable `FEATURE_BULLMQ_UPLOAD_ENABLED=true`, run upload scenarios, and export snapshots.
4. Enable `FEATURE_BULLMQ_BLAST_ENABLED=true`, run blast send/retry scenarios, and export snapshots.
5. Compare outputs with:

```bash
pnpm shadow:compare-queues -- baseline.json bullmq.json
```

## Phased Production Rollout

1. Deploy API + worker with BullMQ flags off.
2. Enable upload flag for one tenant/org cohort.
3. Watch queue metrics and blast/import outcomes for 30-60 minutes.
4. Expand to additional cohorts.
5. Enable blast flag last, with small blast canary first.

## Rollback

If error rates or queue backlog exceed thresholds:

1. Set `FEATURE_BULLMQ_UPLOAD_ENABLED=false`.
2. Set `FEATURE_BULLMQ_BLAST_ENABLED=false`.
3. Keep worker running until active jobs drain.
4. Confirm cron endpoints resume legacy processing behavior.

## Post-Migration Review Template

- Incident count:
- Queue backlog max:
- Worker availability:
- Blast delivery deltas:
- Audience import throughput deltas:
- Follow-up actions:
