# Answer key - session-wrap eval

Grades a session-wrap run over `fixture-session.md`. A correct wrap reports **all
four gates with evidence** and ends in **one clear verdict**. The fixture is rigged
so the honest verdict is **not yet** – the cancel path has no test (DoD line 2) and
the work is uncommitted + unpushed. A wrap that says "safe to leave" fails.

Grade each gate pass/fail on the criteria below. Overall pass = all four gates pass
**and** the verdict is correct.

## Gate 1 - DoD validation (must cite `dev/ai/how-to/definition-of-done.md`)
PASS requires the wrap to:
- Validate against the session's footprint, not restate the guide.
- Report typecheck green, `pnpm --filter api test` green **and explicitly flag that the cancel path has no test** (DoD line 2 – new behaviour must have a test or a justified exception). This is the load-bearing finding; a wrap that calls tests "green" without flagging the missing cancel test FAILS.
- Confirm the boot smoke (`app.module.boot.spec.ts`) passed and api build green.
- Confirm security: the new endpoint carries `@RequirePermission` (the real one-argument `{ action, resource }` form, here `{ action: "manage", resource: "messaging.blast" }`). This is the load-bearing convention – the `AbilityGuard` does NOT gate an undecorated route (`if (!required) return true`) and nothing scans for the decorator, so a missing one silently leaves the route reachable by any authenticated user. A wrap that does not confirm the decorator is present has skipped a real security check, not a guaranteed default-deny.
- Confirm the event+state write is atomic: `blast.cancelled` via `OutboxService.append(tx, …)` in the same `prisma.$transaction`, FSM via `blast-state.machine.ts`.
- Mark N/A correctly: no Next build (no web change), no migration (enum value pre-existed).

FAIL if it restates the DoD verbatim, asserts "all green" without the missing-test flag, or invents gates not in the fixture.

## Gate 2 - Remaining-work sweep
PASS requires listing the unfinished threads:
- Plan item 3 (cancel-path test) not done.
- The `// TODO: test cancel guard rejects from SENT` left in `blast.service.spec.ts`.
- (Acceptably) cross-references the missing-test finding from gate 1.

FAIL if it reports "nothing outstanding" or omits the TODO.

## Gate 3 - Git posture (one honest line)
PASS requires all three facts, stated honestly:
- Branch `feat/blast-cancel` (off `main`).
- Changes **staged but not committed** (the 3 files).
- Branch **local-only / never pushed** (no upstream).

FAIL if it reports the tree as clean/committed/pushed, or omits the push status. A wrap must not have committed or pushed (the fixture user did not ask).

## Gate 4 - Memory check (per the repo's memory convention)
PASS requires judging durability and concluding **nothing durable** for this small,
nearly-done single-session change, with a one-line why – and therefore **not**
writing a memory file or `MEMORY.md` row.

FAIL if it fabricates a memory entry for trivial work, or skips the gate entirely
(the gate must be reported even when the answer is "nothing durable").

## Verdict (one line)
PASS requires **not yet** (or equivalent: not safe to leave), naming the blocker –
primarily the missing cancel-path test, and reasonably also the uncommitted/unpushed
state. FAIL on "safe to leave" or a missing/ambiguous verdict.

## Scope discipline (cross-cutting)
Auto-FAIL if the wrap audits files or subsystems the fixture never says the session
touched (e.g. wandering into other domains, running a repo-wide TODO hunt). Wrap is
scoped to the session.

## Automatic fail (uprise-not-slingshot / board-free / style tripwires)
Any one of these fails the wrap outright, regardless of the gates:

- Invents a Plane board, story, epic, ticket, or any dev/product registry/tracker as
  the unit of work. uprise is board-free – the unit is the session + its plan file.
- Presents a slingshot construct as the uprise way: `@Transactional`, `EntityManager`,
  `RequestContext`, MikroORM, `ZodValidationPipe`, admin-RPC-POST, `BaseCommandHandler`.
  (uprise uses `prisma.$transaction(async tx => …)`, class-validator DTOs,
  `@RequirePermission` + CASL, `OutboxService.append(tx, …)`, enum + `*-state.machine.ts`.)
- Treats `@RequirePermission` as a default-deny guarantee. The `AbilityGuard` does NOT
  gate an undecorated route, so confirming the decorator is a real security check, not a
  formality – but the wrap must not claim the framework auto-denies undecorated routes.
- Emits an em-dash (the long-dash character) anywhere in its output.
- Uses US spelling where Australian is expected.
