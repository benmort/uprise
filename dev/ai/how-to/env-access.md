---
name: env-access
description: Where uprise secrets live (local files + Vercel + Railway + Neon), the standing permission to read them, and the never-echo/subshell discipline for handling them without leaking into the transcript.
layer: root
topic: env
use_when: Reading or using any env var / secret — local .env files, cloud env (Vercel/Railway), a prod DB url, or a provider token — and any time a secret value could otherwise end up in the conversation.
last_reviewed: 2026-07-17
---

# Env access

The agent has standing permission (see `.claude/settings.local.json`) to read env vars locally and in the cloud, and to run the cloud env commands. That access is only safe paired with one discipline: **a secret value must never be printed into the transcript.** The transcript is durable; a leaked prod token or DB url is a real exposure.

Canonical: `apps/api/src/config/env.validation.ts` (the authoritative list of required/optional env keys + their guards) and `.env.prod.example` (names, never values).

## Where secrets live
- **Local files (gitignored):** `apps/*/.env`, `.env`, `apps/api/.vercel/.env.production.local` (a `vercel env pull` artefact with live prod values). `*.example` files hold NAMES only and are committed.
- **`PRODUCTION_DATABASE_URL`** lives in `apps/api/.env.prod` — deliberately NOT named `DATABASE_URL` so an accidental `source` can't point local tooling at prod. A blanket `source .env.prod` therefore leaves `DATABASE_URL` empty; read `PRODUCTION_DATABASE_URL` explicitly.
- **Vercel:** per-project, per-environment — `vercel env ls production <project>` / `vercel env pull`. See `vercel-ops.md`.
- **Railway:** the worker's vars — `railway variables`. See `railway-ops.md`.
- **Neon:** the DB. `DATABASE_URL` is pooled (`-pooler` host); the **direct** url (strip `-pooler`) is required for migrate + bulk writes.

## Must have
- **Never echo a secret.** Resolve it into a shell variable in a subshell and use it there; print only a non-secret discriminator (host, db name, project) to confirm the target. The pattern (used to load ABS data to prod this repo):
  ```bash
  ( set -a; source <(grep -E '^PRODUCTION_DATABASE_URL=' apps/api/.env.prod); set +a
    DIRECT="${PRODUCTION_DATABASE_URL/-pooler./.}"          # de-pool for bulk writes
    echo "target: ${DIRECT##*@}"                            # host+db only, no creds
    DATABASE_URL="$DIRECT" npm --prefix apps/api run geo:load-abs )
  ```
- **Mask when discovering.** To find WHICH file/var holds a secret, print names with values hidden: `grep -nE '=(postgres|postgresql)://|DATABASE_URL' <file> | sed -E 's/=.*/=<hidden>/'`.
- **Direct vs pooled.** Migrations + bulk upserts use the direct (unpooled) url. `DATABASE_URL_UNPOOLED` locally; strip `-pooler.` from the Neon host for a prod one.
- **Prefer process-env override over sourcing.** `DATABASE_URL="<prod>" npm --prefix apps/api run <script>` overrides just the DB url while the app's other vars still load from `apps/api/.env` (dotenv won't override an already-set process var) — so env-validation still passes. Don't wholesale-`source` a prod env file into your live shell.
- **Pass secrets to a `!` hand-off inline, parameterised** — `! DATABASE_URL="…" …` — never bake the value into text you write for the user; let them substitute it.

## Anti-patterns
- `cat`/`echo` of a `.env*` file, or printing a resolved url/token — it lands in the transcript.
- `source apps/api/.env.prod` expecting `DATABASE_URL` — it's `PRODUCTION_DATABASE_URL` on purpose.
- Using the pooled `DATABASE_URL` for a migrate/bulk write (pgbouncer breaks it).
- Committing a resolved secret anywhere, or adding credential/write allows to the checked-in `.claude/settings.json` (they belong in the gitignored `settings.local.json`).

## Checklist
- [ ] No secret value in the transcript (subshell + masked/host-only output).
- [ ] Correct DB url posture (direct for migrate/bulk; pooled for the app).
- [ ] Process-env override used, not a wholesale `source` of a prod env file.
- [ ] `!` hand-offs parameterise the secret rather than embedding it.

## Related guides
- `dev/ai/how-to/vercel-ops.md`, `dev/ai/how-to/railway-ops.md`, `dev/ai/how-to/dnsimple-dns.md` – the per-service commands.
- `dev/ai/how-to/warp-shell.md` – passing secrets through a `!` command.
- `.claude/skills/cloud-ops/SKILL.md` – the skill; `apps/admin/dev/ai/how-to/web-security.md` – secrets never in client bundles.
