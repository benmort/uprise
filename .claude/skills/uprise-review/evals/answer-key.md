# yarns-review eval – answer key

Grades a cold run of `yarns-review` against the diff frozen in `fixture.md` (commit `f02090d`). The graded session cannot see this file. A correct review must surface the substantive items below, fire the provenance check, and raise no false criticals.

## Setup the run must do

- Pin the range as `git show f02090d` (single commit, 6 files, parent `f02090d~1`).
- Route the changed files through the right guides and cite them: `apps/api/dev/ai/how-to/outbox-and-reactions.md` + `apps/api/dev/ai/how-to/transactions.md` (email + registration state/event writes), `apps/api/dev/ai/how-to/state-machines.md` (the `canTransitionEmail` guard in `transitionTx`), and `dev/ai/how-to/definition-of-done.md` (the gate). Naming the guide-map router (`dev/ai/guide-map.md`) is expected.

## Must-surface substantive items

A passing review names each of these, with the right `file:line` region and the proving evidence.

1. **M3 atomicity claim verified – and credited as a FIX, not flagged as a regression.**
   - `email.service.ts`: the `delivered` / `bounce` / `dropped` cases now do the `tx.email.update` (via `transitionTx(tx, …)`) and the `outbox.append(tx, …)` inside ONE `prisma.$transaction(async (tx) => …)`, and `if (!applied) return;` skips the append on a rejected/terminal transition. Claim = **verified**.
   - **Provenance (mandatory):** the parent `f02090d~1:apps/api/src/email/email.service.ts` had `transition()` doing the `update` on `this.prisma` and then a *separate* `$transaction` for the append – so the non-atomicity and the spurious-append-on-rejected-move are **pre-existing**, and this commit closes them. A correct review states it ran `git log -p` / read the parent, and does NOT call the old non-atomic pattern a regression introduced here. **Flagging this commit as introducing non-atomicity is a disqualifying false positive.**

2. **`open` / `click` paths were already atomic – not touched, not a new gap.**
   - In `email.service.ts` the `open` and `click` cases already wrapped `tx.email.update` + `outbox.append(tx, …)` in one `$transaction` before this commit (parent state). A review may note they use a different (inline) shape than `transitionTx`, but must NOT flag them as a regression or a new bug. Provenance covers this.

3. **M4 network-customer fallback verified.**
   - `domain-reactions.ts` `billingEmailFor`: now returns the tenant-direct customer email, else looks up `tenant.networkId` and falls back to the earliest `Customer` with that `networkId`. Claim = **verified**. A thorough review notes the ordering is deterministic (`orderBy: createdAt asc`) and that a null `networkId` falls through to `return null` (the reaction then skips, as documented). No cross-schema FK is introduced – id-only lookups, consistent with house rules.

4. **M5 `iam.user.signed-in` emit verified – with a residual non-atomicity worth a low/medium finding.**
   - `registration.service.ts` `register`: now appends `iam.user.signed-in` after `sessions.create`. Claim = **verified** (the event is emitted).
   - **Residual finding (expected, low/medium, NOT critical):** the `iam.user.signed-in` `outbox.append` runs in its OWN `prisma.$transaction` AFTER `this.sessions.create(...)`, so a crash between granting the session and appending the audit event loses the event – the same outbox-after-the-fact shape `apps/api/dev/ai/how-to/outbox-and-reactions.md` warns against. A strong review flags this with `file:line` and the guide cite, and correctly rates it low/medium: the session (not the audit event) is the source of truth, and **this same ordering is the established pattern on every other `grantSession` path** – so a review that calls it a *new* defect without checking that the pattern pre-exists has skipped provenance. Either "consistent-with-house-pattern, low" or "should fold into the session tx, medium" is acceptable; rating it critical/high is wrong.

5. **Test claims verified against the specs, not asserted.**
   - `email.service.spec.ts`: confirms a `delivered` test asserts the state move AND a single atomic append (no spurious append), and a `clicked` test exists. `domain-reactions.spec.ts`: confirms a network-customer fallback receipt test. A review must open these and confirm they exercise the new behaviour (would fail without the fix), not merely note the spec files changed. Claim = **verified** only if the assertions actually cover atomicity / fallback.

## Census / scope checks expected

- A `grep` over the changed services for `this.prisma` used *inside* a `$transaction` callback (the wrong client) – mechanically, not sampled. Correct result: the three fixed cases now use `tx`; the residual registration append is its own transaction (so its `this.prisma.$transaction` is correct usage, just non-atomic with the session write).
- A `grep` for slingshot-isms over the range (`@Transactional`, `EntityManager`, `RequestContext`, `ZodValidationPipe`, `migrate dev`) – expected count **zero**. A review that flags `prisma.$transaction` or class-validator usage as a smell has failed the yarns-not-slingshot rule.

## Validation expected

- `pnpm --filter api test` (incl. `app.module.boot.spec.ts`) and `pnpm --filter api typecheck`, layer-scoped – NOT a repo-root `pnpm -r test`. If the session cannot run them (no install / no DB), that must land in the **unverifiable** list, not be reported as green.

## Unverifiable list (must be explicit)

A passing review explicitly lists what it could not confirm – e.g. test/typecheck results if it did not run them, or any runtime DB behaviour. An empty unverifiable section is only acceptable if the session actually ran the suite and says so.

## Verdict

- Acceptable verdict: **approve-with-nits** or **changes-requested** driven solely by item 4 (the residual registration outbox-after-session non-atomicity). Either is defensible.
- The three claimed fixes are real and verified; there is **no critical** in this diff.

## Disqualifying failures (any one = fail)

- Flagging the email-webhook non-atomicity as a regression introduced by this commit (ignores provenance; it is the bug being fixed).
- Flagging `open`/`click` as new bugs.
- Rating the registration residual as critical/high, or missing it entirely.
- No provenance step / no `git log -p` (or parent read) evidence in the verdict.
- A census claim ("all paths now atomic", "no `this.prisma` misuse") asserted without a `grep` + count.
- Reporting a blanket repo-root test pass instead of `--filter`-scoped, or claiming green without running and without an unverifiable note.
- Treating any yarns idiom (`prisma.$transaction`, class-validator DTO, `@RequirePermission`/CASL, `OutboxService.append`) as a defect.
- Presenting a slingshot construct (`@Transactional`, `EntityManager`, `RequestContext`, MikroORM, `ZodValidationPipe`, admin-RPC-POST, `BaseCommandHandler`) as the yarns way, or recommending `prisma migrate dev`.
- Inventing a board/story/epic/tracker id as the review's unit of work (yarns is board-free; the unit is the commit `f02090d`).
- Flagging a missing `@RequirePermission` on these diffs as auto-protected: nothing in this commit adds an endpoint, but if a review reasons about route security it must not claim undecorated routes are default-denied (the `AbilityGuard` allows them).
- Emitting an em-dash (the long-dash character) anywhere in the review, or using US spelling where Australian is expected.
