---
name: module-wiring
description: Wire a Nest module per domain, mark cross-cutting modules @Global, and pass the DI boot smoke.
layer: api
topic: di-wiring
use_when: Adding a domain module, registering a provider, or chasing a "can't resolve dependency" boot crash.
last_reviewed: 2026-06-23
---

# Module wiring

How to wire a Nest module into the uprise API so the full DI graph still compiles.

Canonical: `apps/api/src/app.module.ts` (the `imports[]` aggregate), `apps/api/src/app.module.boot.spec.ts` (the DI boot smoke), `apps/api/src/common/outbox/outbox.module.ts` (`@Global() OutboxModule`), `apps/api/src/common/reactions/reactions.module.ts` (`REACTIONS` provided via `useFactory` + `inject`).

## Must have
- One Nest module per domain (`PaymentModule`, `BlastsModule`, `WhatsappModule`, …). It declares the domain's controllers + providers and `exports` only what other modules legitimately consume.
- Add the module to the `imports[]` array in `AppModule` – nothing wires itself.
- Mark a module `@Global()` only for genuinely cross-cutting infrastructure that every domain may inject without re-importing: `OutboxModule` (so any service can `OutboxService.append(tx, …)` in its own transaction), plus the global logging/Prisma/WebhookEvent/Messaging seams. `OutboxModule` is the exemplar – `@Global()` + `exports: [OutboxService]`.
- For a provider whose value depends on other (global) services, bind a token via `useFactory` + `inject`, as `ReactionsModule` does for `REACTIONS`: the factory receives `PrismaService`, `EmailService`, `StripeService`, `BillingService`, `ConfigService`, `DomainLogger` and returns the built list. Do not `new` those deps inside the factory.
- Cross-domain seams are bound to a token (e.g. `TRANSACTIONAL_DISPATCHER` via `useExisting`), not exported as the concrete class – consumers inject the token.
- After any wiring change, `app.module.boot.spec.ts` MUST pass. It `.compile()`s the whole graph, running every constructor – the ONLY gate that catches provider-resolution regressions. Typecheck, `nest build` (compile-only), and unit tests (which `new` services with mocks) all pass while a missing `@Global()` or unprovided token crashes `pnpm dev:all` at startup.

## Anti-patterns
- Sprinkling `@Global()` to "fix" a resolution error – re-import the providing module, or export the provider, instead. Reserve `@Global()` for true infrastructure.
- Adding a provider to a module but forgetting to `exports` it, then injecting it from another module.
- `new`-ing a service inside a `useFactory` instead of listing it in `inject`.
- Declaring a new module and never adding it to `AppModule.imports` – it silently does nothing.

## Checklist
- [ ] New domain code lives in exactly one module; that module is in `AppModule.imports`.
- [ ] Anything injected from another module is in that module's `exports` (or its module is `@Global()` infra).
- [ ] Factory-built providers list every dep in `inject`; nothing is `new`-ed inside.
- [ ] `pnpm --filter api test` green, INCLUDING `app.module.boot.spec.ts`.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/outbox-and-reactions.md` – the outbox/reactions backbone wired here.
- `apps/api/dev/ai/how-to/services-controllers-dtos.md` – what goes inside a domain module.
- `apps/api/dev/ai/how-to/testing-unit.md` – why the boot smoke catches what unit tests miss.
