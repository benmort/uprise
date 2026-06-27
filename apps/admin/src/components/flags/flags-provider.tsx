"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { FLAG_DEFAULTS, type FeatureFlagKey, type FeatureFlagMap } from "@uprise/flags";
import { listFlags } from "@/lib/api/flags";

type FlagsContextValue = {
  flags: FeatureFlagMap;
  ready: boolean;
  refresh: () => void;
};

// Seed with catalogue defaults so useFlag() is always safe to call before the
// first fetch resolves (no flash of "everything off").
const FlagsContext = createContext<FlagsContextValue>({
  flags: FLAG_DEFAULTS,
  ready: false,
  refresh: () => {},
});

export function FlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlagMap>(FLAG_DEFAULTS);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const res = await listFlags();
    if (res.ok) setFlags(res.data);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    // Light poll — the resolver caches server-side, and a tenant override only
    // needs to reach the client within ~a minute. (No SSE needed for flags.)
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return <FlagsContext.Provider value={{ flags, ready, refresh }}>{children}</FlagsContext.Provider>;
}

/** Typed single-flag read, e.g. `useFlag("FEATURE_WHATSAPP_ENABLED")`. */
export function useFlag(key: FeatureFlagKey): boolean {
  return useContext(FlagsContext).flags[key];
}

/** The whole effective flag map for the current tenant. */
export function useFlags(): FeatureFlagMap {
  return useContext(FlagsContext).flags;
}

/** Whether the first fetch has resolved (for gating loading UI). */
export function useFlagsReady(): boolean {
  return useContext(FlagsContext).ready;
}

/** Force a re-fetch (e.g. after toggling a flag in the admin UI). */
export function useRefreshFlags(): () => void {
  return useContext(FlagsContext).refresh;
}
