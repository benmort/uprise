import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { RailwayClient } from "./railway.client";
import { VercelLogsClient } from "./vercel-logs.client";
import { QueueInspectorService, type InspectableState, type InspectedJob } from "./queue-inspector.service";
import { matchesFilters, type LogLevel, type LogRecord } from "./log-line.parser";
import { parseDrainBody, toLogRows } from "./vercel-drain";
import { redactedContextObject } from "../common/logging/log-redaction";

export type LogSource = "vercel" | "railway" | "stored";

export type LogQuery = {
  sources?: LogSource[];
  /** Vercel project name. Defaults to the API, which is where server errors surface. */
  project?: string;
  level?: LogLevel;
  domain?: string;
  /** Free text, pushed down to Railway's server-side filter where possible. */
  q?: string;
  sinceMs?: number;
  limit?: number;
};

export type LogQueryResult = {
  at: string;
  records: LogRecord[];
  /** Never throws on a provider outage — what failed is reported alongside what worked. */
  warnings: string[];
};

const DEFAULT_LIMIT = 100;
const DEFAULT_VERCEL_PROJECT = "uprise-api";

/** Ceiling on rows written per drain delivery — a burst must not become an unbounded insert. */
const DRAIN_ROW_CAP = 500;

/**
 * A level filter is a FLOOR, matching `atLeastLevel` on the parser side — `--level warn` means
 * warn and error. Only warn/error are ever stored, so the table is the two of them.
 */
const LEVELS_AT_OR_ABOVE: Readonly<Record<LogLevel, string[]>> = {
  debug: ["warn", "error"],
  info: ["warn", "error"],
  warn: ["warn", "error"],
  error: ["error"],
};

/**
 * One query across the estate's logs.
 *
 * The estate is split across two providers — the seven Next/Nest apps on Vercel, the BullMQ worker
 * on Railway — and until now answering "what errored in the last hour" meant knowing which half to
 * look in, then reading a live tail by eye. Worse, the failure that prompted this was in neither
 * place: it was a `failedReason` on a job hash in Redis, which is why the queue is a first-class
 * source here rather than a separate tool.
 *
 * Partial results beat no results. Each source contributes independently and a source that is
 * unreachable adds a warning instead of failing the query — during an incident the provider that
 * is down is often the one you least need.
 */
@Injectable()
export class ObservabilityService {
  constructor(
    private readonly railway: RailwayClient,
    private readonly vercel: VercelLogsClient,
    private readonly queues: QueueInspectorService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async queryLogs(query: LogQuery): Promise<LogQueryResult> {
    const warnings: string[] = [];
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), 500);
    // `stored` first and by default: it is the only source that survives provider retention, keeps
    // the context object as JSON, and covers Vercel runtime errors at all (Vercel exposes no
    // runtime-log API on Pro — see VercelLogsClient).
    const sources: LogSource[] = query.sources?.length ? query.sources : ["stored"];

    const batches = await Promise.all([
      sources.includes("stored") ? this.storedLogs(query, limit) : Promise.resolve<LogRecord[]>([]),
      sources.includes("railway")
        ? this.railway.environmentLogs({
            limit,
            // Railway matches server-side, so a text filter costs nothing to push down. Level and
            // domain still filter locally: they live inside the line, not in Railway's index.
            filter: query.q,
            warnings,
          })
        : Promise.resolve<LogRecord[]>([]),
      sources.includes("vercel")
        ? this.vercel.buildLogs({
            project: query.project ?? DEFAULT_VERCEL_PROJECT,
            limit,
            sinceMs: query.sinceMs,
            warnings,
          })
        : Promise.resolve<LogRecord[]>([]),
    ]);

    const records = batches
      .flat()
      .filter((record) => matchesFilters(record, { level: query.level, domain: query.domain, q: query.q }))
      .filter((record) => !query.sinceMs || Date.parse(record.at) >= query.sinceMs)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);

    return { at: new Date().toISOString(), records, warnings };
  }

  /**
   * Errors and warnings out of `ops.LogEvent` — the durable half.
   *
   * Filtering happens in SQL rather than in `matchesFilters`, because a stored query can span
   * months and pulling a month of rows back to filter three of them in JavaScript is not a query,
   * it is a download. The shape returned is identical either way, so callers cannot tell.
   */
  private async storedLogs(query: LogQuery, limit: number): Promise<LogRecord[]> {
    const levels = query.level ? LEVELS_AT_OR_ABOVE[query.level] : undefined;
    const where: Prisma.LogEventWhereInput = {
      ...(levels ? { level: { in: levels } } : {}),
      ...(query.domain ? { domain: query.domain } : {}),
      ...(query.sinceMs ? { at: { gte: new Date(query.sinceMs) } } : {}),
      ...(query.q ? { message: { contains: query.q, mode: "insensitive" as const } } : {}),
    };
    const rows = await this.prisma.logEvent.findMany({
      where,
      orderBy: { at: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      at: row.at.toISOString(),
      source: "stored" as const,
      service: row.service,
      level: row.level === "error" ? ("error" as const) : ("warn" as const),
      message: row.message,
      domain: row.domain,
      context: (row.context ?? undefined) as Record<string, unknown> | undefined,
    }));
  }

  /**
   * Delete stored log rows past the retention window. Driven by the same CRON_SECRET pattern as
   * the status recorder, because an errors-only table still grows without a sweep.
   */
  async sweepRetention(): Promise<{ deleted: number; olderThan: string; retentionDays: number }> {
    const configured = Number(this.config.get<string>("OPS_LOG_RETENTION_DAYS", "30"));
    const retentionDays = Number.isFinite(configured) && configured > 0 ? Math.trunc(configured) : 30;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const { count } = await this.prisma.logEvent.deleteMany({ where: { at: { lt: cutoff } } });
    return { deleted: count, olderThan: cutoff.toISOString(), retentionDays };
  }

  /**
   * Persist a verified Vercel log-drain delivery.
   *
   * Filtering happens here, not at the drain: Vercel has no server-side level filter, so the
   * firehose arrives and this is where it stops. Only warn/error and 5xx are stored — see
   * `isWorthStoring`.
   *
   * Never throws on a bad batch. Vercel retries a non-2xx delivery, so failing here on one
   * malformed entry re-delivers the whole batch and can wedge into a loop; the count of what was
   * kept is the honest answer instead.
   */
  async ingestVercelDrain(rawBody: string): Promise<{ received: number; stored: number }> {
    const entries = parseDrainBody(rawBody);
    const rows = toLogRows(entries, DRAIN_ROW_CAP);
    if (rows.length === 0) return { received: entries.length, stored: 0 };
    try {
      await this.prisma.logEvent.createMany({
        data: rows.map((row) => ({
          at: row.at,
          service: row.service,
          domain: row.domain,
          level: row.level,
          message: row.message,
          context: (redactedContextObject(row.context) ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      });
      return { received: entries.length, stored: rows.length };
    } catch {
      return { received: entries.length, stored: 0 };
    }
  }

  async queueJobs(opts: {
    queues?: string[];
    states?: InspectableState[];
    limit?: number;
  }): Promise<{ at: string; jobs: InspectedJob[]; warnings: string[] }> {
    const warnings: string[] = [];
    const jobs = await this.queues.listJobs({ ...opts, warnings });
    return { at: new Date().toISOString(), jobs, warnings };
  }
}
