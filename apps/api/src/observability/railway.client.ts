import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parseLogLine, type LogRecord } from "./log-line.parser";

/** Per-call ceiling. A hung provider must never hold a status page or a log query open. */
const REQUEST_TIMEOUT_MS = 8_000;

const RAILWAY_GRAPHQL = "https://backboard.railway.com/graphql/v2";

/**
 * Railway's GraphQL API — the worker's half of the estate.
 *
 * Extracted from `PlatformStatusService`, which had this as a private method, so the auth rule
 * below lives in exactly one place. Two copies of a rule this easy to get wrong is one copy too
 * many.
 *
 * **Auth is `Project-Access-Token`, not `Authorization: Bearer`.** `RAILWAY_TOKEN` is the worker's
 * project-scoped token and Railway answers Bearer with "Not Authorized" for those. Swapping in an
 * account/team token would mean switching to Bearer — the warning text says so, so whoever hits it
 * finds out why.
 *
 * Every failure becomes a warning rather than a throw: a log viewer that 500s because a provider
 * API moved is worse than one that says "Railway unavailable" and still shows you the other
 * sources.
 */
@Injectable()
export class RailwayClient {
  /** Resolved once per process — it never changes for a given token. */
  private envId?: string;

  constructor(private readonly config: ConfigService) {}

  get token(): string | undefined {
    return this.config.get<string>("RAILWAY_TOKEN")?.trim() || undefined;
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  async query<T>(
    token: string,
    query: string,
    variables: Record<string, unknown>,
    warnings: string[],
  ): Promise<T | undefined> {
    try {
      const res = await fetch(RAILWAY_GRAPHQL, {
        method: "POST",
        headers: { "Project-Access-Token": token, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        warnings.push(`Railway API returned HTTP ${res.status}`);
        return undefined;
      }
      const body = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
      if (body.errors?.length) {
        warnings.push(`Railway API error: ${body.errors[0]?.message ?? "unknown"}`);
        return undefined;
      }
      return body.data;
    } catch (err) {
      warnings.push(`Railway API unreachable (${err instanceof Error ? err.name : "Error"})`);
      return undefined;
    }
  }

  /**
   * The environment the worker's service instance lives in. Configured wins; otherwise a
   * project-scoped token can name its own, which keeps the common case zero-config. An
   * account/team token cannot answer that and needs the env var.
   */
  async environmentId(token: string, warnings: string[]): Promise<string | undefined> {
    const configured = this.config.get<string>("RAILWAY_ENVIRONMENT_ID")?.trim();
    if (configured) return configured;
    if (this.envId) return this.envId;

    const data = await this.query<{ projectToken?: { environmentId?: string } | null }>(
      token,
      `{ projectToken { environmentId } }`,
      {},
      warnings,
    );
    const resolved = data?.projectToken?.environmentId;
    if (!resolved) {
      warnings.push("Railway environment unresolved — set RAILWAY_ENVIRONMENT_ID");
      return undefined;
    }
    this.envId = resolved;
    return resolved;
  }

  /**
   * Worker logs, newest first.
   *
   * `filter` is Railway's own server-side full-text match, so a `--grep` is pushed down to the
   * provider instead of pulling a window back and filtering locally. `beforeLimit` + `anchorDate`
   * is Railway's paging idiom: an empty anchor means "from now", and the limit counts backwards
   * from it.
   */
  async environmentLogs(opts: {
    limit: number;
    filter?: string;
    /** ISO timestamp to read backwards from. Empty/absent means "from now". */
    anchorDate?: string;
    warnings: string[];
  }): Promise<LogRecord[]> {
    const token = this.token;
    if (!token) {
      opts.warnings.push("RAILWAY_TOKEN not configured — worker logs unavailable");
      return [];
    }
    const environmentId = await this.environmentId(token, opts.warnings);
    if (!environmentId) return [];

    const query = `query($environmentId: String!, $filter: String, $beforeLimit: Int!, $anchorDate: String) {
      environmentLogs(environmentId: $environmentId, filter: $filter, beforeLimit: $beforeLimit, anchorDate: $anchorDate) {
        message
        severity
        timestamp
      }
    }`;

    const data = await this.query<{
      environmentLogs?: Array<{ message?: string; severity?: string; timestamp?: string }> | null;
    }>(
      token,
      query,
      {
        environmentId,
        filter: opts.filter ?? null,
        beforeLimit: opts.limit,
        anchorDate: opts.anchorDate ?? "",
      },
      opts.warnings,
    );

    return (data?.environmentLogs ?? []).map((row) =>
      parseLogLine({
        message: row.message ?? "",
        source: "railway",
        service: "worker",
        at: row.timestamp ?? new Date().toISOString(),
        severity: row.severity,
      }),
    );
  }
}
