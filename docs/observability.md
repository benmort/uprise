# Observability and Alerting

## Core Signals

- **API health:** `GET /api/v1/health`
- **Request tracing:** `x-request-id` header
- **Structured logs:** domain-tagged logs via `DomainLogger`
- **Realtime stream:** `/api/v1/analytics/stream`
- **Worker logs:** startup, queue events, and error logs from the worker runtime

## Suggested Dashboards

1. **API Reliability**
   - Request rate (RPS)
   - Error rate (4xx/5xx split)
   - P95 latency per endpoint group (`audiences`, `blasts`, `analytics`, `inbox`, `integrations`)

2. **Blast Delivery**
   - Recipients queued/sent/failed
   - Failure category trend (`CARRIER_REJECTION`, `NETWORK`, `AUTH`, `UNKNOWN`)
   - Retry success rate

3. **Audience Pipeline**
   - CSV imports: total rows / failed rows
   - Integration sync: synced/failed counts per run
   - Active vs archived audiences

4. **Inbox Responsiveness**
   - Inbound message volume
   - Unread conversation count
   - Median first-reply time

5. **BullMQ Queue Health**
   - Queue completed/failed/stalled counters (`audience-import`, `blast-send`, `blast-retry`, `integration-sync`)
   - Waiting/delayed backlog trend
   - Worker active-job concurrency
   - Failed-job backlog size (DLQ)

## Baseline Throughput Capture

Use the load script in canary mode before and after every tuning change:

```bash
BASIC_AUTH_USERNAME=... \
BASIC_AUTH_PASSWORD=... \
LOAD_BASE_URL=https://api.example.com \
LOAD_ENDPOINT=/api/v1/audiences/dispatch-imports?limit=20 \
LOAD_REQUESTS=120 \
LOAD_CONCURRENCY=6 \
LOAD_CAPTURE_QUEUE_STATS=true \
pnpm node scripts/load/queue-dispatch-load.mjs
```

Repeat for:

- `LOAD_ENDPOINT=/api/v1/blasts/dispatch-due?limit=20`
- `LOAD_METHOD=GET LOAD_ENDPOINT=/api/v1/integrations/sync-jobs?limit=50`

Track these from each run artifact:

- `requestsPerSecond`, `p95Ms`, `failed`
- queue backlog deltas from `queueBefore`/`queueAfter`
- provider-specific 429/error ratio from logs (Twilio and Action Network)

## Recommended Alerts

- **Health endpoint down** for >2 minutes
- **API 5xx rate >2%** for 5 minutes
- **Blast failure ratio >10%** on active sends
- **Integration sync failure** for two consecutive runs
- **DB connectivity check false** in `/health`
- **Queue stalled jobs > 0** for 5 minutes
- **Queue failed/completed ratio > 5%** for 10 minutes
- **Queue backlog (waiting + delayed) grows for 15 minutes**
- **Worker process crash/restart loops** in host logs
- **Twilio 429/20429/14107 spikes >2%** for 10 minutes
- **Action Network 429/5xx spikes >2%** for 10 minutes

## Incident Triage Checklist

1. Confirm scope: single blast, integration, or full platform.
2. Pull request IDs and correlate with deployment window.
3. Verify DB status and migration version.
4. Verify Twilio credentials/webhook signature validation.
5. Verify integration credential validity.
6. Mitigate (pause sends, disable feature flag, rollback).
