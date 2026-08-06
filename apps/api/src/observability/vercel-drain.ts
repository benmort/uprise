import { createHmac, timingSafeEqual } from "node:crypto";
import { parseLogLine, type LogLevel } from "./log-line.parser";

/**
 * Vercel log-drain intake.
 *
 * Closes the last gap in the estate's logging. The API and the worker write their own warn/error
 * into `ops.LogEvent` through `DomainLogger`, but the six Next apps are not Nest — an SSR render
 * error or a route-handler failure that never reaches a client error boundary exists only in
 * Vercel's ~1-day buffer, and Vercel exposes no API to read it back. A drain is the one supported
 * way to get that output off the platform, and it is available on Pro at no extra cost.
 *
 * Everything here is pure so it can be tested without a request.
 */

/** One entry as Vercel delivers it. Only the fields this intake reads are described. */
export type VercelDrainEntry = {
  id?: string;
  message?: string;
  /** Epoch millis. */
  timestamp?: number;
  /** "stdout" | "stderr". */
  type?: string;
  /** "build" | "static" | "external" | "lambda" | "edge". */
  source?: string;
  projectName?: string;
  projectId?: string;
  deploymentId?: string;
  host?: string;
  requestId?: string;
  statusCode?: number;
  path?: string;
  /** "info" | "warning" | "error". */
  level?: string;
  proxy?: { statusCode?: number; method?: string; path?: string };
};

/**
 * Verify `x-vercel-signature`: HMAC-SHA1 of the RAW body under the drain's secret.
 *
 * Over the raw bytes, never a re-serialised `@Body()` — re-serialisation reorders keys and changes
 * whitespace, and the digest stops matching. Constant-time compare, and an unconfigured secret is
 * a refusal rather than a pass: a public-allowlisted route whose only protection is the signature
 * must fail closed.
 */
export function verifyDrainSignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !signature || !rawBody) return false;
  const expected = createHmac("sha1", secret)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself leak a bit of information.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Parse a drain body. Vercel delivers either a JSON array (`deliveryFormat: "json"`) or
 * newline-delimited objects (`"ndjson"`); both are accepted so the drain can be reconfigured
 * without a redeploy. A malformed line is skipped rather than failing the batch — losing one entry
 * beats 400-ing a delivery Vercel will then retry in full.
 */
export function parseDrainBody(raw: string): VercelDrainEntry[] {
  const text = raw.trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? (parsed as VercelDrainEntry[]) : [];
    } catch {
      return [];
    }
  }
  const out: VercelDrainEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") out.push(parsed as VercelDrainEntry);
    } catch {
      // Skip the bad line, keep the batch.
    }
  }
  return out;
}

/** Vercel's severity vocabulary → ours. */
export function drainLevel(entry: VercelDrainEntry): LogLevel {
  const level = (entry.level ?? "").toLowerCase();
  if (level === "error" || level === "fatal") return "error";
  if (level === "warning" || level === "warn") return "warn";
  // stderr without an explicit level is how an uncaught throw usually arrives.
  if ((entry.type ?? "").toLowerCase() === "stderr") return "error";
  return "info";
}

/**
 * Is this entry worth storing?
 *
 * A drain is a firehose — every request, every static asset. Storing all of it in the database you
 * reach for when that database is misbehaving is both expensive and circular, which is the same
 * reason `ops.LogEvent` takes only warn/error from DomainLogger. So: warn and error, plus any 5xx,
 * because a lambda that 500s often reports at info level and that is exactly the line worth having.
 */
export function isWorthStoring(entry: VercelDrainEntry): boolean {
  const level = drainLevel(entry);
  if (level === "warn" || level === "error") return true;
  const status = entry.statusCode ?? entry.proxy?.statusCode ?? 0;
  return status >= 500;
}

export type DrainRow = {
  service: string;
  domain: string;
  level: "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
  at: Date;
};

/** Entries that clear `isWorthStoring`, shaped into `ops.LogEvent` rows. */
export function toLogRows(entries: VercelDrainEntry[], cap: number): DrainRow[] {
  const rows: DrainRow[] = [];
  for (const entry of entries) {
    if (rows.length >= cap) break;
    if (!isWorthStoring(entry)) continue;

    const at = entry.timestamp ? new Date(entry.timestamp) : new Date();
    // Runs the same recovery the provider clients use: if the line DID come from a Nest app on
    // Vercel it still carries `[domain] message {json}`, and that structure is worth keeping.
    const parsed = parseLogLine({
      message: entry.message ?? "",
      source: "vercel",
      service: entry.projectName ?? "vercel",
      at: at.toISOString(),
      severity: entry.level,
    });

    const status = entry.statusCode ?? entry.proxy?.statusCode;
    rows.push({
      service: entry.projectName ?? "vercel",
      // No DomainLogger domain on a Next app, so the drain's own source ("lambda", "edge", …)
      // stands in — prefixed so it is never mistaken for one of ours.
      domain: parsed.domain ?? `vercel:${entry.source ?? "unknown"}`,
      level: drainLevel(entry) === "warn" ? "warn" : "error",
      message: (parsed.message || entry.message || "").slice(0, 8_000),
      context: {
        ...(parsed.context ?? {}),
        ...(entry.requestId ? { requestId: entry.requestId } : {}),
        ...(entry.deploymentId ? { deploymentId: entry.deploymentId } : {}),
        ...(entry.path || entry.proxy?.path ? { path: entry.path ?? entry.proxy?.path } : {}),
        ...(status ? { statusCode: status } : {}),
        ...(entry.host ? { host: entry.host } : {}),
      },
      at,
    });
  }
  return rows;
}
