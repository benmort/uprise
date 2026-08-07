import { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../prisma/prisma.service";
import type { OutboxService } from "../common/outbox/outbox.service";
import { RailwayClient } from "../observability/railway.client";
import {
  PlatformStatusService,
  dayState,
  healthFromDeploy,
  minutesBetween,
  rollUpPublic,
  staleDeployNote,
  summarise,
} from "./platform-status.service";

/**
 * The things worth pinning here are the ones that would be silent if they broke: that the public
 * payload cannot carry an internal detail, that a provider being unreachable degrades the page
 * rather than failing it, and that the recorder opens exactly one incident per outage.
 */

const ENV: Record<string, string> = {
  API_BASE_URL: "https://api.test",
  APP_URL: "https://app.test",
  AUTH_APP_URL: "https://auth.test",
  FIELD_APP_URL: "https://field.test",
  ACTION_APP_URL: "https://action.test",
  MARKETING_APP_URL: "https://www.test",
  ORG_MARKETING_APP_URL: "https://labs.test",
  WORKER_HEALTH_URL: "https://worker.test",
};

type Incident = {
  id: string;
  serviceKey: string;
  serviceName: string;
  status: string;
  startedAt: Date;
  resolvedAt: Date | null;
};

/**
 * A prisma stand-in that remembers what was written, so an assertion can be about the row the
 * recorder produced rather than about the call it made.
 */
function stubPrisma(seed: { open?: Incident[]; uptime?: unknown[]; daily?: unknown[] } = {}) {
  const incidents: Incident[] = [...(seed.open ?? [])];
  const checks: Array<{ ok: boolean; services: Record<string, string> }> = [];

  const client = {
    incidents,
    checks,
    statusCheck: {
      create: jest.fn(async ({ data }: { data: { ok: boolean; services: Record<string, string> } }) => {
        checks.push(data);
        return { id: `check-${checks.length}`, ...data };
      }),
    },
    statusIncident: {
      findMany: jest.fn(async ({ where }: { where?: { resolvedAt?: null } } = {}) =>
        where?.resolvedAt === null ? incidents.filter((i) => !i.resolvedAt) : [...incidents],
      ),
      create: jest.fn(async ({ data }: { data: Omit<Incident, "id" | "startedAt" | "resolvedAt"> }) => {
        const created: Incident = {
          id: `incident-${incidents.length + 1}`,
          startedAt: new Date("2026-08-05T00:00:00Z"),
          resolvedAt: null,
          ...data,
        };
        incidents.push(created);
        return created;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Incident> }) => {
        const found = incidents.find((i) => i.id === where.id);
        if (found) Object.assign(found, data);
        return found;
      }),
    },
    tenant: { findFirst: jest.fn(async (): Promise<{ id: string } | null> => ({ id: "tenant-1" })) },
    // Assigned below, once `client` exists to hand back as the transaction client.
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>): Promise<unknown> => cb(null)),
    // Tagged-template call: the two history queries are told apart by their SQL.
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ");
      if (sql.includes("jsonb_each_text")) return seed.uptime ?? [];
      if (sql.includes("date_trunc")) return seed.daily ?? [];
      return [];
    }),
  };
  client.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(client));
  return client;
}

type OutboxCall = { eventType: string; payload: Record<string, unknown> };

function makeService(extraEnv: Record<string, string> = {}, prisma = stubPrisma()) {
  const env = { ...ENV, ...extraEnv };
  const config = { get: (k: string, fallback?: string) => env[k] ?? fallback } as unknown as ConfigService;
  const outbox = { append: jest.fn(async (_tx: unknown, _evt: OutboxCall) => undefined) };
  // A real RailwayClient over the same config stub: it calls the same global `fetch` these tests
  // already stub, so the Railway assertions below keep exercising the actual transport.
  const service = new PlatformStatusService(
    config,
    prisma as unknown as PrismaService,
    outbox as unknown as OutboxService,
    new RailwayClient(config),
  );
  return Object.assign(service, { __prisma: prisma, __outbox: outbox });
}

type Reply = { status?: number; body?: unknown } | "throw";

/** A fetch stub: health probes answer per-host, provider APIs per-URL (Railway per-query). */
function stubFetch(opts: {
  health?: (url: string) => Reply;
  vercel?: Reply;
  railway?: ((query: string) => Reply) | Reply;
}) {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const reply = (r: Reply | undefined) => {
      if (r === "throw") throw Object.assign(new Error("boom"), { name: "TimeoutError" });
      const status = r?.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => r?.body ?? {},
      } as Response;
    };
    if (url.startsWith("https://api.vercel.com")) return reply(opts.vercel ?? { body: { deployments: [] } });
    if (url.startsWith("https://backboard.railway.com")) {
      const query = String(init?.body ?? "");
      return reply(typeof opts.railway === "function" ? opts.railway(query) : (opts.railway ?? { body: { data: {} } }));
    }
    return reply(opts.health ? opts.health(url) : { body: { ok: true } });
  });
}

/** Railway answers two queries per refresh: the token's environment, then the service instance. */
function railwayReplies(instance: unknown) {
  return (query: string): Reply =>
    query.includes("projectToken")
      ? { body: { data: { projectToken: { environmentId: "env-1" } } } }
      : { body: { data: { serviceInstance: instance } } };
}

const RAILWAY_ENV = { RAILWAY_TOKEN: "t", RAILWAY_SERVICE_ID: "svc-1" };

describe("PlatformStatusService", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  describe("status", () => {
    it("reports every deployed app, and marks the estate ok when all probes pass", async () => {
      global.fetch = stubFetch({}) as unknown as typeof fetch;
      const status = await makeService().status();

      expect(status.ok).toBe(true);
      // Seven Vercel projects + the Railway worker.
      expect(status.apps).toHaveLength(8);
      expect(status.apps.map((a) => a.key)).toContain("worker");
      expect(status.apps.find((a) => a.key === "admin")?.health).toBe("up");
    });

    it("treats a health endpoint reporting ok:false as degraded, not down, and names the failing check", async () => {
      global.fetch = stubFetch({
        health: (url) => (url.includes("api.test") ? { body: { ok: false, checks: { db: false, twilio: true } } } : { body: { ok: true } }),
      }) as unknown as typeof fetch;

      const status = await makeService().status();
      const api = status.apps.find((a) => a.key === "api");
      expect(api?.health).toBe("degraded");
      expect(api?.detail).toBe("Failing: db");
      // Degraded is not an outage — the estate is still ok.
      expect(status.ok).toBe(true);
    });

    it("marks an app down when its probe times out, and that does clear ok", async () => {
      global.fetch = stubFetch({
        health: (url) => (url.includes("field.test") ? "throw" : { body: { ok: true } }),
      }) as unknown as typeof fetch;

      const status = await makeService().status();
      expect(status.apps.find((a) => a.key === "field")?.health).toBe("down");
      expect(status.ok).toBe(false);
    });

    it("counts a redirected probe as down rather than following it to someone else's 200", async () => {
      // A gated app that bounces /api/health to the auth app would otherwise report itself up on
      // the sign-in page's 200.
      global.fetch = stubFetch({
        health: (url) => (url.includes("app.test") ? { status: 307 } : { body: { ok: true } }),
      }) as unknown as typeof fetch;

      const status = await makeService().status();
      const admin = status.apps.find((a) => a.key === "admin");
      expect(admin?.health).toBe("down");
      expect(admin?.detail).toBe("HTTP 307");
    });

    it("keeps the newest deployment per Vercel project and carries its sha", async () => {
      global.fetch = stubFetch({
        vercel: {
          body: {
            deployments: [
              { name: "uprise-admin", state: "READY", created: 1_700_000_000_000, meta: { githubCommitSha: "newsha", githubCommitRef: "main" } },
              { name: "uprise-admin", state: "READY", created: 1_600_000_000_000, meta: { githubCommitSha: "oldsha" } },
            ],
          },
        },
      }) as unknown as typeof fetch;

      // The token has to be present or the service short-circuits before it ever calls Vercel.
      const status = await makeService({ VERCEL_TOKEN: "t" }).status();
      expect(status.apps.find((a) => a.key === "admin")?.deploy).toMatchObject({ sha: "newsha", target: "main" });
    });

    it("reads the worker's ACTIVE deployment, not the newest row, and flags the failed build", async () => {
      // Reality on Railway: 48 SKIPPED rows and a FAILED build sit on top of the SUCCESS that is
      // actually serving. Reading the newest row would call a healthy worker degraded or down.
      global.fetch = stubFetch({
        railway: railwayReplies({
          activeDeployments: [{ id: "d-live", status: "SUCCESS", createdAt: "2026-07-20T01:26:30Z" }],
          latestDeployment: { id: "d-new", status: "FAILED", createdAt: "2026-07-28T05:08:53Z" },
        }),
      }) as unknown as typeof fetch;

      const status = await makeService(RAILWAY_ENV).status();
      const worker = status.apps.find((a) => a.key === "worker");

      expect(worker?.health).toBe("up");
      expect(worker?.deploy).toMatchObject({ state: "SUCCESS", at: "2026-07-20T01:26:30Z" });
      expect(worker?.detail).toBe("Latest build failed — still serving an earlier deploy");
      expect(status.ok).toBe(true);
    });

    it("authenticates Railway with the project-token header, never Bearer", async () => {
      // A project-scoped RAILWAY_TOKEN gets "Not Authorized" from Bearer — this is the regression
      // that made the worker's deploy column permanently empty.
      const fetchMock = stubFetch({ railway: railwayReplies({ activeDeployments: [], latestDeployment: null }) });
      global.fetch = fetchMock as unknown as typeof fetch;

      await makeService(RAILWAY_ENV).status();
      const railwayCall = fetchMock.mock.calls.find(([url]) => String(url).includes("backboard.railway"));
      const headers = (railwayCall?.[1] as RequestInit | undefined)?.headers as Record<string, string>;

      expect(headers["Project-Access-Token"]).toBe("t");
      expect(headers.authorization).toBeUndefined();
    });

    it("prefers the worker's own /health over anything Railway says about the build", async () => {
      // The worker answers `{ status: "ok" }` — no `ok` field at all — and a 200 is the claim.
      // A failed build on top of a serving container is a note, not an outage.
      global.fetch = stubFetch({
        health: (url) => (url.includes("worker.test") ? { body: { status: "ok" } } : { body: { ok: true } }),
        railway: railwayReplies({
          activeDeployments: [{ id: "d-live", status: "SUCCESS", createdAt: "2026-07-20T01:26:30Z" }],
          latestDeployment: { id: "d-new", status: "FAILED", createdAt: "2026-07-28T05:08:53Z" },
        }),
      }) as unknown as typeof fetch;

      const status = await makeService(RAILWAY_ENV).status();
      expect(status.apps.find((a) => a.key === "worker")?.health).toBe("up");
      expect(status.ok).toBe(true);
    });

    it("falls back to the deploy state when a row has no origin configured", async () => {
      global.fetch = stubFetch({
        railway: railwayReplies({
          activeDeployments: [],
          latestDeployment: { id: "d-new", status: "FAILED", createdAt: "2026-07-28T05:08:53Z" },
        }),
      }) as unknown as typeof fetch;

      const status = await makeService({ ...RAILWAY_ENV, WORKER_HEALTH_URL: "" }).status();
      const worker = status.apps.find((a) => a.key === "worker");
      expect(worker?.health).toBe("down");
      expect(worker?.detail).toBe("No WORKER_HEALTH_URL configured");
      expect(status.ok).toBe(false);
    });

    it("skips the environment lookup when RAILWAY_ENVIRONMENT_ID is configured", async () => {
      const fetchMock = stubFetch({
        railway: railwayReplies({
          activeDeployments: [{ id: "d-live", status: "SUCCESS", createdAt: "2026-07-20T01:26:30Z" }],
          latestDeployment: { id: "d-live", status: "SUCCESS", createdAt: "2026-07-20T01:26:30Z" },
        }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      await makeService({ ...RAILWAY_ENV, RAILWAY_ENVIRONMENT_ID: "env-1" }).status();
      const railwayCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("backboard.railway"));
      expect(railwayCalls).toHaveLength(1);
      expect(String((railwayCalls[0]?.[1] as RequestInit).body)).not.toContain("projectToken");
    });

    it("warns rather than throws when a provider API is unreachable", async () => {
      global.fetch = stubFetch({ vercel: "throw" }) as unknown as typeof fetch;
      const status = await makeService({ VERCEL_TOKEN: "t" }).status();
      expect(status.warnings?.join(" ")).toContain("Vercel API unreachable");
      // The page still renders every app.
      expect(status.apps).toHaveLength(8);
    });

    it("warns when the provider tokens are absent", async () => {
      global.fetch = stubFetch({}) as unknown as typeof fetch;
      const status = await makeService().status();
      expect(status.warnings?.join(" ")).toContain("VERCEL_TOKEN not configured");
      expect(status.warnings?.join(" ")).toContain("RAILWAY_TOKEN");
    });

    it("serves a cached snapshot rather than re-probing on every call", async () => {
      const fetchMock = stubFetch({});
      global.fetch = fetchMock as unknown as typeof fetch;
      const service = makeService();

      await service.status();
      const afterFirst = fetchMock.mock.calls.length;
      await service.status();

      expect(fetchMock.mock.calls.length).toBe(afterFirst);
    });

    it("collapses concurrent misses into one refresh", async () => {
      const fetchMock = stubFetch({});
      global.fetch = fetchMock as unknown as typeof fetch;
      const service = makeService();

      await Promise.all([service.status(), service.status(), service.status()]);
      // One fan-out: a probe per app plus the two provider calls — not three times that.
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(10);
    });
  });

  describe("publicStatus", () => {
    it("leaks nothing internal — no sha, project, origin or provider state", async () => {
      global.fetch = stubFetch({
        vercel: {
          body: {
            deployments: [
              { name: "uprise-admin", state: "READY", created: 1_700_000_000_000, meta: { githubCommitSha: "secretsha" } },
            ],
          },
        },
      }) as unknown as typeof fetch;

      const publicStatus = await makeService({ VERCEL_TOKEN: "t" }).publicStatus();
      const serialised = JSON.stringify(publicStatus);

      expect(serialised).not.toContain("secretsha");
      expect(serialised).not.toContain("uprise-admin");
      expect(serialised).not.toContain("app.test");
      expect(serialised).not.toContain("READY");
      // …and no warnings about operator config either.
      expect(serialised).not.toContain("VERCEL_TOKEN");
    });

    it("names public services, with no version string to invent", async () => {
      global.fetch = stubFetch({}) as unknown as typeof fetch;
      const publicStatus = await makeService().publicStatus();

      expect(publicStatus).not.toHaveProperty("version");
      expect(publicStatus.summary).toBe("All systems operational");
      expect(publicStatus.services.map((s) => s.name)).toEqual([
        "Organiser workspace",
        "Canvasser app",
        "Supporter actions",
        "Messaging",
        "Website",
      ]);
    });

    it("rolls a down app up into an Outage on the service it belongs to", async () => {
      global.fetch = stubFetch({
        health: (url) => (url.includes("field.test") ? "throw" : { body: { ok: true } }),
      }) as unknown as typeof fetch;

      const publicStatus = await makeService().publicStatus();
      expect(publicStatus.services.find((s) => s.key === "field")?.status).toBe("Outage");
      expect(publicStatus.services.find((s) => s.key === "workspace")?.status).toBe("Operational");
      expect(publicStatus.summary).toBe("Some systems are down");
      expect(publicStatus.ok).toBe(false);
    });

    it("carries uptime, a day per bar and recent incidents", async () => {
      global.fetch = stubFetch({}) as unknown as typeof fetch;
      const prisma = stubPrisma({
        uptime: [
          { key: "workspace", total: 1000n, operational: 998n },
          { key: "field", total: 1000n, operational: 1000n },
        ],
        daily: [{ day: new Date("2026-08-04T00:00:00Z"), total: 288n, ok: 280n }],
        open: [
          {
            id: "incident-past",
            serviceKey: "messaging",
            serviceName: "Messaging",
            status: "Outage",
            startedAt: new Date("2026-08-01T00:00:00Z"),
            resolvedAt: new Date("2026-08-01T02:30:00Z"),
          },
        ],
      });

      const publicStatus = await makeService({}, prisma).publicStatus();

      expect(publicStatus.services.find((s) => s.key === "workspace")?.uptime90d).toBe(99.8);
      expect(publicStatus.services.find((s) => s.key === "field")?.uptime90d).toBe(100);
      // No data for a service is null, never a flattering 100%.
      expect(publicStatus.services.find((s) => s.key === "website")?.uptime90d).toBeNull();
      expect(publicStatus.days).toHaveLength(90);
      expect(publicStatus.days.find((d) => d.date === "2026-08-04")?.state).toBe("partial");
      expect(publicStatus.incidents[0]).toMatchObject({
        serviceName: "Messaging",
        status: "Outage",
        minutes: 150,
      });
    });

    it("memoises the 90-day history: a second read inside the TTL does not re-aggregate", async () => {
      jest.useFakeTimers();
      try {
        global.fetch = stubFetch({}) as unknown as typeof fetch;
        const prisma = stubPrisma({ uptime: [{ key: "workspace", total: 10n, operational: 10n }] });
        const service = makeService({}, prisma);

        await service.publicStatus();
        // Two aggregations (the jsonb_each_text uptime roll-up and the day bar) plus the
        // incident list – the whole cost this memo exists to stop repeating per visitor.
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
        expect(prisma.statusIncident.findMany).toHaveBeenCalledTimes(1);

        // Past the 30 s snapshot cache but inside the 60 s history memo: the live probes
        // run again, the window aggregations do not.
        jest.setSystemTime(Date.now() + 45_000);
        const again = await service.publicStatus();
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
        expect(prisma.statusIncident.findMany).toHaveBeenCalledTimes(1);
        expect(again.services.find((s) => s.key === "workspace")?.uptime90d).toBe(100);

        // Past the memo, the window is read afresh – the page never goes permanently stale.
        jest.setSystemTime(Date.now() + 61_000);
        await service.publicStatus();
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
        expect(prisma.statusIncident.findMany).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it("collapses concurrent history misses into a single pass", async () => {
      global.fetch = stubFetch({}) as unknown as typeof fetch;
      const prisma = stubPrisma({ uptime: [{ key: "workspace", total: 4n, operational: 4n }] });
      const service = makeService({}, prisma);

      await Promise.all([service.publicStatus(), service.publicStatus(), service.publicStatus()]);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prisma.statusIncident.findMany).toHaveBeenCalledTimes(1);
    });

    it("still answers live when the history tables are unreadable", async () => {
      global.fetch = stubFetch({}) as unknown as typeof fetch;
      const prisma = stubPrisma();
      prisma.$queryRaw.mockRejectedValue(new Error("relation does not exist"));
      prisma.statusIncident.findMany.mockRejectedValue(new Error("relation does not exist"));

      const publicStatus = await makeService({}, prisma).publicStatus();

      expect(publicStatus.summary).toBe("All systems operational");
      expect(publicStatus.services).toHaveLength(5);
      expect(publicStatus.incidents).toEqual([]);
    });
  });

  describe("record", () => {
    it("writes a check and opens one incident per troubled service, with an event", async () => {
      global.fetch = stubFetch({
        health: (url) => (url.includes("field.test") ? "throw" : { body: { ok: true } }),
      }) as unknown as typeof fetch;
      const service = makeService();

      const result = await service.record();

      expect(result).toMatchObject({ ok: false, opened: 1, resolved: 0 });
      expect(service.__prisma.checks[0]).toMatchObject({
        ok: false,
        services: expect.objectContaining({ field: "Outage", workspace: "Operational" }),
      });
      expect(service.__outbox.append).toHaveBeenCalledTimes(1);
      const appended = service.__outbox.append.mock.calls[0][1];
      expect(appended.eventType).toBe("ops.status-incident.opened");
      expect(appended.payload.serviceKey).toBe("field");
    });

    it("does not reopen an incident that is already open", async () => {
      global.fetch = stubFetch({
        health: (url) => (url.includes("field.test") ? "throw" : { body: { ok: true } }),
      }) as unknown as typeof fetch;
      const prisma = stubPrisma({
        open: [
          {
            id: "incident-open",
            serviceKey: "field",
            serviceName: "Canvasser app",
            status: "Outage",
            startedAt: new Date("2026-08-05T00:00:00Z"),
            resolvedAt: null,
          },
        ],
      });
      const service = makeService({}, prisma);

      const result = await service.record();

      expect(result.opened).toBe(0);
      expect(prisma.statusIncident.create).not.toHaveBeenCalled();
      expect(service.__outbox.append).not.toHaveBeenCalled();
    });

    it("resolves an open incident once the service recovers, and says how long it lasted", async () => {
      global.fetch = stubFetch({}) as unknown as typeof fetch;
      const prisma = stubPrisma({
        open: [
          {
            id: "incident-open",
            serviceKey: "field",
            serviceName: "Canvasser app",
            status: "Degraded",
            startedAt: new Date(Date.now() - 45 * 60_000),
            resolvedAt: null,
          },
        ],
      });
      const service = makeService({}, prisma);

      const result = await service.record();

      expect(result).toMatchObject({ ok: true, opened: 0, resolved: 1 });
      const appended = service.__outbox.append.mock.calls[0][1];
      expect(appended.eventType).toBe("ops.status-incident.resolved");
      expect(appended.payload.minutes).toBe(45);
    });

    it("promotes an open degraded incident when the service gets worse", async () => {
      global.fetch = stubFetch({
        health: (url) => (url.includes("field.test") ? "throw" : { body: { ok: true } }),
      }) as unknown as typeof fetch;
      const prisma = stubPrisma({
        open: [
          {
            id: "incident-open",
            serviceKey: "field",
            serviceName: "Canvasser app",
            status: "Degraded",
            startedAt: new Date("2026-08-05T00:00:00Z"),
            resolvedAt: null,
          },
        ],
      });

      await makeService({}, prisma).record();

      expect(prisma.statusIncident.update).toHaveBeenCalledWith({
        where: { id: "incident-open" },
        data: { status: "Outage" },
      });
    });

    it("records the check even with no tenant to hang the event on", async () => {
      global.fetch = stubFetch({
        health: (url) => (url.includes("field.test") ? "throw" : { body: { ok: true } }),
      }) as unknown as typeof fetch;
      const prisma = stubPrisma();
      prisma.tenant.findFirst.mockResolvedValue(null);
      const service = makeService({}, prisma);

      const result = await service.record();

      expect(result.opened).toBe(1);
      expect(prisma.checks).toHaveLength(1);
      expect(service.__outbox.append).not.toHaveBeenCalled();
    });
  });

  describe("rollUpPublic", () => {
    it("takes the worst health", () => {
      expect(rollUpPublic(["up", "up"])).toBe("Operational");
      expect(rollUpPublic(["up", "degraded"])).toBe("Degraded");
      expect(rollUpPublic(["degraded", "down"])).toBe("Outage");
    });

    it("will not call an unmeasured service Operational", () => {
      expect(rollUpPublic(["unknown"])).toBe("Unknown");
      expect(rollUpPublic(["up", "unknown"])).toBe("Unknown");
      expect(rollUpPublic([])).toBe("Unknown");
      // Something known-broken still outranks something unmeasured.
      expect(rollUpPublic(["unknown", "down"])).toBe("Outage");
    });
  });

  describe("summarise", () => {
    it("says what it can see, and admits what it can't", () => {
      expect(summarise([{ status: "Operational" }])).toEqual({
        ok: true,
        summary: "All systems operational",
      });
      expect(summarise([{ status: "Unknown" }])).toEqual({
        ok: false,
        summary: "Some systems can't be checked",
      });
      expect(summarise([{ status: "Degraded" }, { status: "Unknown" }]).summary).toBe(
        "Some systems are degraded",
      );
      expect(summarise([{ status: "Outage" }, { status: "Degraded" }]).summary).toBe(
        "Some systems are down",
      );
    });
  });

  describe("dayState", () => {
    it("is only up when every check that day was clean", () => {
      expect(dayState(288, 288)).toBe("up");
      expect(dayState(287, 288)).toBe("partial");
      expect(dayState(0, 288)).toBe("down");
      expect(dayState(0, 0)).toBe("none");
    });
  });

  describe("minutesBetween", () => {
    it("rounds to whole minutes and never goes negative", () => {
      const start = new Date("2026-08-05T00:00:00Z");
      expect(minutesBetween(start, new Date("2026-08-05T01:30:00Z"))).toBe(90);
      expect(minutesBetween(start, new Date("2026-08-04T23:00:00Z"))).toBe(0);
    });
  });

  describe("healthFromDeploy", () => {
    it("maps provider deploy states onto health", () => {
      expect(healthFromDeploy({ state: "READY" })).toBe("up");
      expect(healthFromDeploy({ state: "SUCCESS" })).toBe("up");
      expect(healthFromDeploy({ state: "ERROR" })).toBe("down");
      expect(healthFromDeploy({ state: "CRASHED" })).toBe("down");
      expect(healthFromDeploy({ state: "BUILDING" })).toBe("degraded");
      expect(healthFromDeploy(undefined)).toBe("unknown");
    });

    it("treats a skipped or removed build as no signal, not as a problem", () => {
      expect(healthFromDeploy({ state: "SKIPPED" })).toBe("unknown");
      expect(healthFromDeploy({ state: "REMOVED" })).toBe("unknown");
    });
  });

  describe("staleDeployNote", () => {
    const live = { id: "a", status: "SUCCESS" };

    it("names a failed build sitting on top of the running deploy", () => {
      expect(staleDeployNote(live, { id: "b", status: "CRASHED" })).toBe(
        "Latest build crashed — still serving an earlier deploy",
      );
    });

    it("stays quiet when the newest build is the running one, succeeded, or was skipped", () => {
      expect(staleDeployNote(live, live)).toBeUndefined();
      expect(staleDeployNote(live, { id: "b", status: "SUCCESS" })).toBeUndefined();
      expect(staleDeployNote(live, { id: "b", status: "SKIPPED" })).toBeUndefined();
      expect(staleDeployNote(undefined, { id: "b", status: "FAILED" })).toBeUndefined();
    });
  });
});
