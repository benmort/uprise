# Observability and Alerting

## Core Signals

- **API health:** `GET /api/v1/health`
- **Request tracing:** `x-request-id` header
- **Structured logs:** domain-tagged logs via `DomainLogger`
- **Realtime stream:** `/api/v1/analytics/stream`

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

## Recommended Alerts

- **Health endpoint down** for >2 minutes
- **API 5xx rate >2%** for 5 minutes
- **Blast failure ratio >10%** on active sends
- **Integration sync failure** for two consecutive runs
- **DB connectivity check false** in `/health`

## Incident Triage Checklist

1. Confirm scope: single blast, integration, or full platform.
2. Pull request IDs and correlate with deployment window.
3. Verify DB status and migration version.
4. Verify Twilio credentials/webhook signature validation.
5. Verify integration credential validity.
6. Mitigate (pause sends, disable feature flag, rollback).
