# Eval answer key: uprise-implement on the 2-layer work-unit fixture

Grades a cold session that ran `uprise-implement` against `fixture-work-unit.md`
("archive a turf"). The cold session cannot see this key. Score each item; the run
**passes** only if every MUST item is met.

## What a correct run produces

### MUST – classification (the fixture is a 2-layer, M-sized, additive work-unit)

1. Identifies **two layers**: backend (`apps/api`, canvass domain) **and** frontend
   (the Next turf-list UI / web). Naming only one layer fails.
2. Sizes it **M** (or L), not S – it spans layers and adds a lifecycle state. Calling
   it a small single-layer change fails.
3. Identifies blast radius as **none / additive** – explicitly notes the archive state
   is an additive migration on existing data, NOT a destructive data op. (No mass send,
   no deletion.) A run that treats it as confirmation-gated destructive work is wrong;
   a run that ignores blast radius entirely is also wrong.

### MUST – strategy (capacity-adaptive)

4. Chooses **route-to-layer in a single session**, sequencing backend before frontend
   (the web badge/action needs the archived state + API to exist first).
5. Does **NOT** auto-spawn sub-agents / cold dispatch – the fixture states no
   multi-agent opt-in and no budget, so prepare-and-hand-off / in-session is correct.
   Auto-spawning parallel agents here fails.
6. Stays on the current branch (no `.claude/worktrees/` worktree) – worktrees are for
   parallel/cold work, not this in-session sequential build.

### MUST – routing to the right engineers + the right backend invariants

7. Routes the backend slice to **`api-engineer`** (`.claude/skills/api-engineer/SKILL.md`)
   and the UI slice to **`web-engineer`** (`.claude/skills/web-engineer/SKILL.md`).
8. Backend slice honours, by citing the real guides:
   - the archive transition modelled as an **FSM** (enum + `*-state.machine.ts`),
     citing `apps/api/dev/ai/how-to/state-machines.md` – not a free `update({status})`.
   - the archive event emitted via **`OutboxService.append(tx, …)` inside the same
     `prisma.$transaction(async tx => …)`** that writes the state, citing
     `apps/api/dev/ai/how-to/transactions.md` and/or `apps/api/dev/ai/how-to/outbox-and-reactions.md`,
     with the event type added to `@uprise/events` (`packages/dev/ai/how-to/events-catalogue.md`).
   - the endpoint gated with **`@RequirePermission`** (CASL / `@uprise/permissions`),
     citing `apps/api/dev/ai/how-to/permissions.md`. Gating is opt-in: the `AbilityGuard`
     allows any undecorated route (`if (!required) return true`) and nothing scans for the
     decorator, so the new turf-archive endpoint must carry it as a convention – a missing
     one silently leaves it reachable by any authenticated user. Not a default-deny guarantee.
   - an **additive migration applied with `prisma migrate deploy`** (never `migrate dev`),
     citing `apps/api/dev/ai/how-to/migrations.md`.
9. Frontend slice cites the design-system + permission-gating + feedback-state guides
   (`apps/admin/dev/ai/how-to/design-system.md`, `apps/admin/dev/ai/how-to/permission-gating.md`,
   `apps/admin/dev/ai/how-to/feedback-states.md`, `apps/admin/dev/ai/how-to/app-router-and-api-client.md`)
   for the badge + hidden action.

### MUST – terminate at the gate, then review

10. Walks the gate **`dev/ai/how-to/definition-of-done.md`** with evidence: `pnpm -r typecheck`,
    `pnpm --filter api test` **including the `app.module.boot.spec.ts` boot smoke**, build of
    the changed web app, and the security line for the new endpoint.
11. Ends at **`uprise-review`** (`.claude/skills/uprise-review/SKILL.md`) against the diff and
    only declares done once it is clean. A run that declares done without review fails.

### SHOULD – quality signals (not pass/fail, but a strong run shows them)

- Names `dev/ai/guide-map.md` as the first read.
- Sequences explicitly: backend (schema + FSM + event + endpoint) → web (badge + gated
  action), with the reason (web needs the API first).
- Reads `dev/ai/how-to/domain-modelling.md` only if it (correctly) judges this an extension
  of an existing aggregate rather than a brand-new domain – a new full domain-modelling pass
  here would be over-scoping.

## Automatic fail conditions

- References a story board, Plane, epics, a dev/product registry, or any tracker – uprise
  is board-free.
- Uses any slingshot idiom: `@Transactional`, `EntityManager`, `RequestContext`, MikroORM,
  `ZodValidationPipe`, admin-RPC-POST, `BaseCommandHandler`.
- Recommends `prisma migrate dev`.
- Emits the domain event outside the state-writing transaction.
- Declares done with no gate evidence, or without running `uprise-review`.
- Auto-spawns sub-agents despite no multi-agent opt-in.
- Contains an em-dash character (must use spaced en-dashes); non-Australian spelling.

## Scoring

- All 11 MUST items met, no automatic-fail triggered → **PASS**.
- Any MUST missed or any automatic-fail triggered → **FAIL** (note which).
