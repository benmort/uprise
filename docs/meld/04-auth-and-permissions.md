# 04 – Auth & Permissions (CASL)

Foundation step 5. Port prog's CASL package, define a unified role taxonomy, and replace yarns' `BasicAuthGuard` with a session guard + ability guard – preserving every existing auth bypass.

Source: `/Users/benjaminmort/code/prog/core-orchestration/packages/permissions/src/{roles,ability,types}.ts` and `apps/platform/src/.../shared-infrastructure` (`require-auth`, `require-permissions`).

## `@yarns/permissions`

Port prog's permissions package near-verbatim into `packages/permissions`:

- `defineAbilityFor(actor)` → CASL `Ability`.
- `ROLE_PERMISSIONS` matrix.
- The `.all` wildcard expansion (`expandRule`) ports unchanged – it already does the per-domain fan-out yarns needs.

Extend `RESOURCES`/`ROLE_PERMISSIONS` with yarns domains: `audience.*`, `messaging.*` (blast/inbound/template/consent), `canvass.*`, `journey.*`, `integration.*`, `geo.*`, `analytics.*`, `compliance.*`.

## Unified role taxonomy

Reconcile prog's `super-admin/owner/admin/member` with yarns' `ORGANISER/CANVASSER`. Stored as `TenantMember.role` strings, validated against `@yarns/permissions`.

| Role | Replaces | Scope |
|---|---|---|
| `super-admin` | env break-glass | system-wide `manage all` |
| `owner` | prog owner | full tenant incl. billing/network |
| `organiser` | yarns ORGANISER + prog admin | manage all campaign/messaging/audience/canvass/journey/integration domains; manage members + invitations; read analytics; **no billing** |
| `canvasser` | yarns CANVASSER | field-only: read assigned turf/walklist + field-visible contacts; write doorknock/disposition; no audience/blast/integration access |
| `member` | prog member | read-only tenant member |

`organiser` aliases prog's `admin` rule-set (one product label, admin-equivalent rules). Example matrix additions:

```ts
canvasser: [
  { action: 'read',   resource: 'canvass.turf' },
  { action: 'read',   resource: 'canvass.walklist' },
  { action: 'manage', resource: 'canvass.doorknock' },
  { action: 'create', resource: 'canvass.disposition' },
  { action: 'read',   resource: 'contacts.contact' },
],
organiser: [
  { action: 'manage', resource: 'audience.all' },
  { action: 'manage', resource: 'messaging.all' },
  { action: 'manage', resource: 'canvass.all' },
  { action: 'manage', resource: 'journey.all' },
  { action: 'manage', resource: 'integration.all' },
  { action: 'manage', resource: 'tenant.member' },
  { action: 'manage', resource: 'tenant.invitation' },
  { action: 'read',   resource: 'analytics.all' },
],
```

## Auth swap – two guards

Today `BasicAuthGuard` is the global `APP_GUARD` (`apps/api/src/app.module.ts`) and attaches `request.user: AuthUser` (`apps/api/src/auth/auth-user.ts`). It has **four bypasses** encoded as path allowlists in `apps/api/src/auth/basic-auth.guard.ts` that **must port verbatim**:

1. `OPTIONS` (CORS preflight).
2. Public webhooks (`/inbound-text-message-hook`, `/twilio-status-callback`, + new `/email-webhook`, `/payment-webhook`, `/voice-status-callback`).
3. Analytics SSE stream-token (`/analytics/stream` + `stream-token.ts`).
4. Cron Bearer (`/blasts/dispatch-due`, `/audiences/dispatch-imports`, `/journeys/sweep-due`) via `CRON_SECRET`.

**`SessionAuthGuard`** (global APP_GUARD, replaces BasicAuthGuard):

- Extract token from cookie `auth_token` or `Authorization: Bearer` (mirror prog's `require-auth` order).
- Look up `iam.Session`; load `User` + their `TenantMember` roles.
- Attach a richer principal, replacing `AuthUser`:

```ts
type AuthActor = {
  id: string; email: string;
  tenantId: string | null;
  roles: string[];          // from TenantMember
  isSuperAdmin: boolean;
};
```

- Port all four bypasses verbatim. Add a `@Public()` decorator (prog's `public-route.ts`) as the declarative replacement going forward; keep the path allowlists working during transition.
- The env break-glass Basic credential (`BASIC_AUTH_USERNAME`/`PASSWORD`) maps to `isSuperAdmin: true`.

**`AbilityGuard`** (replaces/augments `RolesGuard`):

- Read `@RequirePermission({ action, resource })`.
- Build ability via `@yarns/permissions` `defineAbilityFor(actor)`; `can(...)` or throw `ForbiddenException`.
- Keep the existing `@Roles()`/`RolesGuard` working in parallel until callers migrate (a route may carry both during transition).

The `{ok,data,error}` envelope is untouched – guards throw Nest `HttpException`s the existing exception filter wraps.

## IAM flows

Build the session/magic-link/password-reset/2FA handlers on the doc 03 models. 2FA and verification SMS/email go through the **transactional dispatcher** (doc 06), never the blast path. Magic-link/verification emails go through the email domain (doc 07).

## Verification

- e2e: session login issues a token; `AbilityGuard` denies a canvasser hitting an audience endpoint, allows an organiser.
- e2e: all four bypass paths pass without a session (OPTIONS, Twilio webhook, analytics stream-token, cron Bearer).
- unit: role-matrix tests – each role's `can`/`cannot` over representative resources.

## Files

- `packages/permissions/**` – ported CASL + yarns role matrix.
- `apps/api/src/auth/session-auth.guard.ts` – new; ports the four bypasses.
- `apps/api/src/auth/ability.guard.ts` + `@RequirePermission` decorator + `@Public()` decorator – new.
- `apps/api/src/auth/basic-auth.guard.ts` – bypass logic source; retire after migration.
- `apps/api/src/auth/auth-user.ts` → `auth-actor.ts`.
- `apps/api/src/app.module.ts` – swap global guard.
