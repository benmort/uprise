"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { getApiUrl } from "@uprise/api-client";
import { createVitalsBuffer, deviceClass, normaliseRoute } from "@uprise/field";

/**
 * Real-user monitoring: buffers the page's web vitals (LCP/CLS/INP/FCP/TTFB) and flushes
 * one keepalive POST to the api when the tab is backgrounded or unloaded — never on the
 * volunteer's critical path. Fire-and-forget: failures (offline, expired session) are
 * swallowed; the session cookie rides along via credentials so the api can tenant-stamp.
 */
export function WebVitalsReporter() {
  const buffer = useRef(createVitalsBuffer()).current;
  const pathname = usePathname();
  // Ref, not state — metrics must tag the route they were measured on without re-rendering.
  const routeRef = useRef("/");
  routeRef.current = normaliseRoute(pathname || "/");

  useReportWebVitals((metric) => buffer.add(metric, routeRef.current));

  useEffect(() => {
    const flush = () => {
      const connection =
        (navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null;
      const payload = buffer.drain({ connection, device: deviceClass(navigator.userAgent) });
      if (!payload) return;
      void fetch(`${getApiUrl()}/analytics/vitals`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Safari doesn't reliably fire visibilitychange on unload; pagehide covers it.
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [buffer]);

  return null;
}
