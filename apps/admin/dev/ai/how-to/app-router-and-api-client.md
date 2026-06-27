---
name: app-router-and-api-client
description: How uprise frontends fetch – through the typed @uprise/api-client – and how to respect Next App Router server/client boundaries.
layer: web
topic: data-fetching
use_when: Adding a page/route, calling the API, or deciding server vs client component.
last_reviewed: 2026-06-23
---

# App Router and API client

Every frontend talks to `apps/api` only through the typed `@uprise/api-client`, inside Next App Router route groups.

Canonical: `packages/api-client/src/index.ts` (`request<T>`, `getApiUrl`, `auth`, `marketing`, `ApiResult<T>`; re-exports `@uprise/contracts`), `apps/admin/src/lib/api.ts` and `apps/admin/src/lib/api/*` (app fetch helpers), `apps/admin/src/app/layout.tsx` (root layout, `window.__API_URL__` injection), `apps/admin/src/app/(main)/layout.tsx` + `apps/admin/src/app/(field)/` (route groups), `apps/admin/next.config.mjs` (`transpilePackages` includes `@uprise/api-client`, `@uprise/contracts`).

## Must have
- Reach the API through `@uprise/api-client`'s `request<T>` wrapper (or an app helper in `lib/api` that wraps it) – never a bare `fetch` to the API. The wrapper sends `credentials: "include"` (the httpOnly cookie), unwraps the `{ data }` envelope, and bounces to the auth app on 401.
- Type request/response with the shared `@uprise/contracts` types re-exported from `@uprise/api-client` (e.g. `AuthPrincipal`, `CheckSessionResponse`). Keep the contract the single shape both ends agree on.
- Handle the `ApiResult<T>` discriminated union at the call site: branch on `res.ok` before reading `res.data` or `res.error`. Never assume success.
- Respect the server/client boundary. Components that use hooks, browser APIs, the client API wrapper or interactivity start with `"use client"` (see the `(main)`/`(field)` layouts). Keep static/SEO content in server components.
- Use route groups for shell separation: `(main)` is the organiser shell, `(field)` the canvasser PWA. Put a route in the group whose layout/auth posture it shares.
- Read the API base via `getApiUrl()` (runtime `window.__API_URL__` injected in the root layout, else `NEXT_PUBLIC_API_URL`) – don't hardcode the host.

## Anti-patterns
- A raw `fetch("http://localhost:3001/...")` in a component – bypasses cookie auth, the 401 bounce and the envelope unwrap.
- Reading `res.data` without checking `res.ok` – the union forbids it; errors get swallowed.
- Restating an API DTO as a local `interface` instead of importing it from `@uprise/contracts`.
- Marking a whole page `"use client"` only to fetch – push the client island down, keep the shell a server component where you can.
- Hardcoding the API origin instead of `getApiUrl()`.

## Checklist
- [ ] All API traffic goes via `@uprise/api-client` / a `lib/api` helper, not bare `fetch`.
- [ ] Types come from `@uprise/contracts`; the `ApiResult.ok` branch is handled.
- [ ] `"use client"` only where interactivity/browser APIs need it.
- [ ] `pnpm -r typecheck` green across web + the touched packages.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/admin/dev/ai/how-to/web-security.md` – the cookie session the client wrapper rides on.
- `apps/admin/dev/ai/how-to/feedback-states.md` – rendering the loading/error branches of `ApiResult`.
- `apps/admin/dev/ai/how-to/permission-gating.md` – gating what these calls expose.
