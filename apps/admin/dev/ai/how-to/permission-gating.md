---
name: permission-gating
description: Gate UI by the user's role/ability from @yarns/permissions, surfaced via the session – hide for permission, disable for transient state.
layer: web
topic: authorization
use_when: Showing or hiding a control, route or surface based on who the user is or what they can do.
last_reviewed: 2026-06-23
---

# Permission gating

UI gating mirrors the server's authorisation, never replaces it. The API is the enforcer; the frontend hides what the user can't use so they never hit a dead control.

Canonical: `packages/permissions/src/ability.ts` (`defineAbilityFor`, `AppAbility`, `resolveRolePermissions`), `packages/permissions/src/roles.ts` (`YARNS_ROLES`, `ROLE_PERMISSIONS`, `APP_USER_ROLE_TO_ROLE`), `packages/permissions/src/types.ts` (`Action`, `Resource`, `PermissionRule`), `apps/admin/src/lib/session.ts` (`getSession`), `@yarns/contracts` `AuthPrincipal` (`role: AppRole` = `"ORGANISER" | "VOLUNTEER"`), `apps/admin/src/app/(main)/layout.tsx` (the `VOLUNTEER` → `/field` route gate).

## Must have
- Resolve the principal from the session (`getSession()` → `AuthPrincipal`). Its `role` (`AppRole`) and the CASL ability from `@yarns/permissions` are the gate inputs – derive the ability from the role rather than scattering string comparisons.
- **Hide by default for permission.** If the user lacks the ability/role for a surface or control, don't render it (or render the no-permission state). Don't show a button that will 403.
- **Disable for transient state.** When the control is permitted but momentarily unavailable (in-flight request, unmet precondition, offline), keep it visible and `disabled` – a clear, recoverable state, not a hidden one.
- Route-gate whole shells by role: the `(main)` layout bounces a `VOLUNTEER` to `/field` (`session.role === "VOLUNTEER"`). This is defence-in-depth for UX – the server still authorises each mutation via its own `@RequirePermission` decorator.
- Treat gating as advisory only. Never rely on hiding a control for security; hidden UI on an unauthorised request must still be safe server-side. Server-side that safety is not automatic: the api's `AbilityGuard` only gates routes that carry `@RequirePermission` (`if (!required) return true`), so the matching endpoint must be decorated or the route is reachable by any authenticated user (see `packages/dev/ai/how-to/permissions-package.md`).

## Anti-patterns
- Hard-coded `role === "ORGANISER"` checks sprinkled across components instead of deriving from the ability – they drift from the real `ROLE_PERMISSIONS` table.
- Disabling a control the user can never use (use hide); or hiding a control that's merely loading (use disable).
- Treating the frontend gate as the enforcement boundary – a missing button is not authorisation.
- Re-implementing the role→permission mapping in the web app instead of importing `@yarns/permissions`.

## Checklist
- [ ] Gate derived from the session principal / `@yarns/permissions` ability, not ad-hoc string checks.
- [ ] Permission-gated UI is hidden (or shows the no-permission state); transient-blocked UI is disabled.
- [ ] The matching server endpoint is permission-gated (UI gating is not the boundary).
- [ ] Gate: walk `dev/ai/how-to/definition-of-done.md`.

## Related guides
- `apps/admin/dev/ai/how-to/web-security.md` – the session the principal comes from.
- `apps/admin/dev/ai/how-to/feedback-states.md` – the no-permission state pairs with the other three.
- `apps/admin/dev/ai/how-to/app-router-and-api-client.md` – the calls being gated.
- `packages/dev/ai/how-to/permissions-package.md` – the role/ability taxonomy and how the api gates routes.
