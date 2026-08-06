---
name: observability
description: Querying logs across the estate – durable ops.LogEvent history, the Railway worker stream, Vercel build logs, and BullMQ job detail – from the CLI, the API, or /super/logs.
layer: root
topic: observability
use_when: Diagnosing a failure in production or dev – "what errored", "why is this job not running", "did that migration apply" – or changing what gets logged, stored or swept.
last_reviewed: 2026-08-06
---

# Observability

The estate spans two providers: the seven Next/Nest apps on Vercel, the BullMQ worker on Railway. Answering "what errored in the last hour" used to mean knowing which half to look in and reading a live tail by eye — and the failure that prompted this work was in neither place. It was a `failedReason` on a job hash in Redis.

Canonical: `apps/api/src/observability/` (`railway.client.ts`, `vercel-logs.client.ts`, `log-line.parser.ts`, `queue-inspector.service.ts`, `observability.{service,controller}.ts`), `apps/api/src/common/logging/` (`domain-logger.service.ts`, `log-event.sink.ts`, `log-redaction.ts`), `apps/api/src/scripts/ops/logs.ts`, `apps/admin/src/app/(main)/super/logs/page.tsx`.

## The four sources, and what each is actually for

| Source | Holds | Retention |
|---|---|---|
| `stored` (`ops.LogEvent`) | Every `DomainLogger.warn/error` from **both** the API and the worker, plus drained Next-app errors, with context intact as JSON | `OPS_LOG_RETENTION_DAYS`, default 30 |
| `railway` | The worker's raw container stream, including output that never went through DomainLogger (crashes, OOM kills) | Railway's rolling buffer |
| `vercel` | **Build** logs — including `vercel-build.sh`, i.e. whether a migration applied | Vercel's own |
| `queue` | BullMQ job detail: `failedReason`, `attemptsMade`, and when a delayed job next runs | Until the job is removed |

**Vercel exposes no runtime-log REST API on Pro.** `/v1|v2|v3/.../runtime-logs` all 404 and `vercel logs <url> --json` reports "starting from now" — a tail, not a query. Upgrading does not obviously change this; **log drains are already available on Pro** (a `POST /v1/log-drains` with an empty body answers with a validation error, not a plan error), which is why the drain below is the answer rather than a plan upgrade.

So runtime output reaches `ops.LogEvent` two ways, and which one applies is about whether the app is Nest:

- **API + worker** — at source, via the `DomainLogger` sink. Structured context survives as JSON.
- **The six Next apps** — via the Vercel log drain, because they have no DomainLogger. Their client-side errors already reach `ops.ErrorLog` through the error boundary; the drain covers what never gets that far: SSR renders, route handlers, middleware.

### Setting the drain up

1. Set `VERCEL_LOG_DRAIN_SECRET` (a strong random value) and `VERCEL_LOG_DRAIN_VERIFY` on the **api** project, and redeploy — an unset secret makes the endpoint refuse every delivery.
2. Create the drain against `https://api.uprise.org.au/api/v1/observability/vercel-drain`, `deliveryFormat: "ndjson"`, `sources: ["lambda","edge"]`, secret as above.
3. **Scope it with `projectIds` to the Next apps only.** Including `uprise-api` double-stores its errors — once from the DomainLogger sink, once from the drain.

## Must have

- **`stored` is the default source, and the one to reach for first.** It is the only one that outlives provider retention and the only one covering Vercel runtime errors at all.
- **Look in `delayed`, not just `failed`.** A job that fails on every attempt with retries left waits in `delayed`. Counts alone (`/super/queues`) hid a real incident for months; `/super/logs` and `ops:logs queue` show `failedReason` and `nextRunAt`.
- **The CLI reads whatever env it is given.** Run locally, `ops:logs queue` inspects your LOCAL Redis. Every run prints the target host for that reason — reading a local queue and concluding production is healthy is the exact failure this exists to prevent. Point it at prod by overriding one variable: `BULLMQ_REDIS_URL="<prod>" pnpm --filter api ops:logs queue --state delayed`.
- **The sink must never throw, never block, and stay bounded.** It runs inside `DomainLogger.error`, i.e. while something has already failed. It buffers, flushes on a timer, drops oldest on overflow, and announces the drop in-band.
- **The sink is attached at bootstrap, never injected.** `LoggingModule` is `@Global` because every domain module assumes DomainLogger resolves without imports; making it depend on Prisma inverts that and the container fails at startup. See `attachLogEventSink` in `bootstrap.ts`. `app.module.boot.spec.ts` is the only check that catches this.
- **Sensitive keys are redacted on the write path**, by key substring so a future `userEmail` or `twilioAuthToken` is caught without anyone remembering to list it. See `log-redaction.ts`. Redaction replaces rather than drops, so a reader can still see the field existed.
- **A source that fails warns; it never fails the query.** During an incident the provider that is down is often the one you least need.
- **The drain verifies its HMAC over `req.rawBody`, and refuses when the secret is unset.** It is public-allowlisted, so the signature is its only protection — the same rule every provider webhook here follows.
- **The drain answers 200 on any verified delivery**, reporting `{received, stored}`. Vercel retries a non-2xx in full, so surfacing a partial batch as failure is how a drain wedges into a retry loop.
- **The drain filters, because Vercel cannot.** There is no server-side level filter on a drain, so the firehose arrives and `isWorthStoring` stops it: warn, error, and any 5xx (a lambda that 500s often reports at info level).

## Commands

```bash
pnpm --filter api ops:logs railway --level error --since 1h --grep decrypt
pnpm --filter api ops:logs vercel  --project uprise-api --limit 20
pnpm --filter api ops:logs queue   --queue integration-sync --state delayed,failed
pnpm --filter api ops:logs all     --level error --since 1h --json
```

API (super-admin, `system.queue-stats`): `GET /observability/logs?source=&level=&domain=&q=&since=&limit=`, `GET /observability/queue/jobs?queue=&state=`. Retention sweep: `GET|POST /observability/logs/sweep` (Bearer `CRON_SECRET`).

UI: `/super/logs` in the admin app.

## Anti-patterns

- Reading queue COUNTS and concluding nothing is wrong — the counts are what hid the original incident.
- Running the CLI locally and reporting the result as production.
- Adding a Prisma dependency to `LoggingModule` — it breaks the boot graph.
- Storing `info`/`debug` in `ops.LogEvent`: piping the firehose into the database you reach for when that database is misbehaving is expensive and circular.
- Treating this as alerting. It makes failures findable, not noticed — hook `ops.StatusIncident` for that.

## Checklist

- [ ] New failure path logs through `DomainLogger.warn/error` with a context object (ids, not personal data).
- [ ] Any new sensitive field name is covered by `log-redaction.ts`.
- [ ] Queue changes keep `delayed` visible in the operator surfaces.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md` — including `app.module.boot.spec.ts` if the sink wiring changed.

## Related guides

- `dev/ai/how-to/platform-status.md` – health probes and deploy lookups over the same two providers.
- `dev/ai/how-to/railway-ops.md`, `dev/ai/how-to/vercel-ops.md` – the provider CLIs.
- `apps/api/dev/ai/how-to/bullmq-jobs.md` – the queues these jobs belong to.
- `dev/ai/how-to/env-access.md` – the never-echo discipline the CLI follows.
