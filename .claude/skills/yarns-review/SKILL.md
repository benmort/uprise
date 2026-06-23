---
name: yarns-review
description: Guide-aware, evidence-based code review of a yarns diff – routes every changed file through its layer guide, verifies claims against the actual code/tests, and returns a severity-ranked verdict with file:line + confidence. Use when reviewing a branch, a commit set, or a PR; when asked to "review this diff", "is this safe to merge", "check this against house conventions", or to second-opinion a change touching the outbox, FSMs, permissions, migrations, webhooks, or transactions.
---

# yarns review

Review a yarns diff against the house conventions, with evidence. Every finding cites `file:line`, states a confidence, and is backed by the code or test that proves it – never by assertion. The output is a verdict a human can act on without re-reading the diff.

Read `dev/ai/guide-map.md` first. It routes each changed file to its layer guide; this skill turns those guides into a checklist run over the actual change.

## Authority

The built-in harness `code-review` skill is for **throwaway diffs** – quick correctness and cleanup passes you do not need to defend. Use **this** skill when the change touches a house convention: anything under the api outbox / transactions / FSM / permissions / webhooks / migrations / module-wiring surface, any `@yarns/*` package, any new endpoint or migration, or any diff headed for `main`. When in doubt, this skill is the authority; the built-in one is the fast path only.

## Artefact contract

**Consumes**

- A diff to review, identified as one of: a branch (`git diff main...HEAD`), a commit set (`git show <sha>`, `git diff <a>..<b>`), or a PR (`gh pr diff <n>`). Pin the exact range you reviewed and state it in the verdict.
- Optionally the task brief / plan file / TODO notes / docs runbook the change implements. There is **no** board, no story, no epic, no dev/product registry in yarns – the unit of work is the brief or the plan file. If a brief is supplied, the claims-vs-evidence check measures the diff against it; if not, against the commit message and the guides.

**Produces** – a single verdict with these sections:

1. **Scope** – the exact diff range reviewed, file count, and which layer guides applied (cite each by repo-relative path).
2. **Findings** – severity-ranked (`critical` / `high` / `medium` / `low` / `nit`), each with `file:line`, a one-line statement, the evidence (the code or test that proves it, quoted or referenced), and a confidence (`high` / `medium` / `low`). A finding with no evidence does not ship – it goes in the unverifiable list.
3. **Claims vs evidence** – every claim the commit message / brief makes ("now atomic", "added a test", "row-locked"), each marked `verified` (with the proving file:line) or `unverified`.
4. **Unverifiable** – an explicit list of everything you could not confirm by running or reading, and why (no DB reachable, generated client not built, etc.). Silence here is a failure; an empty list must be a deliberate "nothing was unverifiable", not an omission.
5. **Verdict** – `block` / `changes-requested` / `approve-with-nits` / `approve`, with the one or two findings that drive it.

## Method

### 1. Route every changed file through its layer guide

`git diff --name-only` the range, then for each file open the matching row in `dev/ai/guide-map.md` and run that guide's **Must have** + **Anti-patterns** against the change:

- `apps/api/src/**` state-write + event → `apps/api/dev/ai/how-to/outbox-and-reactions.md` + `apps/api/dev/ai/how-to/transactions.md` (append is INSIDE the same `prisma.$transaction` as the row write; no append in a second transaction or after the callback closes).
- status change → `apps/api/dev/ai/how-to/state-machines.md` (goes through the `*-state.machine.ts` guard on a row loaded `FOR UPDATE`, never an ad-hoc status branch).
- new/changed endpoint → `apps/api/dev/ai/how-to/permissions.md` (`@RequirePermission` + CASL via `@yarns/permissions`, or a justified `isPublicWebhookPath` allowlist entry; DTOs are class-validator-validated).
- provider webhook → `apps/api/dev/ai/how-to/webhooks.md` (raw-body signature verify, `claim` before side effects, `release` on throw).
- BullMQ job → `apps/api/dev/ai/how-to/bullmq-jobs.md` (stable idempotent `getXJobId`).
- migration → `apps/api/dev/ai/how-to/migrations.md` (additive, hand-written, `prisma migrate deploy` – never `migrate dev`; client regenerated; `@yarns/db` rebuilt).
- Nest module wiring → `apps/api/dev/ai/how-to/module-wiring.md` (provider resolvable; the boot smoke is the only check that catches a DI break).
- `apps/admin/src/**` → `apps/admin/dev/ai/how-to/app-router-and-api-client.md`, `design-system.md`, `feedback-states.md`, `permission-gating.md`, `web-security.md` as the file fits.
- `packages/**` → the matching `packages/dev/ai/how-to/*` guide; an edit to a package `src` without a dist rebuild leaves consumers on the old build.

### 2. Verify claims against the actual code and tests – never assert

For each thing the commit message or brief says it did, open the file and confirm it. "Made the email webhook atomic" → read the handler and confirm the `update` and the `outbox.append` share one `prisma.$transaction(async (tx) => …)` and both use `tx`. "Added a test" → open the spec and confirm it exercises the new behaviour and would fail without the fix, not just that a test file changed. If you cannot confirm it by reading or running, it is `unverified`, not assumed-true.

### 3. PROVENANCE-BEFORE-REGRESSION

Before calling any behaviour a **regression**, prove the diff introduced it. Run `git log -p <range> -- <file>` (or `git show <range>~1:<file>`) and read the parent state. If the pattern you are about to flag already existed before this change, it is a **pre-existing gap**, not a new bug introduced here – say so and downgrade it (note it, do not block on it). A pre-existing non-atomic write that this commit actually *fixes* must be credited as a fix, never flagged as if the commit caused it. This check is mandatory and must appear in the verdict (state that provenance was checked and what it showed).

### 4. Census claims rebuilt mechanically, never sampled

Any "all / every / none" claim – "every endpoint has `@RequirePermission`", "no `this.prisma` left inside a callback", "all webhook paths are allowlisted" – is rebuilt with `grep` over the **full** changed scope, not a few spot-checks. State the command and the count. "I looked at a couple and they were fine" is not a census. Examples:

```
grep -rn "@Post\|@Get\|@Patch\|@Delete" <changed controllers>   # then confirm each carries @RequirePermission or is allowlisted
grep -rn "this\.prisma" <changed service>                        # inside a $transaction callback this is the wrong client
grep -rn "migrate dev\|EntityManager\|@Transactional\|RequestContext\|ZodValidationPipe" <range>   # slingshot-isms that must be zero in yarns
```

### 5. Run layer-scoped validation, not repo-root

Validate the layers the diff touched, scoped with `pnpm --filter`, never a blunt repo-root run:

- `pnpm --filter api typecheck` and `pnpm --filter api test` for backend changes – the latter includes `app.module.boot.spec.ts`, the **only** check that catches a Nest provider-resolution break (typecheck and build do not).
- `pnpm --filter <pkg> typecheck` / `test` for each `@yarns/*` package touched; rebuild its dist if `src` changed.
- `pnpm --filter <app> build` for a Next app whose Tailwind/config changed – the build is the real gate there.

State each command and its result. If you could not run something (no DB, no built client), that goes in the unverifiable list – do not infer green.

### 6. Walk the DoD security line

Run `dev/ai/how-to/definition-of-done.md` line 4 (security) against every new/changed entry point in the diff: `@RequirePermission` present or a justified allowlist entry; webhooks `claim`-guard before acting; DTOs class-validator-validated; no secret or PII in logs. A missing `@RequirePermission` on a new endpoint is a `critical` – the `AbilityGuard` returns `true` for any undecorated route (`if (!required) return true`) and nothing scans for the gap at boot, so the route silently stays reachable by any authenticated user. Decorating every endpoint is a discipline, not an automatic guarantee, so review must catch it.

## Anti-patterns

- Asserting "looks fine" / "should be atomic" without opening the file – every finding needs evidence or it is unverifiable.
- Calling a pre-existing gap a regression because you did not read the parent (skipping step 3).
- Sampling a census claim instead of `grep`-ing the full scope (skipping step 4).
- Running `pnpm -r test` at repo root and reporting a blanket pass instead of `--filter`-scoping to the touched layers.
- Flagging yarns idioms as wrong because they differ from slingshot – `prisma.$transaction`, class-validator DTOs, `@RequirePermission` + CASL, `OutboxService.append`, enum + `*-state.machine.ts`, BullMQ `getXJobId` are the house conventions, not smells.
- Inventing a board/story/epic to hang the review on – the unit of work is the brief or the plan file.
- A clean-looking verdict with no unverifiable list – if everything was verifiable, say so explicitly.

## Checklist

- [ ] Exact diff range pinned and stated; every changed file routed through its layer guide (guides cited by path).
- [ ] Each commit/brief claim marked `verified` (with file:line) or `unverified`.
- [ ] Provenance checked with `git log -p` before any regression call; result stated.
- [ ] Every census ("all/none") claim rebuilt with `grep` over full scope; command + count stated.
- [ ] Layer-scoped `pnpm --filter` validation run and reported; boot smoke covered for api changes.
- [ ] DoD security line walked for every new/changed entry point.
- [ ] Findings severity-ranked with file:line + evidence + confidence; explicit unverifiable list present; verdict stated.
- [ ] Gate: the change is measured against `dev/ai/how-to/definition-of-done.md`.

## Related guides

- `dev/ai/guide-map.md` – the router every file is checked through.
- `dev/ai/how-to/definition-of-done.md` – the evidence gate the verdict applies.
- `dev/ai/conventions.md` – the commands and the yarns-not-slingshot idioms.
- `apps/api/dev/ai/how-to/transactions.md`, `outbox-and-reactions.md`, `state-machines.md`, `permissions.md`, `webhooks.md`, `migrations.md` – the backend checklists the method routes to.
