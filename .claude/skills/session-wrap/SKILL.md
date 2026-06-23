---
name: session-wrap
description: End-of-session close-out for yarns – DoD validation, remaining-work sweep, honest git posture, and a memory check, ending in a safe-to-leave verdict. Use when wrapping up, ending a session, "are we good to leave this", "close this out", or before stepping away from a branch.
---

# Session wrap

The honest close-out of a work session. Not a repo audit – scoped strictly to what *this session* touched. The output is four gates reported with evidence, then a one-line verdict: safe to leave, or not yet (with the blocker named).

Board-free: the unit of work is the task brief / plan file / TODO notes / docs runbook in front of you, not a tracker. Wrap reports against those, not against stories or epics.

## Invariants

- **Scoped to the session, never the repo.** Validate what changed this session (`git status`, `git diff`, the plan/brief), not the whole tree. A clean wrap of a one-file change does not walk the whole codebase.
- **Evidence, not assertion.** Every gate states what was run and the result (counts, command, branch name) – the same bar as `dev/ai/how-to/definition-of-done.md`. "Tests should pass" is not a wrap.
- **Honest posture over a tidy story.** Uncommitted, unpushed, or unverified is reported plainly. The verdict serves the next person (or the next you), so it never rounds up.
- **No silent fixes during wrap.** Wrap reports state; it does not start new work. If a gate fails, name it in the verdict – don't quietly patch and re-wrap without saying so.

## The four gates

### 1. DoD validation
Walk `dev/ai/how-to/definition-of-done.md` against **what the session touched** – do not restate the guide, verify it. For each line that applies to this session's changes, state the evidence:
- Typecheck run (`pnpm -r typecheck` or the `--filter`s you touched) – paste the result.
- `pnpm --filter api test` green incl. the `app.module.boot.spec.ts` boot smoke (the DI gate typecheck/build miss); new behaviour has a test or the exception is justified.
- Changed apps/packages built; any edited `@yarns/*` dist rebuilt.
- Security: new/changed endpoints carry `@RequirePermission` (CASL via `@yarns/permissions`); webhooks `claim`-guard; DTOs class-validator-validated.
- State+event writes atomic – `OutboxService.append(tx, …)` inside the same `prisma.$transaction`; FSM transitions via the `*-state.machine.ts` guard.
- Migrations additive, applied with `prisma migrate deploy` (never `migrate dev`); client regenerated; `@yarns/db` rebuilt.

Lines that don't apply (docs-only session, no migration, no new endpoint) are marked N/A with one word of why – not silently dropped.

### 2. Remaining-work sweep
List the unfinished threads this session leaves open: the plan-file or brief items not yet done, in-code `TODO`/`FIXME` left behind, deferred follow-ups, and anything declared unverified in gate 1. Pull from the plan/brief and a quick scan of the session's own diff (`git diff`), not a repo-wide TODO hunt. If nothing is outstanding, say so explicitly.

### 3. Git posture
One honest line on where the tree stands: current branch; what is committed vs still uncommitted (staged + unstaged, with file count); whether the branch is pushed or local-only. Commit/push only if the user asked – wrap *reports* posture, it doesn't change it. Keep the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` line on any commit the user does request.

### 4. Memory check
Decide whether anything durable from this session should persist, per the repo's memory convention (the memory dir holds per-topic `.md` files; `MEMORY.md` is the index). Durable = build state of a multi-session feature, a non-obvious gotcha, an intentional "do not do X" decision – not routine one-off changes. If yes: write/update the topic file (frontmatter `node_type: memory`, `[[wikilink]]` cross-refs to related memories) and add or update its row in `MEMORY.md`. If no, say "nothing durable" and why. Saving memory is itself a session action, so report it.

## Workflow

1. Establish scope: read the plan file / task brief, then `git status` + `git diff --stat` to see what this session actually changed.
2. Gate 1 – run/confirm the DoD lines that apply to those changes; state evidence per line, N/A the rest.
3. Gate 2 – sweep the plan/brief + diff for unfinished threads and TODOs.
4. Gate 3 – `git branch --show-current`, `git status --porcelain`, and an upstream check (e.g. `git status -sb`) for the one-line posture.
5. Gate 4 – judge durability; write/update the memory file + `MEMORY.md` row if warranted.
6. Verdict – one line: **safe to leave** (all gates clean, posture honest) or **not yet** + the single blocker that must clear first.

## Anti-patterns

- Auditing the whole repo instead of the session's footprint – wrap is scoped to what changed.
- Restating `definition-of-done.md` instead of verifying it against this session's diff.
- "All green" with no command output – that is an assertion, not a wrap.
- Reporting the branch as clean while a `git status` shows uncommitted changes – posture is honest or it is worthless.
- Quietly committing/pushing during wrap without being asked.
- Saving a memory file but forgetting the `MEMORY.md` index row (or vice versa) – the index and the file move together.
- Skipping the memory gate on a multi-session feature, so the next session re-discovers the build state.

## Checklist

- [ ] Scope established from plan/brief + `git diff --stat`.
- [ ] Gate 1: DoD lines that apply verified with evidence; non-applicable lines N/A'd. (cites `dev/ai/how-to/definition-of-done.md`)
- [ ] Gate 2: unfinished threads + TODOs listed (or "none outstanding").
- [ ] Gate 3: one honest posture line – branch, committed vs uncommitted, pushed vs local.
- [ ] Gate 4: durability judged; memory file + `MEMORY.md` row written if warranted (or "nothing durable" + why).
- [ ] One-line verdict: safe to leave / not yet + blocker.

## Related guides

- `dev/ai/how-to/definition-of-done.md` – the evidence gate this wrap validates against.
- `dev/ai/how-to/development-cycle.md` – the hand-off step a wrap closes.
