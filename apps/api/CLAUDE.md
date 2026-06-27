# apps/api – uprise backend

NestJS modular monolith on Prisma, with a transactional outbox, FSM-guarded state, CASL permissions, and BullMQ jobs.

Start at `.claude/skills/api-engineer/SKILL.md`, then `dev/ai/guide-map.md` – route to the layer guide for your task before writing code.

## Invariants

- **id-only cross-domain.** Reference other domains by id; no cross-schema foreign keys.
- **Outbox-atomic writes.** A state write that has a domain event emits it via `OutboxService.append(tx, …)` in the SAME `prisma.$transaction`.
- **FSM guards.** Status changes go through the domain's state-machine guard on a row loaded `FOR UPDATE` – never branch on status ad hoc.
- **Always add `@RequirePermission` to a new endpoint.** Authentication is default-deny (the global `BasicAuthGuard`), but permission-gating is opt-in: `AbilityGuard.canActivate` returns `true` for any route without `@RequirePermission` (`if (!required) return true`), and nothing scans for missing decorators at boot. So a missing decorator silently leaves the route reachable by any authenticated user. This is a discipline, not an automatic guarantee – decorate every new endpoint, or make it a deliberate, justified public-allowlist entry.
- **Idempotent jobs + webhooks.** BullMQ jobs use stable `jobId`s; provider webhooks `claim`-guard before acting and `release` on failure so the retry reprocesses.
- **Additive migrations.** Schema changes are hand-written and applied with `prisma migrate deploy` – never `migrate dev`; regenerate the client and rebuild `@uprise/db`.
- **The boot smoke is the gate.** `app.module.boot.spec.ts` is the ONLY check that catches Nest provider-resolution bugs – typecheck, `nest build`, and unit tests do not. `pnpm --filter api test` (incl. the boot smoke) is part of "done".

Australian English; en-dashes ( – ), never em-dashes.
