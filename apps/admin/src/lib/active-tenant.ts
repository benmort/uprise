/**
 * Which tenant a component should act on.
 *
 * There are two tenant fields on the principal and only one of them is usually set:
 *
 *   `tenantId`     – the session's active tenant. Set for everyone.
 *   `activeTenant` – "the tenant a super-admin is acting as, when they aren't a member of it.
 *                     Null for ordinary users." (AuthPrincipal contract.)
 *
 * The email identity card read `activeTenant?.id` alone, so for every ordinary owner it resolved
 * to undefined, returned before fetching, and their email identity simply never appeared. Its
 * sibling telephony card reads `tenantId` and works — the two were written against different
 * assumptions about the same object.
 *
 * Order matters: an explicit prop wins (a super-admin surface passes one), then the session's own
 * tenant, then the acting-as tenant as a last resort.
 */

export type TenantScopedPrincipal = {
  tenantId?: string | null;
  activeTenant?: { id: string } | null;
} | null | undefined;

export function resolveTenantId(
  principal: TenantScopedPrincipal,
  explicit?: string | null,
): string | undefined {
  return explicit?.trim() || principal?.tenantId || principal?.activeTenant?.id || undefined;
}
