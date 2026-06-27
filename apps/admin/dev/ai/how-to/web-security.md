---
name: web-security
description: How frontend auth works – the parent-domain httpOnly cookie, the standalone auth app, middleware bounces, and keeping secrets server-side.
layer: web
topic: security
use_when: Touching auth, sessions, the middleware, CORS, or anything that handles credentials/secrets in a frontend.
last_reviewed: 2026-06-23
---

# Web security

Credentials live in one place. Every frontend is a thin SSO consumer of the standalone auth app, riding a shared parent-domain cookie.

Canonical: `apps/auth` (the standalone identity app – routes `/login`, `/sign-up`, `/magic-link`, `/verify-email`, `/reset-password`, `/2fa`, `/invite/[token]`, `/select-tenant`), `apps/admin/src/middleware.ts` (the SSO gate), `apps/api/src/auth/session-cookie.util.ts` (`SESSION_COOKIE = "auth_token"`, `sessionCookieOptions`, `SESSION_COOKIE_DOMAIN`), `apps/admin/src/lib/session.ts` (`getSession`, `goToLogin`, `logout`), `packages/api-client/src/index.ts` (`request` with `credentials: "include"`; its internal `redirectToLogin` bounces to the auth app on 401), `docs/meld/14-auth-frontend-and-sso.md`.

## Must have
- The session is the `auth_token` httpOnly cookie issued by `apps/api`, scoped to the parent domain via `SESSION_COOKIE_DOMAIN` (e.g. `.uprise.org.au` in prod, `.lvh.me` in dev) so every subdomain app shares one session. The cookie is `httpOnly`, `sameSite: "lax"`, `secure` in production. Frontends never read or write it directly.
- Send credentials by cookie, not header: API calls go through `@uprise/api-client`'s `request`, which sets `credentials: "include"`. The API CORS must allow that origin with credentials.
- `apps/admin/src/middleware.ts` gates routes: no `auth_token` cookie → redirect to `auth.<domain>/login?return_to=<self>`. Keep the matcher excluding `_next`, service-worker assets and static files so the login bounce never blocks JS/CSS.
- A present-but-stale cookie is caught in-app: layouts resolve the principal via `getSession()` (`/auth/check`); a null result calls `goToLogin()`. Middleware checks presence, the app checks validity.
- Credential entry, token issuance, invites, magic-link landing, 2FA and tenant selection live only in `apps/auth`. Other apps redirect to it – never add a `/login` form or hold credentials in `apps/admin`.
- No secrets in client components or `NEXT_PUBLIC_*`. Client-visible config is only non-secret (API/auth-app URLs). Anything sensitive stays in `apps/api`; frontends never touch the DB or domains directly.

## Anti-patterns
- Reading/writing `auth_token` from JS, or moving the token into `localStorage` or an `Authorization` header in the browser – defeats `httpOnly` and the shared-cookie SSO.
- A bespoke login form or stored credentials in `apps/admin` – the old localStorage Basic-creds path was removed; all of it lives in `apps/auth`.
- Loosening the middleware matcher so it gates static assets, or disabling middleware to "fix" a redirect loop.
- A secret in `NEXT_PUBLIC_*` or inlined into a client bundle.
- Trusting the cookie's mere presence for authorisation – presence ≠ valid; always resolve the principal.

## Checklist
- [ ] New protected routes are covered by the middleware matcher; the bounce carries `return_to`.
- [ ] API calls use the cookie via `@uprise/api-client` (no manual auth header in the browser).
- [ ] No credential entry / secret added to `apps/admin`; auth flows stay in `apps/auth`.
- [ ] No secret reaches a client component or `NEXT_PUBLIC_*`.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/admin/dev/ai/how-to/app-router-and-api-client.md` – the client wrapper that carries the cookie.
- `apps/admin/dev/ai/how-to/permission-gating.md` – authorising the authenticated principal.
