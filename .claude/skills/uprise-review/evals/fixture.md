# uprise-review eval fixture

Frozen input for the uprise-review eval. A cold session runs the skill against this exact diff and is graded against `answer-key.md`.

## Diff under review

- **Commit:** `f02090d0e165dfcd6c2e98e094c2750be9924715`
- **Short:** `f02090d`
- **Subject:** `fix(parity): close adversarial-verification findings (M3/M4/M5)`
- **Range to review:** `git show f02090d` (single commit; parent is `f02090d~1`).

## Brief / claims the commit makes (the claims-vs-evidence target)

The commit message states it closed three flagged issues plus the test gaps:

1. **M3** – the email webhook `delivered` / `bounce` / `dropped` paths "wrote state then appended the outbox event in a SEPARATE transaction (non-atomic + could emit on a rejected transition). `transitionTx` now runs the update + append in one tx and only emits when the move actually applied."
2. **M4** – `billingEmailFor` queried `Customer` by `tenantId` only, so payments on a network-scoped customer "silently skipped receipt/refund emails. Now falls back to the tenant's network customer."
3. **M5** – `RegistrationService.register` "issued a session without emitting `iam.user.signed-in` (unlike every grantSession path). Now emits it."
4. **Tests** – added `email.email.clicked` + `delivered` (atomic, no spurious-append) coverage, and a network-customer fallback receipt test.

## Files changed (6)

```
apps/api/src/common/reactions/domain-reactions.spec.ts
apps/api/src/common/reactions/domain-reactions.ts
apps/api/src/email/email.service.spec.ts
apps/api/src/email/email.service.ts
apps/api/src/tenants/registration.service.spec.ts
apps/api/src/tenants/registration.service.ts
```

## How to reproduce the inputs

```
git show f02090d                              # the diff
git show f02090d~1:apps/api/src/email/email.service.ts   # parent state (provenance)
git log -p f02090d -- apps/api/src/email/email.service.ts
```
