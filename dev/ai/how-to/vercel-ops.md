---
name: vercel-ops
description: Manage Vercel from the CLI in uprise – deployments, per-environment env vars, promote/rollback, and the build-time migrate hook. The direct-vs-pooled DB URL rule that bites prod.
layer: root
topic: vercel
use_when: Deploying, inspecting, promoting or rolling back a Vercel app; reading or writing Vercel env vars; or debugging why a Vercel build applied (or skipped) a migration.
last_reviewed: 2026-07-17
---

# Vercel ops

Vercel hosts the seven Next/Nest apps (`admin, auth, api, field, action, product-marketing, organisation-marketing`); each is a separate Vercel project. A push to `main` triggers a prod deploy per project via git integration; the `api` project's build applies pending Prisma migrations under `set -e`, so a bad migration fails that build and prod stays on the last good deploy.

Canonical: `apps/api/scripts/vercel-build.sh` (the `VERCEL_ENV=production` migrate hook: maps `DATABASE_URL` from `DATABASE_URL_UNPOOLED`, runs `prisma migrate deploy`, then `prisma:generate`) + `.vercel/project.json` (per-app `projectId`/`orgId`/`projectName`; gitignored).

## Must have
- **Target the right project.** Each app is its own Vercel project (`uprise-api`, `uprise-admin`, …). CLI commands take the project name: `vercel ls uprise-api`, `vercel env ls production uprise-api`. The local `.vercel/` link points at `uprise-organisation-marketing`, so never rely on the default link for a different app — name the project.
- **Read before write.** `vercel ls <project>` (recent deployments + status), `vercel inspect <url>`, `vercel logs <url>` — confirm the current prod deploy + its state before promoting/rolling back.
- **`vercel ls` writes its table to stderr** when non-interactive — capture with `2>&1`, not `2>/dev/null`, or you get an empty read.
- **Env vars are per-environment.** `vercel env ls <env> <project>` (`production|preview|development`), `vercel env pull <file> --environment=production` (writes real secret values locally — the api project's is `apps/api/.vercel/.env.production.local`, gitignored), `vercel env add <NAME> <env>`, `vercel env rm <NAME> <env>`. A prod secret change takes effect on the next deploy, not instantly — redeploy after.
- **Direct vs pooled DB URL.** `DATABASE_URL` is the pooled (pgbouncer) Neon endpoint; `DATABASE_URL_UNPOOLED` is the direct one. `vercel-build.sh` uses the UNPOOLED url for `migrate deploy` because the pooled endpoint can't run migrations (P1002). Any one-off bulk write / migrate you run yourself must use the **direct** url (strip `-pooler` from the Neon host) — see `dev/ai/how-to/env-access.md`.
- **Deploy verification.** After a `main` push, watch the target project to `● Ready`: `vercel ls uprise-api 2>&1 | grep -m1 -E 'Ready|Error|Building'`. The api build reaching Ready means the migration applied (it runs under `set -e`).
- **Rollback is promote-previous, never a down-migration.** `vercel rollback <previous-url>` / `vercel promote <url>` re-points prod at a known-good deployment; a bad migration is undone by snapshot-restore + redeploy per `docs/migration-runbook.md`, not a down-migration.

## Anti-patterns
- Running a CLI command against the default `.vercel` link when you meant a different app — silently hits `uprise-organisation-marketing`.
- Reading `vercel ls` with `2>/dev/null` (the table is on stderr → empty result → false "nothing there").
- Using the pooled `DATABASE_URL` for a migrate / bulk write — pgbouncer breaks prepared statements and migrations.
- Treating a `vercel env add` as live immediately — it needs a redeploy to reach the running app.
- Echoing a pulled `.env.production.local` value into the transcript — see `env-access.md` (resolve secrets in a subshell, print host/name only).

## Checklist
- [ ] Named the exact Vercel project (not the default link).
- [ ] Read-only pre-check (`vercel ls/inspect/logs`) before any promote/rollback/env write.
- [ ] Env change followed by a redeploy; verified the target project reached `● Ready`.
- [ ] Any migrate/bulk write used the **direct** (unpooled) DB url.
- [ ] No secret value printed to the transcript.

## Related guides
- `dev/ai/how-to/env-access.md` – where secrets live + the never-echo/subshell discipline.
- `dev/ai/how-to/railway-ops.md` – the worker host (Railway), the other half of a full deploy.
- `.claude/skills/cloud-ops/SKILL.md` – the skill that drives these commands.
- `docs/prod-deploy-runbook.md`, `docs/migration-runbook.md` – the canonical prod sequence + rollback.
