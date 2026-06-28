import { request } from "@/lib/api";
import type { FeatureFlagKey, FeatureFlagMap, FlagLayer } from "@uprise/flags";

export type { FeatureFlagKey, FeatureFlagMap, FlagLayer };

/** Per-flag admin breakdown returned by GET /system/feature-flags/admin. */
export type FlagAdminEntry = {
  key: FeatureFlagKey;
  description: string;
  kind: string;
  controllableBy: FlagLayer[];
  default: boolean;
  env: boolean | null;
  tenantOverride: boolean | null;
  networkOverride: boolean | null;
  planEntitlement: boolean | null;
  globalOverride: boolean | null;
  effective: boolean;
  source: FlagLayer | "default";
};

/** A tenant/network row for the override-editor selector. */
export type TenantLite = { id: string; slug: string; name: string; networkId: string | null };
export type NetworkLite = { id: string; name: string; planName: string | null };

/** The override-editor target: exactly one of a tenant or a network. */
export type FlagTarget = { tenantId?: string | null; networkId?: string | null };

/** A subscription plan and the feature-flag entitlements it grants. */
export type Plan = {
  id: string;
  key: string;
  displayName: string;
  featureFlags: Record<string, boolean>;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Effective flag map for the current tenant. */
export async function listFlags() {
  return request<FeatureFlagMap>("/system/feature-flags");
}

/** Full admin breakdown (default/env/tenant/global/effective + source). */
export async function getFlagAdmin() {
  return request<FlagAdminEntry[]>("/system/feature-flags/admin");
}

/** Set (true/false) or clear (null) the per-tenant override for the current workspace. */
export async function setTenantFlag(flag: FeatureFlagKey, enabled: boolean | null) {
  return request<FlagAdminEntry[]>("/system/feature-flags", {
    method: "PATCH",
    body: JSON.stringify({ flag, enabled }),
  });
}

/** Set/clear a platform-wide global override (super-admin only). */
export async function setGlobalFlag(flag: FeatureFlagKey, enabled: boolean | null) {
  return request<FlagAdminEntry[]>("/system/feature-flags/global", {
    method: "PATCH",
    body: JSON.stringify({ flag, enabled }),
  });
}

// ── Plans (entitlement sets; reads open to flag-readers, writes super-admin) ──

export async function listPlans() {
  return request<Plan[]>("/plans");
}

export async function upsertPlan(input: {
  key: string;
  displayName: string;
  featureFlags: Record<string, boolean>;
  isDefault?: boolean;
}) {
  return request<Plan>("/plans", { method: "POST", body: JSON.stringify(input) });
}

export async function updatePlan(
  id: string,
  input: { displayName?: string; featureFlags?: Record<string, boolean>; isDefault?: boolean; archived?: boolean },
) {
  return request<Plan>(`/plans/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

// ── Super-admin per-tenant/network override editor ──

/** Admin breakdown for an arbitrary tenant or network. */
export async function getFlagAdminFor(target: FlagTarget) {
  const qs = new URLSearchParams();
  if (target.tenantId) qs.set("tenantId", target.tenantId);
  if (target.networkId) qs.set("networkId", target.networkId);
  return request<FlagAdminEntry[]>(`/system/feature-flags/admin/target?${qs.toString()}`);
}

/** Set (true/false) or clear (null) an override for an arbitrary tenant or network. */
export async function setTargetFlag(target: FlagTarget, flag: FeatureFlagKey, enabled: boolean | null) {
  return request<FlagAdminEntry[]>("/system/feature-flags/target", {
    method: "PATCH",
    body: JSON.stringify({ ...target, flag, enabled }),
  });
}

/** Search all tenants (super-admin) for the override-editor selector. */
export async function searchTenants(q: string) {
  return request<TenantLite[]>(`/tenants/search?q=${encodeURIComponent(q)}`);
}

/** Search all networks (super-admin) for the override-editor selector. */
export async function searchNetworks(q: string) {
  return request<NetworkLite[]>(`/networks/search?q=${encodeURIComponent(q)}`);
}
