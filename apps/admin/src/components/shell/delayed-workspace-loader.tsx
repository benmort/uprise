"use client";

import { useEffect, useState } from "react";
import { WorkspaceLoadingOverlay } from "./workspace-loading-overlay";

/**
 * Slow-load safety net: shows the branded workspace loading dialogue ONLY once a page load
 * has run longer than `delayMs` (default 2s). Mounted inside the route `loading.tsx`
 * boundaries, so Next renders it while a segment loads (client navigation OR the initial
 * streamed load) and unmounts it the moment the page is ready — which clears the timer, so a
 * fast load never flashes the dialogue. A slow one (> 2s) gets the same dialogue as a
 * workspace switch, instead of bare skeletons.
 */
export function DelayedWorkspaceLoader({ delayMs = 2000 }: { delayMs?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  if (!show) return null;
  return <WorkspaceLoadingOverlay title="Loading…" />;
}
