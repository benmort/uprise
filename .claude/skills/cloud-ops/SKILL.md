---
name: cloud-ops
description: Hands-on cloud + infra execution for uprise – manage Vercel deployments + env vars, the Railway worker + its variables, DNSimple DNS records, and read any env var locally or in the cloud. Standing full-autonomy permission (no prompts, incl. prod writes) is granted in .claude/settings.local.json. Use when asked to deploy/promote/rollback, read or set env vars/secrets, add/verify/remove a DNS record, or pull/inspect cloud config. Distinct from uprise-operate (which only *proposes* a release walk) — this skill runs the commands.
---

# cloud-ops

Execute cloud + infrastructure work directly: Vercel (deployments + per-environment env vars), Railway (the always-on BullMQ worker + its variables), DNSimple (DNS records), and reading env vars anywhere (local files, Vercel, Railway, Neon). The operator has granted standing, prompt-free permission for all of it — including prod-mutating writes — in `.claude/settings.local.json`. Autonomy is not licence to be careless: the invariants below are operational hygiene, not confirmation gates. uprise is board-free — the unit of work is the task in front of you, not a ticket.

This skill **runs** commands. `uprise-operate` is the sibling that only *proposes* a release walk for a human; reach for that when the ask is "plan the deploy", reach for this when the ask is "do it".

Read `dev/ai/guide-map.md` first, then read every per-service guide whose row fits.

## Invariants
- **Never echo a secret value.** Resolve secrets in a subshell and print only a non-secret discriminator (host, db name, project). The transcript is durable; a leaked token/DB url is a real exposure. See `dev/ai/how-to/env-access.md`.
- **Read before you mutate.** A read-only pre-check precedes every prod write: `vercel ls/inspect` before promote/rollback, `railway status/logs` before a worker deploy, `findRecords` (GET) before a DNSimple create/delete. Look, then leap.
- **Verify the target.** Name the exact Vercel project / Railway service / DNS zone before writing — the default `.vercel` link points at `uprise-organisation-marketing`, so an unqualified command hits the wrong app.
- **Idempotent + forward-only.** DNS creates check-then-write (`ensureRecord`); migrations are `prisma migrate deploy` on the **direct** (unpooled) DB url, never `migrate dev`, never a down-migration; rollback is promote-previous / snapshot-restore / flag-flip.
- **Confirm it took effect.** A Vercel env change needs a redeploy; a queue change needs the Railway worker redeployed; a DNS record created ≠ validated. Read back after every write.
- **Autonomy stays local.** Credential + prod-write allows live in the gitignored `.claude/settings.local.json`, never the checked-in `settings.json` (that would hand every teammate/CI the same no-prompt prod power).
- **Australian English; en-dashes, never em-dashes.**

## Guide index
Read `dev/ai/guide-map.md` first, then read every guide whose row fits.

| Task | Read |
|---|---|
| Vercel deploy / promote / rollback / env vars | `dev/ai/how-to/vercel-ops.md` |
| Railway worker deploy / variables / logs | `dev/ai/how-to/railway-ops.md` |
| Add / verify / remove a DNS record | `dev/ai/how-to/dnsimple-dns.md` |
| Read/use any env var or secret safely | `dev/ai/how-to/env-access.md` |
| Operate inside the Warp terminal (`!`, session state) | `dev/ai/how-to/warp-shell.md` |
| Only *plan* a release for a human to run | `.claude/skills/uprise-operate/SKILL.md` |

## Workflow
1. **Classify.** Which surface: Vercel deploy/env, Railway worker/vars, DNSimple record, or an env-var read? Route to the guide(s).
2. **Resolve the target + creds.** Name the project/service/zone; resolve any secret in a subshell (env-access pattern), printing only the host/name to confirm you're pointed at the right place.
3. **Read-only pre-check.** `vercel ls/inspect/logs`, `railway status/logs`, DNSimple `findRecords`, or a masked env discovery — establish current state.
4. **Execute the write** (permission is standing — no prompt), idempotent + forward-only, on the correct target and (for DB) the direct url.
5. **Verify.** Read back: deploy `● Ready`, env reflected after redeploy, DNS record present + provider re-validated, values loaded.
6. **Report** what changed + the read-back evidence, with no secret in the output.

## Anti-patterns
- Printing a secret (a pulled `.env.production.local` value, a Bearer token, a resolved prod DB url) into the transcript.
- Writing to the default `.vercel` link when you meant a specific app.
- Blind-POSTing a DNS record without a prior `findRecords`; deleting by name-guess instead of the stored id.
- Using the pooled `DATABASE_URL` for a migrate/bulk write; proposing `migrate dev` or a down-migration.
- Treating a `vercel env add` / queue change as live without the redeploy; treating "record created" as "validated".
- Putting credential/prod-write allows in the checked-in `settings.json`.
- Reading `vercel ls` with `2>/dev/null` (its table is on stderr).

## Checklist
- [ ] Classified the surface; routed to the per-service guide.
- [ ] Target (project/service/zone) named; secret resolved in a subshell, host/name-only printed.
- [ ] Read-only pre-check run before the write.
- [ ] Write executed idempotently + forward-only; DB writes on the direct url.
- [ ] Read-back verification (deploy Ready / env reflected / DNS present + validated).
- [ ] No secret value in the transcript; autonomy allows stayed in `settings.local.json`.

## Related guides
- `dev/ai/how-to/vercel-ops.md`, `dev/ai/how-to/railway-ops.md`, `dev/ai/how-to/dnsimple-dns.md`, `dev/ai/how-to/env-access.md`, `dev/ai/how-to/warp-shell.md` – the per-service depth.
- `.claude/skills/uprise-operate/SKILL.md` – propose-only release/incident sibling.
- `docs/prod-deploy-runbook.md`, `docs/migration-runbook.md`, `docs/bullmq-deployment.md` – the canonical runbooks.
