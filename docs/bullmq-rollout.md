# BullMQ Rollout Playbook

## Shadow Validation (Staging)

1. Keep `FEATURE_BULLMQ_*` disabled.
2. Capture baseline snapshots from Postgres for:
   - audience import progress rows
   - blast recipient statuses
   - integration sync job throughput (`/api/v1/integrations/sync-jobs`)
3. Enable `FEATURE_BULLMQ_UPLOAD_ENABLED=true`, run upload scenarios, and export snapshots.
4. Enable `FEATURE_BULLMQ_BLAST_ENABLED=true`, run blast send/retry scenarios, and export snapshots.
5. Validate Action Network queued sync flow via `POST /api/v1/integrations/lists/sync` and poll `GET /api/v1/integrations/sync-jobs`.
6. Compare outputs with:

```bash
pnpm shadow:compare-queues -- baseline.json bullmq.json
```

## Phased Production Rollout

1. Deploy API + worker with BullMQ flags off.
2. Enable upload flag for one tenant/org cohort.
3. Watch queue metrics and blast/import outcomes for 30-60 minutes.
4. Expand to additional cohorts.
5. Enable blast flag last, with small blast canary first.
6. Keep integration-sync queue concurrency low first (`BULLMQ_INTEGRATION_SYNC_CONCURRENCY=1-2`) and scale only after AN 429s stay flat.

## Throughput Tuning Lock Order

Apply one change at a time and hold for at least 15 minutes before the next change:

1. CSV path:
   - `AUDIENCE_IMPORT_BATCH_SIZE`
   - `AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE`
   - `AUDIENCE_IMPORT_DISPATCH_LIMIT`
   - `BULLMQ_UPLOAD_QUEUE_CONCURRENCY`
2. Blast path:
   - `BLAST_DISPATCH_LIMIT`
   - `BLAST_DISPATCH_BATCH_SIZE`
   - `BLAST_SEND_BATCH_SIZE`
   - `BULLMQ_BLAST_QUEUE_CONCURRENCY`
   - `TWILIO_SEND_RATE_PER_SECOND` / `TWILIO_SEND_MAX_CONCURRENT`
3. Action Network path:
   - `ACTION_NETWORK_SYNC_REQUESTS_PER_SECOND`
   - `ACTION_NETWORK_SYNC_PER_PAGE`
   - `ACTION_NETWORK_SYNC_IDENTIFIER_BATCH_SIZE`
   - `ACTION_NETWORK_SYNC_PERSON_HREF_CONCURRENCY`
   - `ACTION_NETWORK_SYNC_PAGES_PER_RUN`
   - `BULLMQ_INTEGRATION_SYNC_CONCURRENCY`

## Rollback

If error rates or queue backlog exceed thresholds:

1. Set `FEATURE_BULLMQ_UPLOAD_ENABLED=false`.
2. Set `FEATURE_BULLMQ_BLAST_ENABLED=false`.
3. Keep worker running until active jobs drain.
4. Confirm cron endpoints resume legacy processing behavior.
5. Reduce send and sync pressure immediately:
   - set `TWILIO_SEND_RATE_PER_SECOND` down by 50%
   - set `ACTION_NETWORK_SYNC_REQUESTS_PER_SECOND=1`
   - set queue concurrency vars to `1`

## Stop / Rollback Thresholds

- Twilio 429/20429/14107 > 2% for 10 minutes
- Action Network 429 or 5xx > 2% for 10 minutes
- Queue backlog (`waiting + delayed`) rises continuously for 15+ minutes
- Worker restart loop or sustained CPU saturation (>85%) for 10+ minutes

## Post-Migration Review Template

- Incident count:
- Queue backlog max:
- Worker availability:
- Blast delivery deltas:
- Audience import throughput deltas:
- Follow-up actions:
