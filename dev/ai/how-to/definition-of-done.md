---
name: definition-of-done
description: The evidence gate for declaring any uprise work done – each line verified and stated with evidence, never asserted.
layer: root
topic: process
use_when: Declaring any piece of work done, or ending a build session.
last_reviewed: 2026-06-23
---

# Definition of done

The single answer to "am I done?" – before declaring work done, verify and **state evidence** for each line. Evidence means commands run and counts/output stated, not "should pass".

## Must have

1. **Typecheck** – `pnpm -r typecheck` green (or `--filter` to every package you touched). Paste the command.
2. **Tests + boot smoke** – `pnpm --filter api test` green, including `app.module.boot.spec.ts` (the DI gate – typecheck/build do NOT catch provider-resolution bugs). New behaviour has a test; state the count or justify the exception.
3. **Build** – any app/package you changed builds (`pnpm --filter <name> build`). The Next apps' build is the real gate for Tailwind/config changes.
4. **Security** – new/changed endpoints carry `@RequirePermission` (or a justified public-allowlist entry). Authentication is enforced globally, but permission-gating is opt-in: `AbilityGuard` lets any undecorated route through, and nothing scans for the missing decorator – an undecorated endpoint is silently reachable by any authenticated user. Also: provider webhooks `claim`-guard before acting; DTOs are class-validator-validated; no secret/PII in logs.
5. **Events & transactions** – a state write that has a domain event emits it via `OutboxService.append(tx, …)` in the **same** `prisma.$transaction`; FSM transitions go through the state machine's guard.
6. **Migrations** – schema changes are additive, hand-written, applied with `prisma migrate deploy` (never `migrate dev`); client regenerated; `@uprise/db` rebuilt.
7. **No unverified claims** – anything not run/tested is declared as such.

## Anti-patterns

- "Typecheck should pass" – it was not run. Run it; paste it.
- Skipping the api test run because "it's a small change" – the boot smoke catches DI breaks a typecheck can't.
- Editing a `@uprise/*` package's `src` and not rebuilding its dist – consumers still see the old build.
- `prisma migrate dev` – drops the raw partial-unique indexes.
- Emitting a domain event outside the transaction that wrote the row – a crash between them loses the event.

## Checklist

- [ ] `pnpm -r typecheck` run + pasted.
- [ ] `pnpm --filter api test` green incl. the boot smoke; new tests written + counted (or exception justified).
- [ ] Changed apps/packages built.
- [ ] Security line verified for every new/changed entry point.
- [ ] State+event writes atomic; FSM guards used.
- [ ] Migrations additive via `migrate deploy`; client regenerated; `@uprise/db` rebuilt.
- [ ] Everything not run/tested explicitly declared as such.

## Related guides

- `dev/ai/how-to/development-cycle.md` – the session discipline this gate serves.
- `dev/ai/conventions.md` – the commands + build rules.
