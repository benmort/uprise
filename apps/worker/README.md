# Yarns Worker

BullMQ worker runtime for queue consumers.

## Run locally

```bash
pnpm --filter worker start
```

## Health endpoints

- `/health`
- `/metrics`

Port is controlled by `WORKER_HEALTH_PORT` (default `3210`).

## Queue admin commands

```bash
pnpm --filter worker queue:inspect-failed blast-send
pnpm --filter worker queue:replay-failed blast-send
pnpm --filter worker queue:drain blast-send
```
