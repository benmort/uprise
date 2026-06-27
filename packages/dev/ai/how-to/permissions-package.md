---
name: permissions-package
description: The action/resource/role taxonomy in @uprise/permissions and how routes reference it.
layer: packages
topic: authorisation
use_when: Adding a resource or action, wiring a role, or gating an api route with @RequirePermission.
last_reviewed: 2026-06-23
---

# Permissions package

`@uprise/permissions` is the single source of the authorisation matrix – the action and resource taxonomy plus the role → permissions table the api's guard builds an ability from.

Canonical: `packages/permissions/src/types.ts` (`STANDARD_ACTIONS`, `UPRISE_RESOURCES`, `PermissionRule`, `AuthenticatedActor`) and `packages/permissions/src/roles.ts` (`UPRISE_ROLES`, `ROLE_PERMISSIONS`, `APP_USER_ROLE_TO_ROLE`).

## Must have
- Resources are namespaced `<domain>.<entity>` (e.g. `audience.audience`, `messaging.blast`, `canvass.turf`). Each domain also has a `<domain>.all` wildcard granting the action on every resource in that domain; the literal `all` is the super-resource granted only via `manage`.
- Actions come from `STANDARD_ACTIONS`: `read`, `create`, `update`, `delete`, plus `operate` (run/process) and `manage` (the super-action that grants all). Add a domain verb (e.g. `send`) only when a concrete need arises.
- A new resource must be added to the `UPRISE_RESOURCES` array before it can be referenced; same for a new action and `STANDARD_ACTIONS`.
- Grant a role access by adding a `PermissionRule` (`{ action, resource }`) to its entry in `ROLE_PERMISSIONS`. Role rules are always positive – no `inverted`. Roles are the five in `UPRISE_ROLES` (`super-admin`, `owner`, `organiser`, `canvasser`, `member`); the legacy Prisma `AppUserRole` maps via `APP_USER_ROLE_TO_ROLE`.
- The api references these by gating a route with `@RequirePermission({ action, resource })` (see `apps/api/src/audiences/audiences.controller.ts`); the `AbilityGuard` builds the caller's ability from their roles and allows only if it grants that action on that resource. Always add `@RequirePermission` to a new endpoint – the `AbilityGuard` does NOT gate undecorated routes (`if (!required) return true`), so a missing decorator silently leaves the route reachable by any authenticated user. Nothing scans for this at boot; it is a discipline.
- After editing `src/`, rebuild: `pnpm --filter @uprise/permissions build` – the api imports the built `dist`.

## Anti-patterns
- Referencing a resource/action string not in `UPRISE_RESOURCES`/`STANDARD_ACTIONS` – it is untyped and silently never matches a role rule.
- Putting `inverted: true` in a role rule – role grants are positive; inverts are for per-actor overrides only.
- Granting a broad `<domain>.all` where a single `<domain>.<entity>` would do – over-grants the role.
- Editing `src/` without rebuilding `dist` – the api still enforces the old matrix.

## Checklist
- [ ] New resource added to `UPRISE_RESOURCES` (namespaced `<domain>.<entity>`); new action added to `STANDARD_ACTIONS`.
- [ ] Role access expressed as a positive `PermissionRule` in `ROLE_PERMISSIONS`.
- [ ] Route gated with `@RequirePermission({ action, resource })` referencing the taxonomy.
- [ ] `pnpm --filter @uprise/permissions build` run.
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `packages/dev/ai/how-to/package-build.md` – why the rebuild is mandatory.
- `apps/admin/dev/ai/how-to/permission-gating.md` – the frontend mirror of this matrix.
- `dev/ai/how-to/definition-of-done.md` – the security line for new routes.
