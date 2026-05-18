# BullMQ Deployment Decisions

## Provider Selection

- **Redis provider (chosen):** Redis Cloud (single-region primary, TLS-enabled).
- **Environments:** one dedicated Redis database for staging and one for production.
- **Why this choice:** BullMQ requires durable Redis primitives, predictable latency, and stable TCP connectivity for long-lived workers.

## Worker Hosting Selection

- **Worker host (chosen):** Render background worker service (always-on Node process).
- **Vercel role:** API and web remain on Vercel; API functions produce jobs only.
- **Why this split:** BullMQ workers and queue events need a persistent process that Vercel serverless functions do not provide.

## Network + Secrets Model

- Worker host and Vercel API use the same `BULLMQ_REDIS_URL` secret.
- Restrict Redis ingress to worker host egress ranges and Vercel egress ranges where possible.
- Use separate credentials per environment (staging/prod), rotated quarterly.
- Keep queue auth secrets in Vercel/Render secret stores only; never commit in repo.

## Queue Taxonomy

- Queue names:
  - `audience-import`
  - `blast-send`
  - `blast-retry`
- Job types:
  - `audience.import.batch`
  - `blast.send.batch`
  - `blast.retry.failed`
- Payloads are ID-first (no large blobs):
  - `importId`, `blastId`, optional `requestedBatchSize`

## Idempotency + Duplicate Protection

- Queue dedupe uses deterministic `jobId` values:
  - `audience-import:<importId>`
  - `blast-send:<blastId>`
  - `blast-retry:<blastId>`
- Domain-level idempotency remains in Postgres models and existing unique constraints.

## Retry + Dead Letter Policy

- Default retries and backoff are centrally configured via env:
  - `BULLMQ_DEFAULT_ATTEMPTS`
  - `BULLMQ_DEFAULT_BACKOFF_MS` (exponential)
- Failed jobs are retained (`removeOnFail: false`) to serve as DLQ backlog.
- Operations tooling:
  - `pnpm --filter worker queue:inspect-failed <queue>`
  - `pnpm --filter worker queue:replay-failed <queue>`
  - `pnpm --filter worker queue:drain <queue>`

## Concurrency + Throughput Controls

- Upload worker concurrency: `BULLMQ_UPLOAD_QUEUE_CONCURRENCY` (default `2`).
- Blast worker concurrency: `BULLMQ_BLAST_QUEUE_CONCURRENCY` (default `5`).
- Blast send chunking and runtime limits still governed by existing app-level controls:
  - `BLAST_SEND_BATCH_SIZE`
  - `BLAST_SEND_MAX_RUN_MS`

## Status Synchronization Contract

- Postgres remains the source of truth for audience import and blast state.
- Queue job completion/failure drives existing service methods, which update:
  - `AudienceImport` status/cursor/counters
  - `Blast`/`BlastRecipient` status fields
  - analytics snapshots and realtime events

## Rollout Phases

1. Enable `FEATURE_BULLMQ_UPLOAD_ENABLED=true` in staging and validate import behavior.
2. Enable `FEATURE_BULLMQ_BLAST_ENABLED=true` in staging and validate blast send/retry behavior.
3. Roll out by organization cohort in production.
4. Keep rollback path available by toggling feature flags off.
