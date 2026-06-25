# yarns — cross-cutting TODO

Running backlog of deferred, repo-wide items that don't belong to a single PR. Keep this
updated as work lands.

## Deferred

### Configure SendGrid so transactional email actually sends
**Deferred from:** self-signup → admin approval (`feat/signup-approval`). The flow ships and
works without it — email-verification codes + join-request/invite notifications just don't
deliver (the dispatcher/reactions degrade: logged, never thrown).

`SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` are **unset everywhere** — blank in yarns' env and
blank across every prog `.env*` too (prog's real key lives only in its hosting secrets, not the
repo). To enable delivery:
- Pull the real key from prog's hosting dashboard (Railway/Vercel env) or SendGrid directly.
- Set `SENDGRID_API_KEY` + a **verified-sender** `SENDGRID_FROM_EMAIL` in yarns' deploy env /
  secrets manager (never commit it). For local testing, add them to the gitignored `apps/api/.env`.
- Keys are already declared/documented in `apps/api/.env.example` + `.env.prod.example`.

Decision: operator/secrets step — do it when wiring the prod environment for the signup-approval
launch (alongside `prisma migrate deploy` for the `TenantJoinRequest` table and adding the
`apps/action` origin to prod `CORS_ALLOWED_ORIGINS`).

### Adopt per-tenant subdomain routing
**Deferred from:** PART 3 (prog ngrok + subdomain dev tooling). We kept yarns' in-session
tenant model for now.

Prog routes tenants by subdomain (`<tenant>.dev.prog.network` → organiser app), parsing the
host to the tenant and redirecting to the tenant subdomain after login. yarns currently picks
the tenant in-session via `/select-tenant` and serves the organiser app on one host
(`app.dev.prog.network`).

Switching would mean:
- Host→tenant parsing in `apps/admin/src/middleware.ts` (a `buildTenantUrl` / `extractTenantFromHost`
  helper, cf. prog `clients/auth-client/lib/utils/tenancy.ts`).
- Redirect-to-subdomain after login in `apps/auth/src/lib/session.ts` (`completeAuth`), reworking
  the `/select-tenant` step.
- The `*.dev.prog.network` ngrok wildcard is already reserved, so the tunnel side is ready.

Decision: revisit once the in-session flow is settled; it reworks the SSO/select-tenant flow
shipped in the auth port.

### Finish the Vercel → prog-network consolidation
**Deferred from:** moving all yarns apps to the `prog-network` Vercel team. Done so far:
`yarns-admin` (transferred from common-threads `yarns-web`, same project id, Root Directory now
`apps/admin`) and `yarns-api` (holds `api.yarns.org.au`) live in prog-network and serve their
domains; `yarns-marketing` (`apps/marketing`) and `yarns-action` (`apps/action`) created with
Root Directory + `NEXT_PUBLIC_API_URL` (+ `NEXT_PUBLIC_APP_URL` for marketing) set; `yarns-auth`
(`apps/auth`) scaffolded. common-threads is now yarns-free.

Remaining:
- **Auth domain + wiring.** `yarns-auth` has no custom domain (`yarns-auth-prog-network.vercel.app`).
  Give it one, then set `NEXT_PUBLIC_AUTH_APP_URL` on **both** `yarns-marketing` and `yarns-action`
  (currently unset → their sign-in/up links don't resolve in prod).
- **Custom domains for marketing + action.** Both still on `*.vercel.app`; assign the intended
  production hostnames.
- **CORS.** Add the marketing/action (and auth) production origins to `apps/api`'s
  `CORS_ALLOWED_ORIGINS` (`apps/api/src/bootstrap.ts:25`) once their domains exist, or their
  `checkSession()`/form calls fail cross-origin.
- **Move the `yarns.org.au` domain registration to prog-network.** It serves from prog-network/
  `yarns-admin` but the apex registration still sits under common-threads (`vercel domains ls`) —
  a cross-team attachment. Functionally fine; move it for clean ownership.
- **Re-link local `.vercel`.** `apps/admin/.vercel` and `apps/api/.vercel` still carry the old
  common-threads `orgId` (and admin's old name `yarns-web`). Re-link if using CLI deploys:
  `vercel link --yes --scope prog-network --project yarns-admin` (and `… --project yarns-api`).
- **Confirm Git auto-deploy** is connected for the new projects (`github.com/benmort/yarns`).

Decision: operator/dashboard steps — finish alongside the signup-approval prod wiring (the
`apps/action` CORS origin overlaps with the SendGrid item above).
