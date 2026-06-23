---
name: bullmq-jobs
description: How to enqueue and consume background work in yarns – deterministic jobIds, producer/worker split, CRON_SECRET dispatch endpoints.
layer: api
topic: queue
use_when: Adding a background job, a queue consumer, or a cron-driven dispatch endpoint.
last_reviewed: 2026-06-23
---

# BullMQ jobs

The API produces jobs onto named queues with deterministic ids; the worker consumes them. Schedules are kicked by CRON_SECRET-gated dispatch endpoints, not in-process timers.

Canonical: `apps/api/src/common/queue/queue.constants.ts` (`QUEUE_NAMES`, `QUEUE_JOB_TYPES`, and the `getXJobId` helpers – `getBlastSendJobId`, `getAudienceImportJobId`, `getJourneyRungJobId`, `getSegmentEvalJobId`, etc.), `apps/api/src/common/queue/dispatch-queue.ts` (`DispatchQueue.enqueue`, `DispatchQueueJob`), `apps/api/src/common/queue/queue.tokens.ts` (`DISPATCH_QUEUE_TOKEN`), `apps/api/src/common/queue/queue.payloads.ts` (payload types + `isXJobPayload` guards), `apps/worker/src/main.ts` (one `Worker` per queue keyed on `job.name`, plus `drainOutbox` – the outbox relay that enqueues domain events with `jobId: row.id`), `apps/api/src/blasts/blasts.controller.ts` (`dispatchDue` at `GET/POST blasts/dispatch-due`).

## Must have
- Producers inject the queue via `@Inject(DISPATCH_QUEUE_TOKEN)` and call `enqueue({ id, queue, type, payload })`. The worker never produces (except the relay re-enqueuing onto `domain-events`).
- The `id` MUST come from a `getXJobId` helper so retries/duplicates collapse to one job (BullMQ dedups on `jobId`). Build a new helper in `queue.constants.ts` rather than templating an id inline.
- Use the `QUEUE_NAMES` / `QUEUE_JOB_TYPES` constants for `queue` and `type` – the worker switches on `job.name` and returns null for any other type.
- Every consumer validates `job.data` with the matching `isXJobPayload` guard (e.g. `isBlastSendBatchJobPayload`, `isAudienceImportBatchJobPayload`, `isJourneyRunRungJobPayload`, `isSegmentEvalRunJobPayload`) before doing work and throws on a bad payload (so it lands in failed, not silently no-ops).
- Cron/schedule kicks are HTTP endpoints (e.g. `blasts/dispatch-due`, `audiences/dispatch-imports`, `journeys/sweep-due`) gated by the CRON_SECRET Bearer allowlist `isCronDispatchPath` in `basic-auth.guard.ts` – NOT `@Interval`/`setInterval` in the API.
- A new payload type gets its `isXJobPayload` guard in `queue.payloads.ts`, and a new queue gets its `Worker` in `apps/worker/src/main.ts`.

## Anti-patterns
- A random/uuid `jobId` – defeats BullMQ dedup, so a retried dispatch double-sends.
- Doing the work inside the controller instead of enqueuing – blocks the request and loses retry/backoff.
- A consumer that trusts `job.data` without its type guard.
- An in-API `setInterval` for scheduled work – use a CRON_SECRET dispatch endpoint so it's externally triggered and idempotent.

## Checklist
- [ ] Producer enqueues via `DISPATCH_QUEUE_TOKEN` with a `getXJobId` id, `QUEUE_NAMES`/`QUEUE_JOB_TYPES` constants.
- [ ] Worker has a `Worker` for the queue, keyed on `job.name`, validating with the `isXJobPayload` guard.
- [ ] Any new dispatch/cron endpoint added to `isCronDispatchPath` (bare + `/api/v1`) and Bearer-checked against CRON_SECRET.
- [ ] New payload guard added to `queue.payloads.ts`.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/permissions.md` – the CRON_SECRET allowlist vs `@RequirePermission`.
- `apps/api/dev/ai/how-to/webhooks.md` – webhook handlers that enqueue follow-up work.
