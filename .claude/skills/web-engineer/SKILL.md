---
name: web-engineer
description: Frontend layer-engineer entry point for the uprise web apps (web/auth/marketing) – the invariants every UI change obeys plus a router to every frontend how-to. Use when building or changing any page, component, route, form, settings surface, or auth-touching frontend in apps/admin, apps/auth or apps/marketing.
---

# Web engineer

The entry point for any frontend work in uprise. The unit of work is a task brief, the plan file, or a docs runbook – read it, classify the surface you're building, then route to the guides below and walk their checklists. This skill carries the invariants; the guides carry the patterns.

The apps: the organiser `(main)` shell and the canvasser `(field)` PWA in `apps/admin`, the standalone identity app `apps/auth`, and `apps/marketing`. All four share these invariants.

## Invariants

Every frontend change holds all five. Each maps to a guide that owns the detail.

- **One design system.** `@uprise/ui` (Tailwind v4, CSS-first tokens) is the single source of truth, consumed from source via `transpilePackages` – no build step. Use its primitives (`Button`, `EmptyState`, `Skeleton`, `Field`, `FormDialog`, `StatusBadge`, …) and design tokens (`bg-primary`, `text-foreground`, `bg-warning-container`, `bg-surface`, `border-border`). **Never a raw hex.** Extend the palette by adding an HSL channel var in `:root` and mapping it in `@theme inline` – never a one-off colour. See `apps/admin/dev/ai/how-to/design-system.md`.
- **Four feedback states.** A data surface is not done until it answers all four questions – is it loading, is there nothing, did it fail, am I allowed. Render an explicit branch for each: `Skeleton` (loading), `EmptyState` (empty-is-success), toast/inline (`res.error`), and the no-permission state. No infinite spinner, no swallowed error. See `apps/admin/dev/ai/how-to/feedback-states.md`.
- **Permission-gate the UI.** Gate by the session principal's `role` (`AppRole`) and the CASL ability from `@uprise/permissions`, derived from the role – not ad-hoc `role === "ORGANISER"` string checks. **Hide by default for permission** (don't render a control that will 403); **disable for transient state** (in-flight, unmet precondition). UI gating is advisory – the API is the enforcer. See `apps/admin/dev/ai/how-to/permission-gating.md`.
- **Cookie SSO security.** The session is the parent-domain httpOnly `auth_token` cookie issued by `apps/api`; `apps/admin/src/middleware.ts` bounces unauthenticated users to the standalone `apps/auth`. Frontends never read/write the cookie, never hold a login form or credentials, and never put a secret in a client component or `NEXT_PUBLIC_*`. See `apps/admin/dev/ai/how-to/web-security.md`.
- **Typed API only.** All API traffic goes through `@uprise/api-client`'s `request<T>` (or a `lib/api` helper that wraps it) – never a bare `fetch` to the API. Type with `@uprise/contracts`; branch on the `ApiResult.ok` union before reading `data` or `error`. Keep `"use client"` to the interactive island, not the whole page. See `apps/admin/dev/ai/how-to/app-router-and-api-client.md`.

## Guide index

Read `dev/ai/guide-map.md` first, then read every guide whose row fits the surface you're building.

| Building / changing… | Read |
|---|---|
| Any colour, token, primitive, or restyle | `apps/admin/dev/ai/how-to/design-system.md` |
| A page/route, an API call, server-vs-client choice | `apps/admin/dev/ai/how-to/app-router-and-api-client.md` |
| Loading / empty / error / no-permission on a data surface | `apps/admin/dev/ai/how-to/feedback-states.md` |
| Showing/hiding a control, route, or surface by who the user is | `apps/admin/dev/ai/how-to/permission-gating.md` |
| Auth, sessions, middleware, CORS, anything with credentials/secrets | `apps/admin/dev/ai/how-to/web-security.md` |
| The role→permission taxonomy the UI gate derives from | `packages/dev/ai/how-to/permissions-package.md` |
| The shared `@uprise/contracts` types / `@uprise/api-client` shape | `packages/dev/ai/how-to/package-build.md` |

## Workflow

1. **Classify the surface.** Is it a new route, a data surface (list/detail/form), a styling change, or an auth/security touch? That picks which invariants and guides are in scope.
2. **Route in.** Read `dev/ai/guide-map.md`, then every guide whose row fits. Always in scope for a data surface: design-system, app-router-and-api-client, feedback-states, permission-gating.
3. **Pick the route group.** `(main)` = organiser shell, `(field)` = canvasser PWA. A new protected route must be covered by the middleware matcher (`apps/admin/src/middleware.ts`) and route-gated by role where the shell demands it.
4. **Build from primitives.** Reuse `@uprise/ui`; if a primitive is missing, extend the package, don't fork it into `apps/admin`. Tokens only, no hex.
5. **Wire the data.** Fetch via `@uprise/api-client` / a `lib/api` helper, type with `@uprise/contracts`, branch on `ApiResult.ok`, render all four feedback states.
6. **Gate it.** Derive the gate from the session principal / `@uprise/permissions` ability; hide for permission, disable for transient. Confirm the matching API route is `@RequirePermission`-gated – UI gating is not the boundary.
7. **Close on the gate.** Walk `dev/ai/how-to/definition-of-done.md`. The Next build (`pnpm --filter admin build`) is the real check for any Tailwind/`@source`/config change; `pnpm -r typecheck` covers the contract/client touch.

## Anti-patterns

- Raw hex/rgb in a className (`text-[#b45309]`) instead of a token (`text-warning-foreground`); forking a `@uprise/ui` primitive into `apps/admin`.
- A spinner with no error path, treating empty-list as an error, or reading `res.data` before checking `res.ok`.
- Hard-coded `role === "ORGANISER"` checks scattered across components instead of deriving from the ability; treating a hidden button as authorisation.
- A bare `fetch("http://localhost:3001/...")` that bypasses cookie auth, the 401 bounce and the envelope unwrap; hardcoding the API origin instead of `getApiUrl()`.
- A login form or stored credential in `apps/admin`, a secret in `NEXT_PUBLIC_*`, or reading `auth_token` from JS – all defeat the httpOnly cookie SSO.
- Marking a whole page `"use client"` just to fetch – push the client island down.

## Checklist

- [ ] Surface classified; every fitting guide read (design-system + app-router-and-api-client + feedback-states + permission-gating for a data surface; web-security for an auth touch).
- [ ] `@uprise/ui` primitives reused (or the package extended); colours from tokens, zero new raw hex.
- [ ] All four feedback states rendered; `ApiResult.ok` checked before reading `data`.
- [ ] UI gated by the session principal / `@uprise/permissions` ability – hide for permission, disable for transient; matching API route `@RequirePermission`-gated.
- [ ] API traffic via `@uprise/api-client` / `lib/api`; types from `@uprise/contracts`; no secret in a client component or `NEXT_PUBLIC_*`; new protected routes in the middleware matcher.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md` – `pnpm -r typecheck` green; the Next build run for any Tailwind/config change.
