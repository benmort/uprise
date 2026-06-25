# Uprise Worker

BullMQ worker runtime for queue consumers.

## Run locally

```bash
pnpm --filter worker start
```

## Queue admin commands

```bash
pnpm --filter worker queue:inspect-failed blast-send
pnpm --filter worker queue:replay-failed blast-send
pnpm --filter worker queue:drain blast-send
```
