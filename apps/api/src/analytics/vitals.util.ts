/**
 * Web-vitals beacon sanitisation. The field PWA posts batches of real-user load
 * metrics; the browser side is untrusted input, so everything is allowlisted and
 * clamped here before it becomes AnalyticsSnapshot rows. Invalid entries are
 * dropped (never rejected as a whole — a beacon is fire-and-forget).
 */

export const VITAL_METRICS = ["lcp", "cls", "inp", "fcp", "ttfb"] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];

export const MAX_VITALS_PER_BATCH = 20;

/** Upper bounds per metric: ms-based vitals capped at 10 minutes, CLS is unitless. */
const MAX_VALUE: Record<VitalMetric, number> = {
  lcp: 600_000,
  inp: 600_000,
  fcp: 600_000,
  ttfb: 600_000,
  cls: 100,
};

const CONNECTIONS = new Set(["slow-2g", "2g", "3g", "4g"]);
const DEVICES = new Set(["mobile", "tablet", "desktop"]);

export interface CleanVital {
  metricName: `webvital.${VitalMetric}`;
  metricValue: number;
  labels: { route: string; connection: string | null; device: string | null };
}

/** Keep route labels low-cardinality: path only (no query/hash), capped length. The
 *  client already normalises ids to `:id`; this is the server-side backstop. */
function cleanRoute(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  const path = value.split(/[?#]/)[0];
  return path.length > 100 ? path.slice(0, 100) : path;
}

export function sanitiseVitals(body: unknown): CleanVital[] {
  const list = (body as { vitals?: unknown })?.vitals;
  if (!Array.isArray(list)) return [];
  const out: CleanVital[] = [];
  for (const entry of list.slice(0, MAX_VITALS_PER_BATCH)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { metric, value, route, connection, device } = entry as Record<string, unknown>;
    const name = typeof metric === "string" ? metric.toLowerCase() : "";
    if (!(VITAL_METRICS as readonly string[]).includes(name)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    const m = name as VitalMetric;
    out.push({
      metricName: `webvital.${m}`,
      metricValue: Math.min(value, MAX_VALUE[m]),
      labels: {
        route: cleanRoute(route),
        connection: typeof connection === "string" && CONNECTIONS.has(connection) ? connection : null,
        device: typeof device === "string" && DEVICES.has(device) ? device : null,
      },
    });
  }
  return out;
}
