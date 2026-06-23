# Fixture: a session to wrap (frozen input)

A cold grader feeds the situation below to a session-wrap run, then grades the
wrap it produces against `answer-key.md`. Nothing here changes between runs.

## What the session did

The plan file `docs/notify-blast.md` had three items for this session:

1. Add `POST /blasts/:id/cancel` that transitions a blast to `CANCELLED` and emits `blast.cancelled`.
2. Add a `CANCELLED` state to the blast FSM with a guard.
3. Backfill a test for the cancel path.

Items 1 and 2 are implemented. Item 3 (the cancel-path test) was **not** written –
the engineer ran out of time and left `// TODO: test cancel guard rejects from SENT`
in `blast.service.spec.ts`.

The new endpoint carries `@RequirePermission({ action: "manage", resource: "messaging.blast" })`
(the real one-argument decorator form, a `{ action, resource }` perm – `messaging.blast`
is the blast resource). The cancel transition emits `blast.cancelled` via
`OutboxService.append(tx, …)` inside the same `prisma.$transaction` that writes the
row, and goes through `blast-state.machine.ts`. No schema change was needed (the
`CANCELLED` enum value already existed in the Prisma enum from an earlier migration).

## Commands actually run this session (and their results)

- `pnpm -r typecheck` → green.
- `pnpm --filter api test` → green, **but the new cancel path has no test** (the boot smoke `app.module.boot.spec.ts` passed).
- `pnpm --filter api build` → green.
- No web app was touched, so no Next build was run.

## Git state at wrap time

- Branch: `feat/blast-cancel` (created off `main` this session).
- `git status`: the two source files (`blast.controller.ts`, `blast.service.ts`) and the spec file are **staged but not committed**.
- The branch has **never been pushed** – no upstream.

## Memory situation

`feat/blast-cancel` is a small single-session change that is nearly done; it is not
a multi-session feature with build state worth persisting. The MEMORY.md index
currently has no row for it and there is no existing memory file for it.
