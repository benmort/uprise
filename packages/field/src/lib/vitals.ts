// Web-vitals beacon plumbing — the pure half of real-user monitoring. The component
// (apps/field web-vitals.tsx) wires useReportWebVitals + pagehide to this; everything
// here is side-effect-free so the buffering/normalisation rules are unit-tested.

/** The metrics the api ingests (see apps/api analytics vitals.util.ts). */
const REPORTED_METRICS = new Set(["lcp", "cls", "inp", "fcp", "ttfb"]);

/** Shape of a `useReportWebVitals` callback argument (subset we consume). */
export type WebVitalMetric = { id: string; name: string; value: number };

export type VitalsBeaconEntry = {
  metric: string;
  value: number;
  route: string;
  connection: string | null;
  device: string | null;
};

/**
 * Collapse concrete path segments that look like record ids (cuid/uuid/numeric) to
 * `:id`, so the route label stays low-cardinality — `/ckw3…f2/door/42` → `/:id/door/:id`.
 */
export function normaliseRoute(pathname: string): string {
  if (!pathname.startsWith("/")) return "/";
  const path = pathname.split(/[?#]/)[0];
  const segments = path.split("/").map((seg) => {
    if (seg === "") return seg;
    if (/^\d+$/.test(seg)) return ":id";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
    if (/^c[a-z0-9]{20,}$/i.test(seg)) return ":id"; // cuid/cuid2
    return seg;
  });
  return segments.join("/") || "/";
}

/** Coarse device class from the user-agent — a label, not fingerprinting. */
export function deviceClass(userAgent: string): "mobile" | "tablet" | "desktop" {
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(userAgent)) return "mobile";
  return "desktop";
}

export interface VitalsBuffer {
  /** Record a metric against the route it was measured on. CLS/INP re-report under the
   *  same id as they grow — the latest value per id wins. Unknown metrics are ignored. */
  add(metric: WebVitalMetric, route: string): void;
  /** Empty the buffer into a beacon payload (null when there is nothing to send). */
  drain(context: { connection: string | null; device: string | null }): {
    vitals: VitalsBeaconEntry[];
  } | null;
}

export function createVitalsBuffer(): VitalsBuffer {
  const byId = new Map<string, { metric: string; value: number; route: string }>();
  return {
    add(metric, route) {
      const name = metric.name.toLowerCase();
      if (!REPORTED_METRICS.has(name)) return;
      if (!Number.isFinite(metric.value)) return;
      byId.set(metric.id, { metric: name, value: metric.value, route });
    },
    drain(context) {
      if (byId.size === 0) return null;
      const vitals = Array.from(byId.values()).map((v) => ({ ...v, ...context }));
      byId.clear();
      return { vitals };
    },
  };
}
