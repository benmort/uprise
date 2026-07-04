import { FLAG_META, type FeatureFlagKey, type FeatureFlagMap } from "@uprise/flags";

/**
 * Shared plan-capability gating — the single source of truth for how the sidebar
 * AND the dashboard treat flag-gated features, so they can't drift.
 *
 * - planVisible: is the item shown at all? No flag, a super-admin, or the flag
 *   resolves on for the tenant. Non-super-admins with the flag off don't see it.
 * - planLocked: a super-admin viewing a tenant whose PLAN doesn't include this
 *   plan-driven capability — shown greyed + still navigable ("fake disabled").
 */
export function planVisible(
  flags: FeatureFlagMap,
  isSuperAdmin: boolean,
  flag?: FeatureFlagKey,
): boolean {
  return !flag || isSuperAdmin || flags[flag] !== false;
}

export function planLocked(
  flags: FeatureFlagMap,
  isSuperAdmin: boolean,
  flag?: FeatureFlagKey,
): boolean {
  return (
    isSuperAdmin &&
    !!flag &&
    flags[flag] === false &&
    (FLAG_META[flag]?.controllableBy.includes("plan") ?? false)
  );
}
