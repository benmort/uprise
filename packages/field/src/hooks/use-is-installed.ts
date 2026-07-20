"use client";

import { useEffect, useState } from "react";
import { isStandalone } from "../lib/pwa";

/**
 * Is the field app running as the installed (home-screen / standalone) PWA? SSR-safe: false on
 * the first paint, then resolves after mount and follows the display-mode media query (a user
 * can launch installed vs in-browser). Drives installed-only behaviour like auto-download.
 */
export function useIsInstalled(): boolean {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    const mql = window.matchMedia?.("(display-mode: standalone)");
    if (!mql) return;
    const onChange = () => setInstalled(isStandalone());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return installed;
}
