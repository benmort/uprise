---
name: railway-ops
description: Manage the always-on BullMQ worker on Railway – variables, logs, status, deploy – and keep its env in lockstep with the Vercel API. The worker host uprise deploys separately from Vercel.
layer: root
topic: railway
use_when: Deploying, inspecting or configuring the BullMQ worker; reading or setting Railway variables; or diagnosing why queued jobs (blast-send, audience-import, outbox relay) aren't draining.
last_reviewed: 2026-07-17
---

# Railway ops

Vercel is serverless and can't host an always-on process, so the BullMQ worker (`apps/worker` — the outbox relay + queue consumers) runs on **Railway**. It's a separate deploy from the Vercel apps: a queue/job/worker change ships here, not just to the Vercel API.

Canonical: `railway.json` (NIXPACKS builder; build `pnpm --filter worker build && pnpm --filter worker deploy --legacy --prod worker-deploy`; `preDeployCommand` runs `prisma migrate deploy`; `startCommand` `node worker-deploy/dist/worker/src/main.js`; restart-on-failure, max 10).

## Must have
- **The worker shares the API's DB + Redis exactly.** `DATABASE_URL` and `BULLMQ_REDIS_URL` on Railway must be identical to the API's (same Neon DB, same Redis) or jobs silently go to a different queue / can't read the rows they process. `railway variables` to read; keep them in sync whenever the API's change.
- **Read before write.** `railway status` (linked project/service + latest deploy), `railway logs` (live worker output — the fastest signal for a stalled/erroring consumer), `railway variables` (current env). Check these before redeploying.
- **Deploy = `railway up` / redeploy from the dashboard.** A push doesn't auto-deploy the worker the way Vercel does unless the Railway GitHub trigger is on; `railway up` deploys the current tree. `preDeployCommand` applies migrations first (same forward-only `migrate deploy` rule as everywhere).
- **Queue changes are a worker deploy.** A new queue, job type, concurrency bump, or retry/DLQ change impacts the Railway worker — redeploy it, and flip the matching `FEATURE_BULLMQ_*` flag. The Vercel API deploy alone is not enough.
- **Migrations are forward-only here too.** `preDeployCommand` runs `prisma migrate deploy`; never `migrate dev`; rollback is redeploy-previous + snapshot-restore, not a down-migration.

## Anti-patterns
- Setting a secret on the Vercel API but not on the Railway worker (or vice-versa) — the two drift and jobs fail obscurely.
- Shipping a queue/job change to Vercel and forgetting the worker redeploy — the new job type is enqueued but nothing consumes it.
- Assuming a `main` push redeployed the worker — confirm via `railway status`/logs.
- Pointing the worker at the pooled DB url — use the same connection posture the API uses (`DATABASE_URL_UNPOOLED` for migrate; see `env-access.md`).

## Checklist
- [ ] `railway status` + `railway logs` read before acting.
- [ ] Worker `DATABASE_URL` + `BULLMQ_REDIS_URL` confirmed identical to the API's.
- [ ] Queue/job change → worker redeployed (`railway up`) + `FEATURE_BULLMQ_*` cutover named.
- [ ] Migration applied via `preDeployCommand` (`migrate deploy`); no `migrate dev`, no down-migration.
- [ ] No secret value printed to the transcript.

## Related guides
- `dev/ai/how-to/vercel-ops.md` – the API/web half of a full deploy.
- `dev/ai/how-to/env-access.md` – secret locations + safe handling.
- `apps/api/dev/ai/how-to/bullmq-jobs.md` – the queue/job patterns a worker change maps back to.
- `.claude/skills/cloud-ops/SKILL.md` – the driving skill. `docs/bullmq-deployment.md` – worker deploy runbook.
