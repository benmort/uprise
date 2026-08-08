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
 * Order: an explicit prop wins (a super-admin surface passes one), then `tenantId`, then
 * `activeTenant` as a belt-and-braces fallback.
 *
 * That last one is defensive rather than load-bearing. GET /auth/check builds the field as
 * `activeTenantId = req.user.tenantId` and returns the summary only when the user holds no
 * membership in it — so whenever `activeTenant` is non-null its id EQUALS `tenantId`, and the two
 * can never disagree. Which is exactly why the bug was one-directional: reading `activeTenant`
 * alone loses ordinary users, while reading `tenantId` alone is always right. Other call sites in
 * this app order the two the other way round; on today's contract both are correct.
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
