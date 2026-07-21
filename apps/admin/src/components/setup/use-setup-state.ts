"use client";

import { useEffect, useState } from "react";
import { tenants, type AuthPrincipal, type TenantSetupState } from "@uprise/api-client";
import { useApi, invalidateApi } from "@/lib/use-api";
import { getSession } from "@/lib/session";

const setupKey = (tenantId: string) => `/tenants/${tenantId}/setup`;

/** Drop the cached setup state after anything that changes it (provisioning start, email
 *  request, a 422 from the server gate, a settings save). Every subscriber refetches. */
export function invalidateSetupState(tenantId: string): void {
  invalidateApi(setupKey(tenantId));
}

/**
 * The one read of GET /tenants/:id/setup, shared via the use-api cache by the layout
 * (nav self-hide), the getting-started page, the setup tracker and the gates. Resolves
 * the session itself (the admin has no session provider); a volunteer or tenant-less
 * session skips the fetch entirely (null key).
 */
export function useSetupState(): {
  state: TenantSetupState | undefined;
  session: AuthPrincipal | null;
  tenantId: string | null;
  loading: boolean;
  error: string | undefined;
  noPermission: boolean;
  refetch: () => Promise<void>;
} {
  const [session, setSession] = useState<AuthPrincipal | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSession().then((s) => {
      if (!alive) return;
      setSession(s);
      setSessionReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const tenantId = session?.tenantId ?? null;
  const eligible = Boolean(tenantId && session && session.role !== "VOLUNTEER");
  const api = useApi<TenantSetupState>(
    eligible && tenantId ? setupKey(tenantId) : null,
    () => tenants.getSetup(tenantId!),
    { ttlMs: 30_000, revalidateOnFocus: true },
  );

  return {
    state: api.data,
    session,
    tenantId,
    // Loading until the session resolves, then while the first fetch is in flight.
    loading: !sessionReady || (eligible && api.loading),
    error: api.error,
    noPermission: api.noPermission,
    refetch: api.refetch,
  };
}

/** Bind a locked control to a server gate. `locked` is advisory — the server enforces. */
export function useSetupGate(gate: "canProvisionTelephony" | "canRequestEmail"): {
  loading: boolean;
  locked: boolean;
  planLocked: boolean;
  missing: Array<{ step: string; field: string }>;
} {
  const { state, loading } = useSetupState();
  const g = state?.gates?.[gate];
  return {
    loading,
    locked: Boolean(g && !g.allowed),
    planLocked: g?.reason === "PLAN_UPGRADE_REQUIRED",
    missing: g?.missing ?? [],
  };
}
