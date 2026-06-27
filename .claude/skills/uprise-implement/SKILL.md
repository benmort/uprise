---
name: uprise-implement
description: Worktree-aware orchestrator that takes a task brief from classify to merged – picks a strategy, drives the layer engineers, ends at review. Use when asked to "implement", "build", "do this task", "make this change", or handed a plan/brief/TODO to execute end-to-end.
---

# uprise-implement

The execution orchestrator that sits between a task brief and review. It does not write much code itself – it classifies the work-unit, chooses how to run it, drives the right layer engineer(s), and refuses to declare done until `uprise-review` has passed. Board-free: the unit of work is the task brief, the plan file, or a TODO note – uprise has no story board, no Plane, no dev/product registry.

Read `dev/ai/guide-map.md` first, then `dev/ai/how-to/development-cycle.md` (the work shapes + gates this skill automates) and `dev/ai/how-to/definition-of-done.md` (the gate every run ends on).

## Invariants

- **End at review, always.** No work-unit is "done" until `uprise-review` (`.claude/skills/uprise-review/SKILL.md`) has run against the diff and come back clean. The built-in code-review is for throwaway diffs only.
- **The gate is non-negotiable.** Every run walks `dev/ai/how-to/definition-of-done.md` with evidence – `pnpm -r typecheck`, `pnpm --filter api test` (incl. the `app.module.boot.spec.ts` DI boot smoke), build of changed apps, the security line. Evidence means commands-run and counts, never "should pass".
- **Blast-radius gates stay confirmation-gated.** Destructive data ops, mass external sends, deletions you did not create, and applying a migration to a real database are surfaced and confirmed – never auto-run (`dev/ai/how-to/development-cycle.md`).
- **Capacity-adaptive.** Prepare-and-hand-off is the default. Only auto-spawn sub-agents when the user has opted into multi-agent (ultracode / explicit "use sub-agents" / a stated budget). Without that opt-in, produce the brief + worktree and hand back.
- **Worktree isolation for parallel/large work.** Anything that runs cold or in parallel gets its own git worktree under `.claude/worktrees/` so branches do not collide; single-layer in-session work stays on the current branch.
- **Route, do not re-derive.** Layer patterns live in the layer-engineer skills and the how-to guides – drive those, do not re-explain Prisma/Nest/Next here.

## Artefact contract

A run produces, in order:

1. **A classification** – which layers (api / web / packages), size (S / M / L), blast radius (none / data / external-send / migration).
2. **A strategy** – direct-in-session, route-to-layer, or cold hand-off via dispatch (see Workflow).
3. **The change itself** – on the current branch (direct) or in a worktree (parallel/large), built per the driven engineer's guides.
4. **A gate run** – `definition-of-done.md` walked with pasted evidence.
5. **A review verdict** – `uprise-review` output, clean, before "done" is stated.
6. **A hand-off** – evidence + counts + anything unverified, flagged. Commit only when the user asks, keeping the `Co-Authored-By` line.

## Workflow

### 1. Classify the work-unit

Read the brief / plan / TODO and the files it names. Decide:

- **Layers touched.** Backend (`apps/api`, `packages/db`, `@uprise/events`, `@uprise/permissions`) → api. Next pages/components/design-system → web. A shared `@uprise/*` package → packages (and rebuild its dist – `dev/ai/conventions.md`).
- **Size.** S = one layer, a handful of files, no new domain. M = one layer deep or a small cross-layer slice. L = new domain, multi-layer, or a migration + behaviour + UI.
- **Blast radius.** Does it touch a real DB (migration), send to real recipients (blasts/WhatsApp/email), or delete/alter data you did not create? If yes → confirmation-gated.

For a new domain or substantial aggregate, run `dev/ai/how-to/domain-modelling.md` to shape schema namespace + events + FSM *before* cutting code.

### 2. Choose a strategy

| Classification | Strategy |
|---|---|
| S, single-layer, low blast | **Direct-in-session** – drive the one layer engineer skill in this session, on the current branch. |
| M, one layer (or thin cross-layer) | **Route-to-layer** – drive `api-engineer` (`.claude/skills/api-engineer/SKILL.md`) and/or `web-engineer` (`.claude/skills/web-engineer/SKILL.md`); each routes to its guides. |
| L, multi-layer, parallelisable, or large | **Cold hand-off** – `uprise-dispatch` (`.claude/skills/uprise-dispatch/SKILL.md`) writes a brief + a worktree under `.claude/worktrees/` per the prompting house style (`dev/ai/how-to/prompting-agents.md`). |

Multi-layer that is *not* opted into multi-agent: sequence the layers in this session (backend first so the web has a real API to call), each through its layer engineer, not in parallel.

### 3. Drive the layer engineer(s)

- **Backend** → `api-engineer`. It carries the backend invariants and indexes every `apps/api/dev/ai/how-to/*` + `packages/dev/ai/how-to/*` guide: transactions (`prisma.$transaction(async tx => …)` with the event emitted via `OutboxService.append(tx, …)` in the *same* transaction – `apps/api/dev/ai/how-to/transactions.md`, `apps/api/dev/ai/how-to/outbox-and-reactions.md`), FSMs (enum + `*-state.machine.ts` – `apps/api/dev/ai/how-to/state-machines.md`), permissions (`@RequirePermission` + CASL via `@uprise/permissions` – `apps/api/dev/ai/how-to/permissions.md`, `packages/dev/ai/how-to/permissions-package.md`), DTOs (class-validator – `apps/api/dev/ai/how-to/services-controllers-dtos.md`), BullMQ (`DispatchQueue` + idempotent `getXJobId` – `apps/api/dev/ai/how-to/bullmq-jobs.md`), webhooks (`claim`-guarded – `apps/api/dev/ai/how-to/webhooks.md`), migrations (additive, `prisma migrate deploy` – `apps/api/dev/ai/how-to/migrations.md`), wiring + the boot gate (`apps/api/dev/ai/how-to/module-wiring.md`).
- **Frontend** → `web-engineer`. It carries the frontend invariants and indexes `apps/admin/dev/ai/how-to/*`: app-router + API client (`apps/admin/dev/ai/how-to/app-router-and-api-client.md`), design system (`apps/admin/dev/ai/how-to/design-system.md`), feedback states (`apps/admin/dev/ai/how-to/feedback-states.md`), permission-gating (`apps/admin/dev/ai/how-to/permission-gating.md`), web security (`apps/admin/dev/ai/how-to/web-security.md`).
- For a `@uprise/*` package change, follow `packages/dev/ai/how-to/package-build.md` and rebuild the dist before declaring the consumer working.

State the gate to each engineer up front (`prompting-agents.md`): the api test incl. boot smoke, the security line, the migrate-deploy discipline. Bound their scope and name the confirmation-gated actions.

### 4. Gate, then review

- Walk `dev/ai/how-to/definition-of-done.md` and paste evidence: typecheck, `pnpm --filter api test` (count + boot smoke), build of every changed app/package, the security line per new/changed entry point, atomicity of state+event writes, migration discipline.
- Then run `uprise-review` (`.claude/skills/uprise-review/SKILL.md`) against the diff. If it flags anything, loop back to the relevant engineer – do not hand off with open findings.

### 5. Hand off

Summarise with evidence (commands + counts), flag anything unverified, surface any confirmation-gated action still pending. Commit only when asked. If session-closing, `session-wrap` (`.claude/skills/session-wrap/SKILL.md`) revalidates DoD + updates memory.

## Anti-patterns

- Declaring done before `uprise-review` has run clean.
- Auto-spawning sub-agents when the user did not opt into multi-agent – prepare-and-hand-off is the default.
- Running a parallel/cold work-unit on the current branch instead of a `.claude/worktrees/` worktree – branches collide.
- Auto-running a destructive op, a mass send, or `prisma migrate deploy` against a real DB without confirmation.
- Re-explaining the Prisma/Nest/Next pattern inline instead of driving the layer engineer and citing its guide.
- Building the web client against an API that does not exist yet because the layers ran in the wrong order.
- Skipping the api test because "it's small" – the boot smoke catches DI breaks typecheck cannot (`apps/api/dev/ai/how-to/module-wiring.md`).

## Checklist

- [ ] Work-unit classified: layers, size, blast radius.
- [ ] Strategy chosen against capacity (direct / route-to-layer / cold dispatch); multi-agent only on opt-in.
- [ ] Parallel/large work runs in its own `.claude/worktrees/` worktree; backend sequenced before its web consumer.
- [ ] Right layer engineer(s) driven; guides cited, not re-derived.
- [ ] Blast-radius actions surfaced + confirmed, never auto-run.
- [ ] `definition-of-done.md` gate walked with pasted evidence.
- [ ] `uprise-review` run clean before "done" is stated.
- [ ] Hand-off states evidence + counts + the unverified; commit only when asked.

## Related guides

- `dev/ai/how-to/development-cycle.md` – the work shapes + blast-radius gates this skill automates.
- `dev/ai/how-to/definition-of-done.md` – the gate every run ends on.
- `dev/ai/how-to/prompting-agents.md` – how to phrase the brief handed to each engineer / dispatch.
- `dev/ai/how-to/domain-modelling.md` – shape a new domain before an L-sized build.
- `.claude/skills/api-engineer/SKILL.md`, `.claude/skills/web-engineer/SKILL.md` – the layer engineers driven.
- `.claude/skills/uprise-dispatch/SKILL.md` – cold hand-off brief + worktree.
- `.claude/skills/uprise-review/SKILL.md` – the terminal gate.
