/**
 * Which workspace the top-left brand element should name.
 *
 * Three inputs, and the order between them is the whole point:
 *
 *   1. A membership matching the active tenant — the ordinary case.
 *   2. The acting-as tenant, for a super-admin pinned to a workspace they do not belong to.
 *   3. Only then, the user's own first membership.
 *
 * The switcher used `memberships.find(...) ?? memberships[0]`, so a super-admin acting as a
 * tenant they hold no membership in fell straight past the acting-as name to their OWN first
 * workspace. The brand — the one persistent signal of whose data is on screen — named the wrong
 * organisation for exactly the session where getting that wrong matters most. The `activeTenant`
 * fallback was already written a line below and was simply unreachable, because `memberships[0]`
 * had already answered.
 */
export type WorkspaceMembership = {
  tenantId: string;
  tenantName?: string | null;
  role?: string | null;
  planName?: string | null;
};
export type ActingAsTenant = { id: string; name?: string | null } | null | undefined;

export function resolveCurrentWorkspace(input: {
  memberships: WorkspaceMembership[];
  currentTenantId?: string | null;
  activeTenant?: ActingAsTenant;
}): { name: string; seedId: string; membership: WorkspaceMembership | null } {
  const { memberships, currentTenantId, activeTenant } = input;
  const matched = currentTenantId
    ? memberships.find((m) => m.tenantId === currentTenantId)
    : undefined;

  const name =
    matched?.tenantName ||
    activeTenant?.name ||
    memberships[0]?.tenantName ||
    "Select workspace";

  // The avatar seed follows the same order, so the initial and colour cannot disagree with the
  // name sitting beside them.
  const seedId =
    matched?.tenantId || activeTenant?.id || currentTenantId || memberships[0]?.tenantId || "uprise";

  /**
   * The membership behind the name — or null while acting as a tenant the admin does not belong
   * to. Role and plan MUST come from this, not from a fallback: the old `?? memberships[0]`
   * meant an acting-as session rendered the plan pill of the admin's OWN first workspace beside
   * the impersonated tenant's name, and decided "can create a workspace" from that tenant's role.
   * Null is the honest answer for acting-as — a super-admin's own `isSuperAdmin` already carries
   * the permissions they need.
   */
  const membership = matched ?? (activeTenant ? null : (memberships[0] ?? null));

  return { name, seedId, membership };
}
