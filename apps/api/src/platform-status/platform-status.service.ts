import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { DEPLOYED_APPS, PUBLIC_SERVICES, type AppDefinition } from "./platform-status.registry";
import type {
  AppStatus,
  DeployInfo,
  Health,
  PlatformStatus,
  PublicDay,
  PublicIncident,
  PublicService,
  PublicServiceStatus,
  PublicStatus,
} from "./platform-status.types";

/** How long a snapshot is reused. */
const CACHE_MS = 30_000;

/** Per-probe ceiling. A hung host must not hold the whole page open. */
const PROBE_TIMEOUT_MS = 4_000;

/** The window the public page reports uptime and incidents over. */
const HISTORY_DAYS = 90;

/** How many past incidents the public page lists. Enough to be honest, short enough to read. */
const INCIDENT_LIMIT = 5;

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
  /** Resolved once from the Railway token when RAILWAY_ENVIRONMENT_ID isn't configured. */
  private railwayEnvId: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

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
    const live = this.rollUp(snapshot);

    // History is a read of two small tables; a failure there must not take the live view with it,
    // because "is it up right now" is the question the page exists to answer.
    const [uptime, days, incidents] = await Promise.all([
      this.uptimeByService().catch(() => new Map<string, number>()),
      this.dailyStates().catch(() => [] as PublicDay[]),
      this.recentIncidents().catch(() => [] as PublicIncident[]),
    ]);

    const services: PublicService[] = live.map((s) => ({
      ...s,
      uptime90d: uptime.get(s.key) ?? null,
    }));

    return {
      ...summarise(services),
      services,
      days,
      incidents,
      at: snapshot.at,
    };
  }

  /**
   * Record one point of history: a check row, plus whatever incidents opened or resolved since
   * the last run. Called by the platform cron (see vercel.json), never by a page.
   *
   * The check is the source of uptime, so it is written every run whatever the outcome — a
   * status page whose "99.9%" is computed only from rows it bothered to write when things were
   * fine is arithmetic, not measurement.
   */
  async record(): Promise<{ ok: boolean; opened: number; resolved: number }> {
    const snapshot = await this.status();
    const services = this.rollUp(snapshot);
    const ok = !services.some((s) => s.status === "Outage" || s.status === "Degraded");
    const map = Object.fromEntries(services.map((s) => [s.key, s.status]));

    const open = await this.prisma.statusIncident.findMany({ where: { resolvedAt: null } });
    const openByKey = new Map(open.map((i) => [i.serviceKey, i]));
    const tenantId = await this.platformTenantId();

    let opened = 0;
    let resolved = 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.statusCheck.create({ data: { ok, services: map as Prisma.InputJsonValue } });

      for (const service of services) {
        const existing = openByKey.get(service.key);
        const troubled = service.status === "Outage" || service.status === "Degraded";

        if (troubled && !existing) {
          const incident = await tx.statusIncident.create({
            data: { serviceKey: service.key, serviceName: service.name, status: service.status },
          });
          opened += 1;
          if (tenantId) {
            await this.outbox.append(tx, {
              tenantId,
              eventType: "ops.status-incident.opened",
              aggregateId: incident.id,
              payload: {
                incidentId: incident.id,
                serviceKey: service.key,
                serviceName: service.name,
                status: service.status,
                startedAt: incident.startedAt.toISOString(),
              },
            });
          }
          continue;
        }

        // An incident that started degraded and became an outage keeps the worse word, so the
        // history doesn't remember a four-hour outage as a wobble.
        if (troubled && existing) {
          if (service.status === "Outage" && existing.status !== "Outage") {
            await tx.statusIncident.update({ where: { id: existing.id }, data: { status: "Outage" } });
          }
          continue;
        }

        // Operational (or Unknown — we can't claim a recovery we didn't observe).
        if (service.status === "Operational" && existing) {
          const resolvedAt = new Date();
          await tx.statusIncident.update({ where: { id: existing.id }, data: { resolvedAt } });
          resolved += 1;
          if (tenantId) {
            await this.outbox.append(tx, {
              tenantId,
              eventType: "ops.status-incident.resolved",
              aggregateId: existing.id,
              payload: {
                incidentId: existing.id,
                serviceKey: existing.serviceKey,
                serviceName: existing.serviceName,
                status: existing.status,
                startedAt: existing.startedAt.toISOString(),
                resolvedAt: resolvedAt.toISOString(),
                minutes: minutesBetween(existing.startedAt, resolvedAt),
              },
            });
          }
        }
      }
    });

    this.log.log(`status recorded (ok=${ok}, opened=${opened}, resolved=${resolved})`);
    return { ok, opened, resolved };
  }

  /* ------------------------------------------------------------------ internals */

  /**
   * Apps → public services. Everything internal is dropped HERE, on the server: no sha, no
   * project name, no origin, no provider state, no per-app breakdown. Deriving the public view
   * server-side is the point — a commit sha that never leaves the API cannot be read out of a
   * network tab. Warnings go too: that a Vercel token expired is an operator's problem.
   */
  private rollUp(snapshot: PlatformStatus): Array<{ key: string; name: string; status: PublicServiceStatus }> {
    return PUBLIC_SERVICES.map(({ key, name }) => {
      const apps = snapshot.apps.filter(
        (a) => DEPLOYED_APPS.find((d) => d.key === a.key)?.publicService === key,
      );
      return { key, name, status: rollUpPublic(apps.map((a) => a.health)) };
    });
  }

  /** Operational share of the recorded checks per service, over the history window. */
  private async uptimeByService(): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ key: string; total: bigint; operational: bigint }>>`
      SELECT e.key AS key,
             count(*) AS total,
             count(*) FILTER (WHERE e.value = 'Operational') AS operational
        FROM "ops"."StatusCheck" c,
             LATERAL jsonb_each_text(c.services) AS e(key, value)
       WHERE c.at >= now() - ${`${HISTORY_DAYS} days`}::interval
       GROUP BY e.key
    `;
    const out = new Map<string, number>();
    for (const row of rows) {
      const total = Number(row.total);
      if (!total) continue;
      // One decimal place: the difference between 99.95% and 100% is a real claim, and rounding
      // it up to a flat 100 is the one number a status page must not overstate.
      out.set(row.key, Math.round((Number(row.operational) / total) * 1000) / 10);
    }
    return out;
  }

  /** One state per UTC day for the 90-day bar. Days with no checks are absent (→ "none"). */
  private async dailyStates(): Promise<PublicDay[]> {
    const rows = await this.prisma.$queryRaw<Array<{ day: Date; total: bigint; ok: bigint }>>`
      SELECT date_trunc('day', c.at) AS day,
             count(*) AS total,
             count(*) FILTER (WHERE c.ok) AS ok
        FROM "ops"."StatusCheck" c
       WHERE c.at >= now() - ${`${HISTORY_DAYS} days`}::interval
       GROUP BY 1
       ORDER BY 1
    `;
    const byDate = new Map<string, { total: number; ok: number }>();
    for (const row of rows) {
      byDate.set(new Date(row.day).toISOString().slice(0, 10), {
        total: Number(row.total),
        ok: Number(row.ok),
      });
    }

    // Emit every day in the window, including the empty ones — a bar chart that silently skips
    // the days nobody was recording reads as uninterrupted history.
    const days: PublicDay[] = [];
    const today = new Date();
    for (let i = HISTORY_DAYS - 1; i >= 0; i -= 1) {
      const date = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      const found = byDate.get(date);
      days.push({ date, state: found ? dayState(found.ok, found.total) : "none" });
    }
    return days;
  }

  private async recentIncidents(): Promise<PublicIncident[]> {
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
    const rows = await this.prisma.statusIncident.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: INCIDENT_LIMIT,
    });
    return rows.map((incident) => ({
      id: incident.id,
      serviceName: incident.serviceName,
      status: incident.status,
      startedAt: incident.startedAt.toISOString(),
      resolvedAt: incident.resolvedAt?.toISOString() ?? null,
      minutes: minutesBetween(incident.startedAt, incident.resolvedAt ?? new Date()),
    }));
  }

  /**
   * A home for the outbox row on a platform-wide event.
   *
   * The outbox demands a tenantId and a status incident has no tenant — every tenant is affected.
   * PLATFORM_TENANT_ID is the configured answer (same convention as the break-glass OTP send),
   * falling back to the oldest tenant. Null on a fresh install with no tenants at all, and then
   * the incident is still recorded — only the notification is skipped.
   */
  private async platformTenantId(): Promise<string | null> {
    const configured = this.config.get<string>("PLATFORM_TENANT_ID", "").trim();
    if (configured) return configured;
    const oldest = await this.prisma.tenant.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return oldest?.id ?? null;
  }

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
        // Deploy state is the fallback, not the signal: it describes the last BUILD. It only
        // applies to a row with no probe, or one whose origin isn't configured yet.
        health: probed.health === "unknown" ? healthFromDeploy(deploy) : probed.health,
        latencyMs: probed.latencyMs,
        detail:
          probed.detail ??
          deploy?.note ??
          (probed.health === "unknown" ? "No health endpoint — deploy state only" : undefined),
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
        // Do NOT follow redirects. A gated app whose middleware bounces the probe to the auth
        // app would otherwise answer 200 from a sign-in page and read as healthy — which is
        // exactly what admin and field did before their matchers excluded /api/health.
        redirect: "manual",
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
      // Newest row per project and newest SERVING row per project are not the same thing: a
      // CANCELED or ERRORed build sits at the top of the list while an earlier READY one keeps
      // serving prod (uprise-auth is in exactly that state today). Report what is serving, and
      // keep the newer failure as a note — the same distinction the worker needed.
      const newest = new Map<string, string>();
      for (const d of body.deployments ?? []) {
        if (!d.name) continue;
        const state = (d.state ?? d.readyState ?? "").toUpperCase();
        if (!newest.has(d.name)) newest.set(d.name, state);
        if (out.has(d.name)) continue;
        if (state && state !== "READY") continue;
        const failed = newest.get(d.name);
        out.set(d.name, {
          sha: d.meta?.githubCommitSha,
          state: d.state ?? d.readyState,
          at: d.created ? new Date(d.created).toISOString() : undefined,
          target: d.meta?.githubCommitRef ?? d.target,
          note:
            failed && failed !== "READY"
              ? `Latest build ${failed.toLowerCase()} — still serving an earlier deploy`
              : undefined,
        });
      }
    } catch (err) {
      warnings.push(`Vercel API unreachable (${err instanceof Error ? err.name : "Error"})`);
    }
    return out;
  }

  /**
   * What the Railway worker is actually running.
   *
   * NOT `deployments(first: 1)` — that is the newest deployment ROW, which is not the same thing as
   * the live one. The worker's GitHub trigger records a SKIPPED row for every push that misses its
   * watch paths, so the newest row is nearly always a skip that says nothing about health, and a
   * failed build after a good one would read as an outage while the old container keeps serving.
   * `serviceInstance.activeDeployments` is Railway's own answer to "what is serving right now";
   * `latestDeployment` rides along so a build that failed since then is surfaced as a note rather
   * than mistaken for the worker being down.
   *
   * A failure here is a warning, never an error — a status page that 500s because a provider API
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

    const environmentId = await this.railwayEnvironmentId(token, warnings);
    if (!environmentId) return out;

    const query = `query($serviceId: String!, $environmentId: String!) {
      serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
        activeDeployments { id status createdAt meta }
        latestDeployment { id status createdAt meta }
      }
    }`;

    const data = await this.railwayQuery<{
      serviceInstance?: {
        activeDeployments?: RailwayDeploy[] | null;
        latestDeployment?: RailwayDeploy | null;
      } | null;
    }>(token, query, { serviceId, environmentId }, warnings);

    const instance = data?.serviceInstance;
    if (!instance) return out;

    const active = instance.activeDeployments?.[0];
    const latest = instance.latestDeployment ?? undefined;
    // With nothing active, the latest row is all there is — and a FAILED one there IS the story.
    const live = active ?? latest;
    if (!live) return out;

    out.set("worker", {
      sha: live.meta?.commitHash,
      state: live.status,
      at: live.createdAt,
      target: live.meta?.branch,
      note: staleDeployNote(active, latest),
    });
    return out;
  }

  /**
   * The Railway environment the worker's service instance lives in.
   *
   * Configured wins; otherwise a project-scoped token can name its own environment, which keeps the
   * common case zero-config. An account/team token can't answer that, so it needs the env var.
   */
  private async railwayEnvironmentId(token: string, warnings: string[]): Promise<string | undefined> {
    const configured = this.config.get<string>("RAILWAY_ENVIRONMENT_ID");
    if (configured) return configured;
    if (this.railwayEnvId) return this.railwayEnvId;

    const data = await this.railwayQuery<{ projectToken?: { environmentId?: string } | null }>(
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
    // It never changes for a given token, so resolve it once per process.
    this.railwayEnvId = resolved;
    return resolved;
  }

  /**
   * One Railway GraphQL call, with every failure turned into a warning.
   *
   * Auth is `Project-Access-Token`, not `Authorization: Bearer`: RAILWAY_TOKEN is the worker's
   * project-scoped token, and Railway answers Bearer with "Not Authorized" for those. Swap in an
   * account/team token and this header has to become Bearer — the warning will say so.
   */
  private async railwayQuery<T>(
    token: string,
    query: string,
    variables: Record<string, string>,
    warnings: string[],
  ): Promise<T | undefined> {
    try {
      const res = await fetch("https://backboard.railway.com/graphql/v2", {
        method: "POST",
        headers: { "Project-Access-Token": token, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
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
}

/** A Railway deployment as this page reads it. */
type RailwayDeploy = {
  id?: string;
  status?: string;
  createdAt?: string;
  meta?: { commitHash?: string; branch?: string };
};

/**
 * "Running fine, but prod is behind" — the one thing the live deploy alone can't say.
 *
 * Only fires when a newer deployment exists that neither succeeded nor was skipped: a failed or
 * crashed build after a good one leaves the worker up on the old container, which is not an outage
 * but is something an operator needs to see.
 */
export function staleDeployNote(
  active: RailwayDeploy | undefined,
  latest: RailwayDeploy | undefined,
): string | undefined {
  if (!active || !latest || latest.id === active.id) return undefined;
  const state = (latest.status ?? "").toUpperCase();
  if (state === "SUCCESS" || state === "SKIPPED" || state === "REMOVED" || !state) return undefined;
  return `Latest build ${state.toLowerCase()} — still serving an earlier deploy`;
}

/** Deploy state → health, for apps with no probe of their own (the worker). */
export function healthFromDeploy(deploy: DeployInfo | undefined): Health {
  if (!deploy?.state) return "unknown";
  const state = deploy.state.toUpperCase();
  if (state === "READY" || state === "SUCCESS") return "up";
  if (state === "ERROR" || state === "FAILED" || state === "CRASHED") return "down";
  // A skipped or removed build is a bookkeeping row, not a verdict on whether anything is running.
  if (state === "SKIPPED" || state === "REMOVED") return "unknown";
  // BUILDING / DEPLOYING / QUEUED: a deploy is in flight, which is not an outage but is not
  // a clean bill of health either.
  return "degraded";
}

/**
 * Several apps → one public word.
 *
 * The worst health wins: a service is only Operational when everything behind it is. `unknown`
 * no longer counts as Operational — every row has a probe now, so unknown means the check could
 * not be made (a missing origin), and reporting that as green is a claim the page hasn't earned.
 * It is its own word rather than an Outage, because "we can't tell" is not "it's broken".
 */
export function rollUpPublic(healths: Health[]): PublicServiceStatus {
  if (healths.some((h) => h === "down")) return "Outage";
  if (healths.some((h) => h === "degraded")) return "Degraded";
  if (healths.length === 0 || healths.some((h) => h === "unknown")) return "Unknown";
  return "Operational";
}

/** The banner line, from the services below it. */
export function summarise(services: Array<{ status: PublicServiceStatus }>): {
  ok: boolean;
  summary: string;
} {
  const anyOutage = services.some((s) => s.status === "Outage");
  const anyDegraded = services.some((s) => s.status === "Degraded");
  const anyUnknown = services.some((s) => s.status === "Unknown");
  return {
    // `ok` is the green/amber switch on the page, so an unmeasurable service clears it: the
    // honest banner for "we can't see one of these" is not "all systems operational".
    ok: !anyOutage && !anyDegraded && !anyUnknown,
    summary: anyOutage
      ? "Some systems are down"
      : anyDegraded
        ? "Some systems are degraded"
        : anyUnknown
          ? "Some systems can't be checked"
          : "All systems operational",
  };
}

/** A day's worth of checks → one bar. Partial means it was not clean all day. */
export function dayState(ok: number, total: number): PublicDay["state"] {
  if (!total) return "none";
  if (ok === total) return "up";
  return ok === 0 ? "down" : "partial";
}

/** Whole minutes between two instants, never negative. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}
