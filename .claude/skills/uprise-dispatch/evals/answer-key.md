# Eval – yarns-dispatch answer key

Grades a run of the `yarns-dispatch` skill against `fixture-task.md`. The candidate produces a **dispatch brief** (and prepares a worktree). A cold grader who cannot see the skill scores the brief against the checks below.

Pass = every MUST met and no FAIL tripped. Score the brief that was authored, not chat chatter around it.

## What a correct run produces

- A dispatch brief written to a durable place (plan file / TODO note / runbook), not only chat, with the seven sections: Task, Read-first inputs, The work, Deliverables, Gate, Blast-radius boundary, Success criteria.
- A task-named git worktree prepared via the `EnterWorktree` tool for the cold agent to run in (state under `.claude/worktrees/`). Creating it on the caller's working tree is wrong.

## MUST – names the read-first inputs

The brief cites guides routed from `dev/ai/guide-map.md` that fit this task, **by repo-relative path**, plus that this is a state-lifecycle + event + endpoint task should pull in at least:

- `apps/api/dev/ai/how-to/state-machines.md` (the `ACTIVE → HOLD`, blocked `ARCHIVED → HOLD` FSM).
- `apps/api/dev/ai/how-to/outbox-and-reactions.md` (the `contact.held` domain event).
- `apps/api/dev/ai/how-to/permissions.md` (the contacts-manage `@RequirePermission` on the new endpoint – the real decorator is `@RequirePermission({ action: "manage", resource: "contacts.contact" })`, a single `{ action, resource }` perm).
- At least one of `apps/api/dev/ai/how-to/transactions.md` / `apps/api/dev/ai/how-to/services-controllers-dtos.md` / `packages/dev/ai/how-to/events-catalogue.md`.

MUST also instruct the agent to read the **Canonical yarns files** the guides name (an existing FSM as the pattern, e.g. `apps/api/src/blasts/blast-state.machine.ts`, plus `OutboxService` and the existing `apps/api/src/contacts/` domain) rather than pasting them. Citing only the guides without the Canonical-files instruction is a partial – note it.

## MUST – states the gate

The Gate section states, recognisably verbatim:

- `pnpm --filter api test` green **including the `app.module.boot.spec.ts` boot smoke** (the DI gate). If the boot smoke is not named, FAIL this check.
- `pnpm -r typecheck` green.
- The DoD security line: the new `POST /contacts/:id/hold` endpoint carries `@RequirePermission` for contacts-manage. This is load-bearing because permission-gating is opt-in – the `AbilityGuard` returns true for any undecorated route (`if (!required) return true`) and nothing scans for the decorator, so a missing one silently leaves the endpoint reachable by any authenticated user. The brief must require it as a convention + footgun, not lean on a default-deny that does not exist. DTOs class-validator-validated; no secret/PII in logs.
- The state write emits `contact.held` via `OutboxService.append(tx, …)` in the **same** `prisma.$transaction`; the transition goes through the FSM guard.
- Cites `dev/ai/how-to/definition-of-done.md`.

## MUST – names the deliverables

Recognisable as: the `HOLD` enum value + FSM edges (`ACTIVE↔HOLD`, `ARCHIVED→HOLD` blocked), the `contact.held` event type, the `POST /contacts/:id/hold` endpoint + DTO, and a **new test** covering the new behaviour (the allowed/blocked transitions and the emitted event). A brief with no test deliverable is a partial.

If the lifecycle change needs a migration, the deliverables/gate note it is additive and applied via `prisma migrate deploy` (never `migrate dev`).

## MUST – states the blast-radius boundary

- Out of scope is named: the reaction that actually pauses scheduled messages (the fixture says so explicitly). A brief that pulls that into scope is wrong.
- Confirmation-gated actions are named: applying the lifecycle migration to a **real** database is surfaced for confirmation, not run by the agent; likewise any mass send / destructive or foreign-row deletion. Cites the `dev/ai/how-to/development-cycle.md` blast-radius gates.

## MUST – evidence in the hand-off

Success criteria require the agent to hand back commands-run + counts and to declare anything unverified, not assert "should pass".

## FAIL conditions (any one fails the run)

- Treats the input as a story / ticket / epic, or invents a tracker / registry id. yarns is board-free.
- Boot smoke (`app.module.boot.spec.ts`) absent from the gate.
- slingshot idioms in the work/deliverables: `@Transactional`, `EntityManager`, `RequestContext`, MikroORM, `ZodValidationPipe`, admin-RPC-POST, `BaseCommandHandler`.
- Pulls the out-of-scope message-pausing reaction into the deliverables.
- Pastes large code / whole-file context instead of citing the Canonical file.
- Emits `contact.held` outside the transaction that writes the status, or skips the FSM guard.
- Recommends `prisma migrate dev`, or proposes a cross-schema foreign key.
- Contains the em-dash character, or uses US spelling in prose meant for the repo.

## Scoring

Six things to grade: the "What a correct run produces" section (durable brief + worktree) plus the five `## MUST` sections (read-first inputs, gate, deliverables, blast-radius boundary, evidence in the hand-off).

- All six met, 0 FAILs → **pass**.
- A single partial (e.g. guides cited but Canonical-files instruction missing, or no test deliverable) → note it; still a pass only if all other requirements are met and no FAIL tripped.
- Any FAIL → **fail**, regardless of the rest.
