# yarns — cross-cutting TODO

Running backlog of deferred, repo-wide items that don't belong to a single PR. Keep this
updated as work lands.

## Deferred

### Adopt per-tenant subdomain routing
**Deferred from:** PART 3 (prog ngrok + subdomain dev tooling). We kept yarns' in-session
tenant model for now.

Prog routes tenants by subdomain (`<tenant>.dev.prog.network` → organiser app), parsing the
host to the tenant and redirecting to the tenant subdomain after login. yarns currently picks
the tenant in-session via `/select-tenant` and serves the organiser app on one host
(`app.dev.prog.network`).

Switching would mean:
- Host→tenant parsing in `apps/web/src/middleware.ts` (a `buildTenantUrl` / `extractTenantFromHost`
  helper, cf. prog `clients/auth-client/lib/utils/tenancy.ts`).
- Redirect-to-subdomain after login in `apps/auth/src/lib/session.ts` (`completeAuth`), reworking
  the `/select-tenant` step.
- The `*.dev.prog.network` ngrok wildcard is already reserved, so the tunnel side is ready.

Decision: revisit once the in-session flow is settled; it reworks the SSO/select-tenant flow
shipped in the auth port.
