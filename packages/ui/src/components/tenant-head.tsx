"use client";

import { useEffect } from "react";

/**
 * Sets the browser-tab title + favicon to the current tenant's, client-side. Used where the
 * tenant is only known after hydration (the field PWA — tenant from session; the auth volunteer
 * flow — tenant from the link/brand fetch), so the SSR-time `metadata` can't be tenant-specific.
 * Renders nothing. Server-rendered surfaces that know their tenant up-front should prefer Next's
 * `generateMetadata` instead (no flash); this is for the client-resolved case.
 */
export function TenantHead({ title, faviconUrl }: { title?: string | null; faviconUrl?: string | null }) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  useEffect(() => {
    if (!faviconUrl || typeof document === "undefined") return;
    // Point the existing icon link at the tenant's (square) logo, creating one if absent.
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [faviconUrl]);

  return null;
}
