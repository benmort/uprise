# BullMQ Load Test Report

## Smoke Run (Script Validation)

- Command:
  - `BASIC_AUTH_USERNAME=test BASIC_AUTH_PASSWORD=test LOAD_BASE_URL=https://httpbin.org LOAD_ENDPOINT=/status/200 LOAD_REQUESTS=20 LOAD_CONCURRENCY=4 pnpm load:queue-dispatch`
- Result:
  - `completed=20`
  - `failed=0`
  - `avgMs=875`
  - `p95Ms=2856`

## Production-like Run Procedure

Use the same script against API dispatch endpoints:

- `/api/v1/blasts/dispatch-due?limit=5`
- `/api/v1/audiences/dispatch-imports?limit=5`

Recommended parameters:

- `LOAD_REQUESTS=200-1000`
- `LOAD_CONCURRENCY=10-30`
- run separately for upload and blast dispatch

Track:

- queue backlog growth
- worker failed/stalled counts
- API latency and error rate
