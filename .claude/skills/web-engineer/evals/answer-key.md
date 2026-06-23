# Eval: web-engineer

Grades a cold run of the `web-engineer` skill against the frozen brief in `fixture-task-brief.md`
("add a settings page that lists the tenant's payment methods"). The grader holds this key; the run does not.

A correct run produces a frontend plan – not backend code – that names the invariants in scope, cites the right guides
by their real repo-relative paths, and applies each to the four parts of the brief (list / route+gate / fetch / remove action).

## Must cite (real guide paths)

The run must read `dev/ai/guide-map.md` first, then cite these guides by their actual paths. All four are mandatory; web-security is bonus context (no credential touch here).

- [ ] `apps/admin/dev/ai/how-to/design-system.md` – rendering the list/rows/buttons from `@yarns/ui`.
- [ ] `apps/admin/dev/ai/how-to/feedback-states.md` – the four states on a data surface.
- [ ] `apps/admin/dev/ai/how-to/permission-gating.md` – the billing-permission gate.
- [ ] `apps/admin/dev/ai/how-to/app-router-and-api-client.md` – the route + the typed fetch.
- [ ] (bonus) `packages/dev/ai/how-to/permissions-package.md` – where the ability/role the gate derives from is defined.

A run that cites a guide path that does not exist, or names a slingshot/board artefact, fails regardless of other content.

## Must assert (graded points)

**Design system (from design-system.md)**
- [ ] Builds the list, rows and the Remove button from `@yarns/ui` primitives (e.g. `Card`/list markup, `Button`, `EmptyState`, `Skeleton`) via the `@/components/ui/*` shim – does not fork or hand-roll a primitive.
- [ ] Colours come from design tokens (`bg-surface`, `text-foreground`, `border-border`, etc.) – **no raw hex**. Names this explicitly.

**Feedback states (from feedback-states.md)**
- [ ] Renders all four: loading (`Skeleton`), empty (`EmptyState` – "no payment methods" is a success, with the add CTA where sensible), error (toast or inline on `res.ok === false`), no-permission.
- [ ] Checks `ApiResult.ok` before reading `res.data`; no infinite spinner, no swallowed error.

**Permission gating (from permission-gating.md)**
- [ ] Derives the gate from the session principal (`getSession()` → `AuthPrincipal`) / the `@yarns/permissions` CASL ability – not an ad-hoc `role === "ORGANISER"` string check.
- [ ] **Hide for permission:** an organiser without billing permission (and a canvasser) does not get the page/control rendered – shows the no-permission state rather than a dead control.
- [ ] **Disable for transient:** the per-row Remove button stays visible but `disabled` while its removal is in flight – not hidden.
- [ ] States that UI gating is advisory and the matching API route must be `@RequirePermission`-gated server-side.

**App Router + API client (from app-router-and-api-client.md)**
- [ ] New page lives in the `(main)` route group (organiser shell); covered by the middleware matcher as a protected route.
- [ ] Fetches via `@yarns/api-client` `request<T>` / a `lib/api` helper – **not a bare `fetch`** to the API; reads the base via `getApiUrl()`, not a hardcoded host.
- [ ] Types the payment-method shape from `@yarns/contracts`, not a local re-declared interface.
- [ ] `"use client"` is scoped to the interactive island (the list with the Remove action), not slapped on the whole page.

**Close (from `dev/ai/how-to/definition-of-done.md`)**
- [ ] Ends on the DoD gate: `pnpm -r typecheck` green, and the Next build (`pnpm --filter admin build`) run as the real check for any Tailwind/config change. Evidence stated, not asserted.

## Auto-fail conditions

- References Plane, a story/epic, or a dev/product registry (yarns is board-free – the unit of work is the task brief / plan file / runbook).
- Names a slingshot artefact (`@Transactional`, `EntityManager`, `RequestContext`, MikroORM, `ZodValidationPipe`, admin-RPC-POST, `BaseCommandHandler`).
- Proposes a raw hex colour, a bare `fetch` to the API, a login form / credential / secret in `apps/admin`, or reading `auth_token` from JS.
- Cites a guide path that does not exist in the repo.
- Outputs an em-dash character, or uses US spelling where Australian is expected.

## Pass bar

All five "must cite" mandatory paths present (design-system, feedback-states, permission-gating, app-router-and-api-client read; permissions-package is bonus),
every "must assert" box defensible from the run's output, zero auto-fail conditions.
