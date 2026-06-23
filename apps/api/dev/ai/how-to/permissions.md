---
name: permissions
description: How to authorise an endpoint in yarns – auth is enforced on every route, but @RequirePermission gating is opt-in, so always decorate.
layer: api
topic: auth
use_when: Adding or changing any API endpoint, webhook, or cron route.
last_reviewed: 2026-06-23
---

# Permissions

Authentication is enforced on every route by `BasicAuthGuard`, but permission-gating is opt-in: `AbilityGuard` only checks routes that carry `@RequirePermission` and allows everything else. So decorating a new endpoint is a discipline, not an automatic guarantee.

Canonical: `apps/api/src/auth/require-permission.decorator.ts` (`@RequirePermission({ action, resource })`, `REQUIRE_PERMISSION_KEY`), `apps/api/src/auth/basic-auth.guard.ts` (`BasicAuthGuard`: cookie/Bearer session via `getSessionToken`, env super-admin, per-user `authenticateAppUser`; the `isPublicWebhookPath` / `isCronDispatchPath` / `isAuthEndpointPath` / `isAnalyticsStreamPath` allowlists), `apps/api/src/auth/ability.guard.ts` (`AbilityGuard.canActivate` reads the metadata via `Reflector`, and `if (!required) return true` for any un-decorated route; on a decorated route it builds the actor's ability and throws `ForbiddenException` on a miss), `packages/permissions/src` (`defineAbilityFor`, `ROLE_PERMISSIONS`, `APP_USER_ROLE_TO_ROLE`, `YARNS_RESOURCES`).

## Must have
- ALWAYS add `@RequirePermission({ action, resource })` to a new endpoint. The `AbilityGuard` does NOT gate undecorated routes (`if (!required) return true`), so a missing decorator silently leaves the route reachable by any authenticated user. Nothing scans for missing decorators at boot – this is a discipline, not an enforced default-deny.
- Use a real `action` (`read`/`create`/`update`/`delete`/`operate`/`manage` from `STANDARD_ACTIONS`) and a namespaced `<domain>.<entity>` resource from `YARNS_RESOURCES` (e.g. `{ action: "manage", resource: "messaging.blast" }`).
- Pick the resource that matches the role matrix in `roles.ts`: a `canvasser` only gets `canvass.*` reads (`turf`/`walklist`/`campaign`/`script`/`survey`) + `manage canvass.doorknock` + `create canvass.disposition` + `read contacts.contact`; field endpoints must use those resources, not `audience.*`/`messaging.*`.
- A new resource string must be added to `YARNS_RESOURCES` in `packages/permissions/src/types.ts` and granted in `ROLE_PERMISSIONS` (`packages/permissions/src/roles.ts`) – rebuild `@yarns/permissions` after.
- Provider webhooks and CRON routes are reachable without auth via the explicit `BasicAuthGuard` allowlists, not via `@RequirePermission` – `isPublicWebhookPath` (signature-verified in the handler) or `isCronDispatchPath` (CRON_SECRET Bearer, checked in the guard). Adding a webhook/cron endpoint means adding both the bare path and the `/api/v1`-prefixed path to the relevant `Set` in `basic-auth.guard.ts`.

## Anti-patterns
- A new endpoint with no `@RequirePermission` – the `AbilityGuard` returns `true` for it, so it is open to any authenticated user. Treat the omission as a hole, not a safe default.
- Inventing a resource string not in `YARNS_RESOURCES` – the matrix never grants it, so it silently 403s for everyone except super-admin (`manage all`).
- Putting a real business endpoint in a guard allowlist to dodge auth. Allowlists are only for signature-verified webhooks and CRON_SECRET cron.
- Granting `manage` where `read` is enough, or reaching for a `<domain>.all` wildcard when a single `<domain>.<entity>` resource is what the route touches.

## Checklist
- [ ] Endpoint carries `@RequirePermission` with an action + a resource that exists in `YARNS_RESOURCES` (no route left undecorated by oversight).
- [ ] The role(s) that should reach it are granted in `ROLE_PERMISSIONS`; `@yarns/permissions` rebuilt if you touched it.
- [ ] Any new webhook/cron path added to the correct guard allowlist (bare + `/api/v1`) and verified/secret-checked in the handler.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/api/dev/ai/how-to/webhooks.md` – verifying + allowlisting provider webhooks.
- `apps/api/dev/ai/how-to/bullmq-jobs.md` – the CRON_SECRET-gated dispatch endpoints.
- `apps/api/dev/ai/how-to/services-controllers-dtos.md` – where the decorator lives on a thin controller.
