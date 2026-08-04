import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DEPLOYED_APPS, PUBLIC_SERVICES, type AppDefinition } from "./platform-status.registry";
import type {
  AppStatus,
  DeployInfo,
  Health,
  PlatformStatus,
  PublicService,
  PublicStatus,
} from "./platform-status.types";

/**
 * MOCK. The product does not version its releases — there are no tags, and the deploy identity is
 * a commit sha, which is exactly what must not appear on a public page. The marketing status page
 * still wants the shape a status page has, so this is a stand-in and is labelled as one wherever
 * it is read. Replace it with a real release version the day one exists; do not derive it from a
 * sha, which would leak the thing the public payload exists to omit.
 */
export const PLATFORM_VERSION = "v2.14.0";

/** How long a snapshot is reused. */
const CACHE_MS = 30_000;

/** Per-probe ceiling. A hung host must not hold the whole page open. */
const PROBE_TIMEOUT_MS = 4_000;

@Injectable()
export class PlatformStatusService {
  private readonly log = new Logger(PlatformStatusService.name);
  /**
   * One snapshot shared by every caller.
   *
   * A refresh fans out to ~15 upstream requests (a health probe per app, plus one Vercel call and
   * one Railway call), so an uncached status page is both slow and a way to point the estate's own
   * traffic at itself. `inFlight` collapses concurrent misses into a single refresh — without it,
   * a page open in five tabs multiplies the fan-out by five.
   */
  private cache: { at: number; value: PlatformStatus } | null = null;
  private inFlight: Promise<PlatformStatus> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** The internal view: every app, with deploy shas. Super-admin only. */
  async status(): Promise<PlatformStatus> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.value;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.refresh()
      .then((value) => {
        this.cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  /**
   * The public view, derived from the same snapshot.
   *
   * Everything internal is dropped HERE, on the server: no sha, no project name, no origin, no
   * provider state, no per-app breakdown. What is left is a handful of named services and a word
   * each. `warnings` is dropped too — that a Vercel token expired is an operator's problem and
   * says nothing about whether the product works.
   */
  async publicStatus(): Promise<PublicStatus> {
    const snapshot = await this.status();

    const services: PublicService[] = PUBLIC_SERVICES.map(({ key, name }) => {
      const apps = snapshot.apps.filter(
        (a) => DEPLOYED_APPS.find((d) => d.key === a.key)?.publicService === key,
      );
      return { key, name, status: rollUpPublic(apps.map((a) => a.health)) };
    }).filter((s) => s.status !== undefined);

    const anyOutage = services.some((s) => s.status === "Outage");
    const anyDegraded = services.some((s) => s.status === "Degraded");
    return {
      ok: !anyOutage && !anyDegraded,
      summary: anyOutage
        ? "Some systems are down"
        : anyDegraded
          ? "Some systems are degraded"
          : "All systems operational",
      services,
      version: PLATFORM_VERSION,
      at: snapshot.at,
    };
  }

  /* ------------------------------------------------------------------ internals */

  private async refresh(): Promise<PlatformStatus> {
    const warnings: string[] = [];

    // Health probes and the two provider lookups run together: they are independent, and done
    // in series the page would wait the sum of every timeout rather than the longest one.
    const [healths, vercelDeploys, railwayDeploys] = await Promise.all([
      Promise.all(DEPLOYED_APPS.map((app) => this.probe(app))),
      this.vercelDeploys(warnings),
      this.railwayDeploys(warnings),
    ]);

    const apps: AppStatus[] = DEPLOYED_APPS.map((app, i) => {
      const deploy = app.host === "vercel" ? vercelDeploys.get(app.project) : railwayDeploys.get(app.project);
      const probed = healths[i];
      return {
        key: app.key,
        name: app.name,
        host: app.host,
        project: app.project,
        url: this.originFor(app),
        // An app with no probe of its own falls back to what its provider says about the last
        // deploy — for the worker that is the only health signal there is.
        health: probed.health === "unknown" ? healthFromDeploy(deploy) : probed.health,
        latencyMs: probed.latencyMs,
        detail: probed.detail ?? (probed.health === "unknown" ? "No health endpoint — deploy state only" : undefined),
        deploy,
      };
    });

    return {
      // Degraded is deliberately not an outage: the API reporting `ok: false` because one
      // optional integration is unconfigured must not paint the whole platform red.
      ok: !apps.some((a) => a.health === "down"),
      apps,
      at: new Date().toISOString(),
      warnings: warnings.length ? warnings : undefined,
    };
  }

  private originFor(app: AppDefinition): string | undefined {
    if (!app.envUrlKey) return undefined;
    const raw = this.config.get<string>(app.envUrlKey);
    return raw ? raw.replace(/\/$/, "") : undefined;
  }

  /** Hit an app's own health endpoint. Never throws — a failed probe IS the result. */
  private async probe(app: AppDefinition): Promise<{ health: Health; latencyMs?: number; detail?: string }> {
    if (!app.healthPath) return { health: "unknown" };
    const origin = this.originFor(app);
    if (!origin) return { health: "unknown", detail: `No ${app.envUrlKey} configured` };

    const started = Date.now();
    try {
      const res = await fetch(`${origin}${app.healthPath}`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { accept: "application/json" },
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) return { health: "down", latencyMs, detail: `HTTP ${res.status}` };

      // The API's own /health reports per-dependency checks; a false one is degraded rather than
      // down, because the app is answering and most of it works. Apps whose health endpoint
      // returns anything else (or nothing parseable) count as up on a 200.
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; checks?: Record<string, boolean> }
        | null;
      if (body && body.ok === false) {
        const failed = Object.entries(body.checks ?? {})
          .filter(([, v]) => !v)
          .map(([k]) => k);
        return {
          health: "degraded",
          latencyMs,
          detail: failed.length ? `Failing: ${failed.join(", ")}` : "Reported not ok",
        };
      }
      return { health: "up", latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const name = err instanceof Error ? err.name : "Error";
      return {
        health: "down",
        latencyMs,
        detail: name === "TimeoutError" ? `No response in ${PROBE_TIMEOUT_MS}ms` : name,
      };
    }
  }

  /**
   * Latest production deployment per Vercel project.
   *
   * One call, not one per project: `/v6/deployments` returns the account's deployments newest
   * first, so a single page covers all seven projects and the first hit per project is its latest.
   * Seven calls would be seven chances to trip the rate limit for the same answer.
   */
  private async vercelDeploys(warnings: string[]): Promise<Map<string, DeployInfo>> {
    const out = new Map<string, DeployInfo>();
    const token = this.config.get<string>("VERCEL_TOKEN");
    if (!token) {
      warnings.push("VERCEL_TOKEN not configured — Vercel deploy info unavailable");
      return out;
    }
    const teamId = this.config.get<string>("VERCEL_TEAM_ID");
    const qs = new URLSearchParams({ limit: "100", target: "production" });
    if (teamId) qs.set("teamId", teamId);

    try {
      const res = await fetch(`https://api.vercel.com/v6/deployments?${qs}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!res.ok) {
        warnings.push(`Vercel API returned HTTP ${res.status}`);
        return out;
      }
      const body = (await res.json()) as {
        deployments?: Array<{
          name?: string;
          state?: string;
          readyState?: string;
          created?: number;
          target?: string;
          meta?: { githubCommitSha?: string; githubCommitRef?: string };
        }>;
      };
      for (const d of body.deployments ?? []) {
        if (!d.name || out.has(d.name)) continue; // newest first — keep the first per project
        out.set(d.name, {
          sha: d.meta?.githubCommitSha,
          state: d.state ?? d.readyState,
          at: d.created ? new Date(d.created).toISOString() : undefined,
          target: d.meta?.githubCommitRef ?? d.target,
        });
      }
    } catch (err) {
      warnings.push(`Vercel API unreachable (${err instanceof Error ? err.name : "Error"})`);
    }
    return out;
  }

  /**
   * Latest deployment for the Railway worker.
   *
   * Railway is GraphQL-only, and its schema is versioned per environment, so this asks for the
   * narrowest thing that answers the question: the most recent deployment on the configured
   * service, with its status and commit. A failure here is a warning, never an error — the worker
   * still reports through its deploy state, and a status page that 500s because a provider API
   * moved is worse than one that says "deploy info unavailable".
   */
  private async railwayDeploys(warnings: string[]): Promise<Map<string, DeployInfo>> {
    const out = new Map<string, DeployInfo>();
    const token = this.config.get<string>("RAILWAY_TOKEN");
    const serviceId = this.config.get<string>("RAILWAY_SERVICE_ID");
    if (!token || !serviceId) {
      warnings.push("RAILWAY_TOKEN/RAILWAY_SERVICE_ID not configured — worker deploy info unavailable");
      return out;
    }

    const query = `query($serviceId: String!) {
      deployments(first: 1, input: { serviceId: $serviceId }) {
        edges { node { status createdAt meta } }
      }
    }`;

    try {
      const res = await fetch("https://backboard.railway.app/graphql/v2", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { serviceId } }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!res.ok) {
        warnings.push(`Railway API returned HTTP ${res.status}`);
        return out;
      }
      const body = (await res.json()) as {
        data?: {
          deployments?: {
            edges?: Array<{
              node?: { status?: string; createdAt?: string; meta?: { commitHash?: string; branch?: string } };
            }>;
          };
        };
        errors?: Array<{ message?: string }>;
      };
      if (body.errors?.length) {
        warnings.push(`Railway API error: ${body.errors[0]?.message ?? "unknown"}`);
        return out;
      }
      const node = body.data?.deployments?.edges?.[0]?.node;
      if (node) {
        out.set("worker", {
          sha: node.meta?.commitHash,
          state: node.status,
          at: node.createdAt,
          target: node.meta?.branch,
        });
      }
    } catch (err) {
      warnings.push(`Railway API unreachable (${err instanceof Error ? err.name : "Error"})`);
    }
    return out;
  }
}

/** Deploy state → health, for apps with no probe of their own (the worker). */
export function healthFromDeploy(deploy: DeployInfo | undefined): Health {
  if (!deploy?.state) return "unknown";
  const state = deploy.state.toUpperCase();
  if (state === "READY" || state === "SUCCESS") return "up";
  if (state === "ERROR" || state === "FAILED" || state === "CRASHED") return "down";
  // BUILDING / DEPLOYING / QUEUED: a deploy is in flight, which is not an outage but is not
  // a clean bill of health either.
  return "degraded";
}

/**
 * Several apps → one public word.
 *
 * The worst health wins: a service is only Operational when everything behind it is. `unknown`
 * is treated as operational rather than as a problem — it means "nothing to probe", which is the
 * worker's normal state, and a status page that cries outage over its own missing config trains
 * people to ignore it.
 */
export function rollUpPublic(healths: Health[]): PublicService["status"] {
  if (healths.some((h) => h === "down")) return "Outage";
  if (healths.some((h) => h === "degraded")) return "Degraded";
  return "Operational";
}
