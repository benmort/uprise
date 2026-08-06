import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parseLogLine, type LogRecord } from "./log-line.parser";

const REQUEST_TIMEOUT_MS = 8_000;
const VERCEL_API = "https://api.vercel.com";

/** Runtime logs are per-DEPLOYMENT, so a window spanning a deploy needs more than one. */
const DEFAULT_DEPLOYMENTS_SCANNED = 3;

type VercelDeployment = {
  uid?: string;
  name?: string;
  state?: string;
  readyState?: string;
  created?: number;
};

type VercelEvent = {
  type?: string;
  created?: number;
  date?: number;
  payload?: { text?: string; deploymentId?: string };
  text?: string;
  level?: string;
};

/**
 * Vercel **build** logs for the seven Next/Nest projects.
 *
 * Scope note, because the distinction cost time to establish: `/v3/deployments/:id/events` returns
 * BUILD events (install, compile, cache, and — the reason this matters here — the output of
 * `vercel-build.sh`, where a failed `prisma migrate deploy` shows up). It is NOT the runtime log.
 *
 * Vercel exposes no REST endpoint for **runtime** logs on the Pro plan: `/v1|v2|v3/.../runtime-logs`
 * all 404, and `vercel logs <url> --json` is a CLI-only stream. Runtime errors are therefore
 * captured at SOURCE instead — `DomainLogger` writes them straight to `ops.LogEvent` — which is
 * strictly better than fetching them back: the context object survives as JSON instead of being
 * flattened into a string, and retention is ours rather than Vercel's ~1 day.
 *
 * Two API quirks shape the code below:
 *
 * 1. **Events hang off a deployment, not a project.** A window spanning a deploy has to be
 *    assembled from several deployments. `SCANNED` bounds that fan-out.
 * 2. **The newest deployment row is not necessarily the serving one.** A CANCELED or ERRORed build
 *    sits at the top of the list while an earlier READY one keeps serving — the same rule
 *    `PlatformStatusService.vercelDeploys` follows.
 */
@Injectable()
export class VercelLogsClient {
  constructor(private readonly config: ConfigService) {}

  get token(): string | undefined {
    return this.config.get<string>("VERCEL_TOKEN")?.trim() || undefined;
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  private teamQuery(): string {
    const teamId = this.config.get<string>("VERCEL_TEAM_ID")?.trim();
    return teamId ? `teamId=${encodeURIComponent(teamId)}` : "";
  }

  private async get<T>(path: string, warnings: string[]): Promise<T | undefined> {
    const token = this.token;
    if (!token) {
      warnings.push("VERCEL_TOKEN not configured — Vercel logs unavailable");
      return undefined;
    }
    try {
      const res = await fetch(`${VERCEL_API}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        // 403 here is nearly always a teamId that doesn't match the token's team rather than a
        // scope problem — say so, because the two look identical from the status code alone.
        warnings.push(
          res.status === 403
            ? "Vercel API returned HTTP 403 — check VERCEL_TEAM_ID matches the token's team"
            : `Vercel API returned HTTP ${res.status}`,
        );
        return undefined;
      }
      return (await res.json()) as T;
    } catch (err) {
      warnings.push(`Vercel API unreachable (${err instanceof Error ? err.name : "Error"})`);
      return undefined;
    }
  }

  /** Recent READY production deployments for a project, newest first. */
  async recentDeployments(
    project: string,
    limit: number,
    warnings: string[],
  ): Promise<Array<{ id: string; createdAt: number }>> {
    const qs = [
      `app=${encodeURIComponent(project)}`,
      "target=production",
      "limit=20",
      this.teamQuery(),
    ]
      .filter(Boolean)
      .join("&");
    const body = await this.get<{ deployments?: VercelDeployment[] }>(`/v6/deployments?${qs}`, warnings);
    return (body?.deployments ?? [])
      .filter((d) => (d.state ?? d.readyState ?? "").toUpperCase() === "READY" && d.uid)
      .slice(0, limit)
      .map((d) => ({ id: d.uid as string, createdAt: d.created ?? 0 }));
  }

  /**
   * Build logs for a project, newest first — most usefully, the `vercel-build.sh` output that
   * says whether a migration applied.
   *
   * `since` filters client-side because the events endpoint's own time parameters are per
   * deployment and inconsistent between API versions; the volume in a retention window is small
   * enough that filtering here is honest and predictable.
   */
  async buildLogs(opts: {
    project: string;
    limit: number;
    sinceMs?: number;
    deploymentsScanned?: number;
    warnings: string[];
  }): Promise<LogRecord[]> {
    if (!this.configured) {
      opts.warnings.push("VERCEL_TOKEN not configured — Vercel logs unavailable");
      return [];
    }
    const deployments = await this.recentDeployments(
      opts.project,
      opts.deploymentsScanned ?? DEFAULT_DEPLOYMENTS_SCANNED,
      opts.warnings,
    );
    if (deployments.length === 0) {
      opts.warnings.push(`No READY production deployment found for ${opts.project}`);
      return [];
    }

    const records: LogRecord[] = [];
    for (const deployment of deployments) {
      if (records.length >= opts.limit) break;
      const qs = [`limit=${Math.min(1000, opts.limit * 5)}`, "direction=backward", this.teamQuery()]
        .filter(Boolean)
        .join("&");
      const body = await this.get<VercelEvent[] | { events?: VercelEvent[] }>(
        `/v3/deployments/${encodeURIComponent(deployment.id)}/events?${qs}`,
        opts.warnings,
      );
      if (!body) continue;
      const events = Array.isArray(body) ? body : (body.events ?? []);
      for (const event of events) {
        const text = event.payload?.text ?? event.text;
        if (!text) continue;
        const atMs = event.created ?? event.date ?? 0;
        if (opts.sinceMs && atMs && atMs < opts.sinceMs) continue;
        records.push(
          parseLogLine({
            message: text,
            source: "vercel",
            service: opts.project,
            at: atMs ? new Date(atMs).toISOString() : new Date().toISOString(),
            severity: event.level,
          }),
        );
      }
    }

    return records.sort((a, b) => b.at.localeCompare(a.at)).slice(0, opts.limit);
  }
}
