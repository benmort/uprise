"use client";

import { useEffect } from "react";
import { installGlobalErrorReporting } from "@/lib/report-error";

/**
 * Mounts the window-level error + unhandledrejection reporters once for the whole app.
 *
 * error.tsx and global-error.tsx only cover throws during render. Neither production
 * invite-accept failure was a render throw – both were in an async submit handler, which
 * a React error boundary structurally never sees. This is the half of the coverage that
 * catches those: a rejected fetch, a throw inside an onSubmit, an exception from a
 * callback all land in ops.ErrorLog instead of vanishing with the tab.
 *
 * Renders nothing, so it costs a mount and no markup. The logic lives in
 * `@/lib/report-error` (unit-tested, dependency-free); this is just where it is attached.
 */
export function ClientErrorListener() {
  // installGlobalErrorReporting returns its own teardown, which is exactly the effect
  // cleanup contract – no wrapper needed.
  useEffect(() => installGlobalErrorReporting("auth"), []);
  return null;
}
