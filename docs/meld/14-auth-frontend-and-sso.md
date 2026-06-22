# 14 – Auth Frontend & SSO Hub

Decision doc. The melded platform's authentication UI is its **own thin frontend** (`apps/auth`), acting as the identity/SSO hub for every other frontend. It is **not** folded into `apps/web`.

## Decision

Keep auth as a separate frontend. Make it the single place credentials are entered and sessions are issued; every other app redirects to it and shares one parent-domain session.

## Why

The meld produces multiple frontends — yarns `apps/web` (organiser `(main)` + field `(field)`), prog's `admin-client` + `marketing-client`, slingshot's `admin-ui` + `web`. A standalone identity app is the natural SSO hub for all of them, and the lowest-rework path to the merged platform:

- **Multiple consumers** — one hosted login for N apps beats duplicating auth or coupling every app to whichever app "owns" login. prog already split this (`clients/auth-client`); slingshot is multi-app.
- **Trust boundary** — credential entry + token issuance isolated to a minimal-dependency, locked-down deploy (own CSP, smaller attack surface).
- **Release cadence** — auth changes rarely; decoupling stops it being redeployed on every app change.
- **Cross-app identity concerns** — invitation acceptance, magic-link landing, 2FA challenge, tenant selection live naturally in one identity app.

## Design

`apps/auth` — a thin Next.js app, no business logic. Routes only: `/login`, `/magic-link`, `/verify-email`, `/reset-password`, `/2fa`, `/invite/[token]`, `/select-tenant`.

- It POSTs to `apps/api` IAM endpoints (doc 04). The API sets an **httpOnly session cookie scoped to the parent domain** (e.g. `.yarns.org.au`) and the auth app redirects back to `?return_to=`.
- Every other frontend runs middleware: no valid session → redirect to `auth.<domain>/login?return_to=<self>`. The shared parent-domain cookie = SSO across all apps.
- Frontends never touch the DB or domains directly — all traffic goes through `apps/api`.

## Shares (no duplication)

- **`@yarns/contracts`** — Zod auth DTOs, shared by api + all frontends.
- **`@yarns/ui`** — yarns' Radix/Tailwind design system, extracted to a package so `apps/auth` and `apps/web` render identically. *(New extraction; prerequisite.)*
- **`@yarns/api-client`** — `apps/web/src/lib/api.ts` (typed request wrapper + session handling) extracted to a package. *(New extraction; prerequisite.)*
- **`apps/api` IAM endpoints + CASL** — the single identity backend (doc 04).

## Sequencing

Depends on the IAM API existing (doc 04). Order: **doc 03 (tenancy/IAM data model) → doc 04 (IAM API + session guard + CASL) → extract `@yarns/ui` + `@yarns/api-client` → build `apps/auth`.**

On delivery: remove `apps/web`'s `/login` + `lib/auth.ts` (localStorage Basic creds) and replace with a redirect to `apps/auth`. prog's `clients/auth-client` is the reference implementation for the flows.

## Slingshot alignment

slingshot's `admin-ui` + `web` become additional SSO consumers of `apps/auth` — same redirect + parent-domain-cookie model, same `@yarns/contracts`/`@yarns/ui`/`@yarns/api-client`. No new auth pattern at merge time.

## Verification

- e2e (after build): unauthenticated hit on `apps/web` redirects to `apps/auth/login?return_to=…`; successful login sets the parent-domain cookie and returns; a second app sees the session without re-login (SSO).
- The 4 existing API auth bypasses (doc 04) are unaffected — they're API-side, not frontend.
