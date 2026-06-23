---
name: yarns-operate
description: Proposes a deploy walk or an incident triage note for a human to execute – it never runs deploy, migration, or infra commands itself. Use when shipping a set of merged changes to prod ("how do we deploy this", "what's the deploy walk", "release this", "sequence the migration"), or when triaging an alert/symptom ("the blast failure rate is spiking", "queue backlog is growing", "health is flapping", "what do I check first"). Output is a confirmation-gated plan; the operator runs the commands.
---

# yarns operate

Turn a set of merged changes into a **deploy walk**, or an alert/symptom into a **triage note**. The output is a plan a human executes – this skill writes the steps, it never runs `prisma migrate deploy`, never flips a Vercel/Render env, never pauses a queue or restores a snapshot. Every action that touches a real database, secret store, queue, or live traffic is surfaced for the operator to run after confirming. yarns is board-free: the unit of work is the merged commit set / the plan file / the runbook in front of you, not a ticket.

Read `dev/ai/guide-map.md` first to route the changes to their layer guides, then drive the plan off the four operational runbooks under `docs/`.

## Invariants

- **Propose, never execute.** This skill produces a plan. It does not run `prisma migrate deploy`, `prisma migrate dev` (banned everywhere in yarns), env/secret writes, `queue:drain`/`queue:replay-failed`, snapshot restores, or any redeploy. State the exact command the operator runs and stop. Running it yourself is the cardinal failure of this skill.
- **Confirmation-gated by default.** Every step that mutates prod – migrations, env/secret changes, feature-flag flips, queue operations, rollbacks – is flagged as confirmation-required and grouped so the operator sees the blast radius before acting. A read-only check (`GET /health`, `prisma migrate status`, a dashboard) is not gated; a write is.
- **Migrations are additive and forward-only.** yarns applies them with `prisma migrate deploy`, never `migrate dev`. There are no destructive down-migrations; rollback is snapshot-restore + redeploy of the previous image, or a feature-flag flip, per `docs/migration-runbook.md`. A deploy walk that proposes a down-migration or `migrate dev` is wrong.
- **Migrate before the code that needs it.** Schema additions land before the API/worker build that reads them, so the new code never hits a column that does not exist yet. Sequence is explicit in the walk.
- **Workers are not Vercel.** The API and web are serverless on Vercel; BullMQ workers run as an always-on Render process (`docs/bullmq-deployment.md`). A change touching a queue, job type, or worker concurrency impacts the Render worker deploy, not just the Vercel API – the walk must say so.
- **Flags over reverts to disable a feature.** To turn a feature off in prod, flip its flag (`FEATURE_*`), don't revert code – the deploy runbook's rollback note is built on this.
- **Australian English; en-dashes, never em-dashes.**

## Artefact contract

**Consumes** one of:

- A **release** input – a set of merged changes (a branch merged to `main`, a commit range `git log main@{1}..main`, a PR set, or a plan file's "done" list). The skill reads what changed (schema, env usage, queues, endpoints) and produces the deploy walk.
- An **incident** input – an alert or symptom (a dashboard alert name from `docs/observability.md`, a paged metric, or a freeform "X is broken"). The skill produces a triage note.

**Produces – a release deploy walk:**

1. **Change summary** – what merged, routed to layer guides by repo-relative path (which migrations, which env/secret keys, which queues/jobs, which endpoints/flags).
2. **Ordered deploy steps** – numbered, each marked `[read-only]` or `[CONFIRM – operator runs]`, with the exact command or Vercel/Render action. Migrations first (`cd apps/api && DATABASE_URL=… npx prisma migrate deploy`, preceded by `prisma migrate status` as a read-only check), then env/secret changes, then the API/web redeploy, then the worker redeploy if queues changed, then flag cutover.
3. **Worker / queue impact** – explicitly: does this touch `audience-import` / `blast-send` / `blast-retry` / `integration-sync`, a job type, concurrency, or retry/DLQ config? If yes, the Render worker redeploys and the flag cutover (`FEATURE_BULLMQ_*`) is named. If no, state "no worker impact".
4. **Smoke checks** – the read-only post-deploy verifications (`GET /api/v1/health` → `ok:true`, `GET /api/v1/system/feature-flags`, the feature's own smoke from `docs/prod-deploy-runbook.md` §6).
5. **Rollback note** – how to undo *this* release: flag-flip to disable a feature; for a bad migration, snapshot-restore + redeploy previous image (never a down-migration); for a queue regression, toggle `FEATURE_BULLMQ_*` off and drain. Cite `docs/migration-runbook.md` rollback strategy.

**Produces – an incident triage note:**

1. **Symptom + scope** – the alert/metric, and "single blast / integration / queue / full platform" per the `docs/observability.md` triage checklist step 1.
2. **Likely cause** – ranked, tied to the signal (e.g. blast failure ratio spike → carrier rejection vs auth vs a bad sender env; queue backlog growth → worker down/stalled vs Redis unreachable vs a poison job).
3. **What to check** – read-only, in order: `GET /api/v1/health` (DB connectivity flag), correlate `x-request-id` with the deploy window, `prisma migrate status`, queue counters / DLQ size, provider 429 ratios in logs. Each is `[read-only]`.
4. **Recovery path** – the mitigations, each `[CONFIRM – operator runs]`: pause sends / flip a feature flag / pause a queue / `queue:inspect-failed`+`queue:replay-failed` / rollback per the migration runbook. The skill names them; the operator runs them.

## Workflow

### Release

1. Read `dev/ai/guide-map.md`; establish the change set (`git log --stat main@{1}..main` or the merged PR diff). Route each changed area to its layer guide.
2. Detect the operational surface: `git diff --name-only <range> -- apps/api/prisma/migrations` for new migrations; `grep` the diff for new `FEATURE_*` / `process.env.` keys; check for changes under the queue/worker/job-dispatch surface (`apps/api/dev/ai/how-to/bullmq-jobs.md` files, queue names, `getXJobId`); list new/changed endpoints and flags.
3. Build the ordered walk per the artefact contract, drawing the exact steps from `docs/prod-deploy-runbook.md` (env tables, smoke §6), `docs/migration-runbook.md` (deploy + validate + rollback), and `docs/bullmq-deployment.md` (worker host, queue taxonomy, flag cutover). Sequence migrations before dependent code.
4. Mark every prod-mutating step `[CONFIRM – operator runs]`; leave reads `[read-only]`. Write the rollback note.
5. Hand back the walk. Do not run any step. If asked to "just do it", restate that this skill proposes and the operator executes.

### Incident

1. Read `docs/observability.md`; map the alert/symptom to its core signal and recommended-alert row.
2. Run the triage-checklist framing (scope → likely cause → read-only checks → mitigation), ranking causes against the signal.
3. List the read-only checks in order; list the recovery path as confirmation-gated mitigations.
4. Hand back the note. Do not pause queues, flip flags, or restore anything.

## Anti-patterns

- **Running the command.** Executing `prisma migrate deploy`, an env write, a queue drain, or a redeploy instead of writing it for the operator. This skill never executes prod actions.
- Proposing `prisma migrate dev` or a destructive down-migration – banned in yarns; rollback is snapshot + redeploy or a flag flip.
- Sequencing the code redeploy before the migration that its new columns depend on.
- Silently treating a queue/job change as a plain API deploy – missing that the Render worker must redeploy and the `FEATURE_BULLMQ_*` cutover applies.
- A release walk with no rollback note, or an incident note with no recovery path.
- Reverting code to disable a feature when a `FEATURE_*` flag flip would do it.
- Inventing a ticket / story / change-request id to hang the release on – yarns is board-free; the unit is the commit set / plan file / runbook.
- The em-dash character anywhere; US spelling in prose for the repo.

## Checklist

- [ ] Input classified: release (deploy walk) or incident (triage note).
- [ ] `dev/ai/guide-map.md` read; changes routed to layer guides by path.
- [ ] Release: migrations sequenced first via `prisma migrate deploy` (with a `prisma migrate status` read-only pre-check); never `migrate dev`, never a down-migration.
- [ ] Release: worker/queue impact stated explicitly (named queues + `FEATURE_BULLMQ_*` cutover, or "no worker impact").
- [ ] Release: env/secret changes listed against the `docs/prod-deploy-runbook.md` tables; smoke checks from §6 included; rollback note present (flag-flip / snapshot-restore + redeploy).
- [ ] Incident: scope → ranked likely cause → ordered read-only checks → confirmation-gated recovery path, per `docs/observability.md`.
- [ ] Every prod-mutating step marked `[CONFIRM – operator runs]`; no step executed by the skill.
- [ ] Cites `docs/prod-deploy-runbook.md`, `docs/migration-runbook.md`, `docs/bullmq-deployment.md` (release) or `docs/observability.md` (incident) by path.

## Related guides

- `docs/prod-deploy-runbook.md` – the canonical prod deploy sequence (Neon, Vercel env tables, Twilio/Meta, smoke §6, rollback notes).
- `docs/migration-runbook.md` – migration deploy, validation, and the forward-only rollback strategy.
- `docs/bullmq-deployment.md` – worker host (Render), queue taxonomy, idempotent `jobId`s, retry/DLQ, flag cutover.
- `docs/observability.md` – core signals, recommended alerts, and the incident triage checklist.
- `dev/ai/guide-map.md` – the router each changed area is checked through.
- `apps/api/dev/ai/how-to/migrations.md`, `apps/api/dev/ai/how-to/bullmq-jobs.md` – the patterns the operational surface maps back to.
