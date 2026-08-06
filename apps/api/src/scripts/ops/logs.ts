import "reflect-metadata";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { ConfigService } from "@nestjs/config";
import { RailwayClient } from "../../observability/railway.client";
import { VercelLogsClient } from "../../observability/vercel-logs.client";
import {
  QueueInspectorService,
  INSPECTABLE_STATES,
  type InspectableState,
} from "../../observability/queue-inspector.service";
import { QueueConfigService } from "../../common/queue/queue-config.service";
import { matchesFilters, type LogLevel, type LogRecord } from "../../observability/log-line.parser";

/**
 * One query across the estate's logs, from a terminal.
 *
 *   pnpm --filter api ops:logs railway --level error --since 1h
 *   pnpm --filter api ops:logs vercel  --project uprise-api --since 30m
 *   pnpm --filter api ops:logs queue   --queue integration-sync --state delayed,failed
 *   pnpm --filter api ops:logs all     --level error --since 1h --json
 *
 * Deliberately does NOT boot the Nest application context the way the other scripts do. Reading
 * logs should not require a database connection or the full env-validation surface — an incident
 * is exactly when half your env is the thing that is broken. It builds the three clients directly
 * over a ConfigService backed by process.env.
 *
 * IMPORTANT: it reads whatever env it is given. Run locally with the default `apps/api/.env` and
 * `ops:logs queue` inspects your LOCAL Redis, not production — which is why every run prints the
 * target it actually reached (host only, never a credential). Reading a local queue and concluding
 * production is healthy is the exact failure this tool exists to prevent.
 *
 * To point it at production, override just the variable you need:
 *   BULLMQ_REDIS_URL="<prod>" pnpm --filter api ops:logs queue --state delayed
 */

const ENV_CANDIDATES = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "apps/api/.env"),
  resolve(process.cwd(), "../../apps/api/.env"),
];

/**
 * Minimal `.env` reader — `dotenv` is not an apps/api dependency and one script does not justify
 * adding it. Existing process env always wins, so `BULLMQ_REDIS_URL=… pnpm ops:logs` overrides the
 * file exactly as the documented production usage expects.
 */
function loadEnvFile(path: string): void {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

type Args = {
  command: string;
  level?: LogLevel;
  domain?: string;
  grep?: string;
  project: string;
  sinceMs?: number;
  queues: string[];
  states: InspectableState[];
  limit: number;
  json: boolean;
};

const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

/** `90s` / `30m` / `2h` / `3d` → milliseconds. */
export function parseSince(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = /^(\d+)\s*([smhd])$/i.exec(raw.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const perUnit: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (perUnit[unit] ?? 0);
}

export function parseArgs(argv: string[]): Args {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    return value && !value.startsWith("--") ? value : undefined;
  };
  const sinceMs = parseSince(flag("since"));
  const levelRaw = flag("level")?.toLowerCase();
  const states = (flag("state") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is InspectableState => (INSPECTABLE_STATES as readonly string[]).includes(s));

  return {
    command: (argv[0] && !argv[0].startsWith("--") ? argv[0] : "all").toLowerCase(),
    level: LEVELS.includes(levelRaw as LogLevel) ? (levelRaw as LogLevel) : undefined,
    domain: flag("domain"),
    grep: flag("grep") ?? flag("q"),
    project: flag("project") ?? "uprise-api",
    sinceMs: sinceMs ? Date.now() - sinceMs : undefined,
    queues: (flag("queue") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    states,
    limit: Math.min(Math.max(1, Number(flag("limit") ?? "100") || 100), 500),
    json: argv.includes("--json"),
  };
}

/** Host only — never a credential. See dev/ai/how-to/env-access.md. */
function hostOf(url: string | undefined): string {
  if (!url) return "(not configured)";
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

function printRecords(records: LogRecord[], json: boolean): void {
  const out = (line: string) => process.stdout.write(`${line}\n`);
  if (json) {
    out(JSON.stringify(records, null, 2));
    return;
  }
  if (records.length === 0) {
    out("  (no matching log lines)");
    return;
  }
  for (const record of records) {
    const domain = record.domain ? ` [${record.domain}]` : "";
    out(`${record.at}  ${LEVEL_LABEL[record.level]}  ${record.service}${domain}  ${record.message}`);
    if (record.context && Object.keys(record.context).length > 0) {
      out(`                                    ${JSON.stringify(record.context)}`);
    }
  }
}

async function main(): Promise<void> {
  for (const path of ENV_CANDIDATES) {
    if (existsSync(path)) loadEnvFile(path);
  }
  const args = parseArgs(process.argv.slice(2));
  const out = (line: string) => process.stdout.write(`${line}\n`);
  const config = new ConfigService(process.env);
  const warnings: string[] = [];

  const railway = new RailwayClient(config);
  const vercel = new VercelLogsClient(config);
  const queueConfig = new QueueConfigService(config);
  const inspector = new QueueInspectorService(queueConfig);

  const wantsRailway = args.command === "railway" || args.command === "all";
  const wantsVercel = args.command === "vercel" || args.command === "all";
  const wantsQueue = args.command === "queue" || args.command === "all";

  if (!args.json) {
    // Which estate did this actually reach? Without this line a local run reads as a prod answer.
    out("── targets ─────────────────────────────────────────────");
    if (wantsRailway) out(`  railway : ${railway.configured ? "configured" : "(no RAILWAY_TOKEN)"}`);
    if (wantsVercel) out(`  vercel  : ${vercel.configured ? args.project : "(no VERCEL_TOKEN)"}`);
    if (wantsQueue) {
      out(
        `  redis   : ${hostOf(queueConfig.hasRedisConfigured ? queueConfig.redisUrl : undefined)}` +
          ` (prefix ${queueConfig.queuePrefix})`,
      );
    }
    out("");
  }

  if (wantsQueue) {
    const jobs = await inspector.listJobs({
      queues: args.queues,
      states: args.states,
      limit: args.limit,
      warnings,
    });
    if (args.json) {
      out(JSON.stringify(jobs, null, 2));
    } else {
      out(`── queue jobs (${jobs.length}) ──────────────────────────────`);
      if (jobs.length === 0) out("  (no jobs in the requested states)");
      for (const job of jobs) {
        const attempts = job.attemptsAllowed ? `${job.attemptsMade}/${job.attemptsAllowed}` : `${job.attemptsMade}`;
        out(`${job.queue}  ${job.state.toUpperCase()}  ${job.id}  attempts ${attempts}`);
        if (job.nextRunAt) out(`    next run : ${job.nextRunAt}`);
        if (job.failedReason) out(`    failed   : ${job.failedReason}`);
        out(`    data     : ${job.data}`);
      }
      out("");
    }
  }

  if (wantsRailway || wantsVercel) {
    const batches = await Promise.all([
      wantsRailway
        ? railway.environmentLogs({ limit: args.limit, filter: args.grep, warnings })
        : Promise.resolve<LogRecord[]>([]),
      wantsVercel
        ? vercel.buildLogs({
            project: args.project,
            limit: args.limit,
            sinceMs: args.sinceMs,
            warnings,
          })
        : Promise.resolve<LogRecord[]>([]),
    ]);
    const records = batches
      .flat()
      .filter((r) => matchesFilters(r, { level: args.level, domain: args.domain, q: args.grep }))
      .filter((r) => !args.sinceMs || Date.parse(r.at) >= args.sinceMs)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, args.limit);

    if (!args.json) out(`── logs (${records.length}) ─────────────────────────────────`);
    printRecords(records, args.json);
  }

  if (warnings.length > 0 && !args.json) {
    process.stderr.write(`\n── warnings ────────────────────────────────────────────\n`);
    for (const warning of warnings) process.stderr.write(`  ! ${warning}\n`);
  }
}

// Only run when invoked directly, so the arg helpers above stay unit-testable.
if (require.main === module) {
  void main().then(
    () => process.exit(0),
    (err: unknown) => {
      process.stderr.write(`ops:logs failed: ${String(err)}\n`);
      process.exit(1);
    },
  );
}
