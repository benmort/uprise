---
name: uprise-dispatch
description: Turn a task description into a self-contained dispatch brief and a fresh git worktree for a cold agent. Use when handing work to a sub-agent or a new session, "dispatch this", "write a brief", "prep a worktree", or "spin up an agent for this task".
---

# Uprise dispatch

Prepare a cold agent to execute a unit of work it cannot see the context for. The input is a **task description** – a paragraph of what to build – not a tracker item. uprise is board-free: there is no Plane, no stories/epics, no dev/product registry. The unit of work is the task brief you are about to write, backed by the plan file / TODO notes / a docs runbook.

Output is two things: a **dispatch brief** the agent reads first, and a **git worktree** it runs in.

## Read first

- `dev/ai/guide-map.md` – route the task to the guides that fit it; the brief cites those, not guesses.
- `dev/ai/how-to/prompting-agents.md` – the house style for phrasing the brief.
- `dev/ai/how-to/definition-of-done.md` – the gate the brief tells the agent to walk.
- `dev/ai/how-to/development-cycle.md` – where dispatch sits in the cycle (multi-layer / fan-out work).

## Invariants

- **Cite, don't paste.** Name the Canonical file the pattern lives in and let the agent read it – do not paste code or context it can read itself (`dev/ai/how-to/prompting-agents.md`).
- **Imperatives stated once.** Plain "do X" lines; no hedging, no repetition (`dev/ai/how-to/prompting-agents.md`).
- **The gate is non-optional.** Every brief states the same gate: `pnpm --filter api test` green **including the `app.module.boot.spec.ts` boot smoke** (the DI gate – typecheck/build miss provider-resolution bugs), plus the DoD security line. Cite `dev/ai/how-to/definition-of-done.md`.
- **Bound the blast radius.** State what is out of scope and which actions need confirmation before the agent runs them: applying a migration to a real database, mass external sends, destructive data ops, deletions the agent did not create (`dev/ai/how-to/development-cycle.md` blast-radius gates).
- **Evidence, not assertions.** The brief requires the agent to hand back commands-run + counts, and to flag anything it did not verify.
- **One worktree per dispatch.** The agent runs in its own worktree off a fresh base, never on the caller's working tree.

## Brief contract

The brief is a single document with these sections, in order. Anything missing means the agent will guess.

1. **Task** – one or two imperative sentences: what to build, restated from the task description. No "should" / "consider".
2. **Read-first inputs** – the guides the task routes to (from `guide-map.md`) **and** the Canonical uprise files those guides name. Cite by repo-relative path. This is the section the agent reads before touching code.
3. **The work** – the concrete steps / surface to change, in imperatives. Name the schema namespace, event, FSM, endpoint, or queue involved. Keep diffs minimal; rebuild any `@uprise/*` dist touched.
4. **Deliverables** – the files/behaviour expected to exist at the end, and the new test(s) covering new behaviour.
5. **Gate** – verbatim: `pnpm --filter api test` green incl. the `app.module.boot.spec.ts` boot smoke; `pnpm -r typecheck` green; the DoD security line (new/changed endpoints carry `@RequirePermission`; webhooks `claim`-guard; DTOs class-validator-validated; no secret/PII in logs); state+event writes atomic via `OutboxService.append(tx, …)`; migrations additive via `prisma migrate deploy`. Cite `dev/ai/how-to/definition-of-done.md`.
6. **Blast-radius boundary** – what is out of scope, and the confirmation-gated actions (real-DB migration apply, mass sends, destructive/foreign deletions). The agent surfaces these, it does not run them.
7. **Success criteria** – the observable end-state plus the hand-off shape: commands-run + counts, anything unverified declared as such.

## Workflow

1. **Route.** Read `dev/ai/guide-map.md`; pick every row that fits the task. Open those guides; note their Canonical files.
2. **Draft the brief.** Fill the seven sections above in `prompting-agents.md` style. Pull the gate text from `definition-of-done.md` and the confirmation-gated actions from `development-cycle.md`. Write it to the plan file or a TODO note the agent can open – do not leave it only in chat.
3. **Prepare the worktree.** Use the `EnterWorktree` tool with a task-named worktree (state lives under `.claude/worktrees/`, which is gitignored). It branches off a fresh base. The cold agent runs there so the caller's tree is untouched.
4. **Hand off.** Point the agent at the brief (read-first) and the worktree. State that the gate and blast-radius boundary are binding.

## Anti-patterns

- Treating the input as a story / tracker item, or inventing an epic, ticket, or registry id – uprise is board-free.
- Pasting code or whole-file context into the brief instead of citing the Canonical file (`dev/ai/how-to/prompting-agents.md`).
- Omitting the boot smoke from the gate – a green typecheck and build still ship a broken DI graph.
- Leaving scope open ("make it production-ready") with no deliverables or success criteria.
- Letting the agent run confirmation-gated actions (real-DB migration, mass send, foreign deletion) because the brief never named them.
- slingshot idioms in the work section: `@Transactional`, `EntityManager`, `RequestContext`, MikroORM, `ZodValidationPipe`, admin-RPC-POST, `BaseCommandHandler`. uprise uses `prisma.$transaction(async tx => …)`, class-validator DTOs, `@RequirePermission` + CASL, `OutboxService.append`, enum + `*-state.machine.ts` FSMs, BullMQ `DispatchQueue` with idempotent `getXJobId`.
- Running the brief on the caller's working tree instead of a dedicated worktree.

## Checklist

- [ ] Task routed via `guide-map.md`; the guides + their Canonical files cited as read-first inputs.
- [ ] Brief has all seven sections; imperatives stated once; nothing pasted that could be cited.
- [ ] Gate stated verbatim incl. the `app.module.boot.spec.ts` boot smoke and the security line (cite `definition-of-done.md`).
- [ ] Blast-radius boundary names the out-of-scope surface + the confirmation-gated actions.
- [ ] Success criteria require evidence (commands-run + counts) and flag the unverified.
- [ ] A task-named worktree prepared via `EnterWorktree`; brief written to the plan/TODO, not only chat.

## Related guides

- `dev/ai/how-to/prompting-agents.md` – the phrasing style this skill applies.
- `dev/ai/how-to/definition-of-done.md` – the gate the brief states.
- `dev/ai/how-to/development-cycle.md` – the blast-radius gates and where dispatch fits.
- `dev/ai/guide-map.md` – the router the read-first inputs come from.
