import { ConfigService } from "@nestjs/config";
import {
  PlatformStatusService,
  PLATFORM_VERSION,
  healthFromDeploy,
  rollUpPublic,
} from "./platform-status.service";

/**
 * The two things worth pinning here are the ones that would be silent if they broke: that the
 * public payload cannot carry an internal detail, and that a provider being unreachable degrades
 * the page rather than failing it.
 */

const ENV: Record<string, string> = {
  PUBLIC_API_BASE_URL: "https://api.test",
  APP_URL: "https://app.test",
  AUTH_APP_URL: "https://auth.test",
  FIELD_APP_URL: "https://field.test",
  ACTION_APP_URL: "https://action.test",
  MARKETING_APP_URL: "https://www.test",
  ORG_MARKETING_APP_URL: "https://labs.test",
};

function makeService(extraEnv: Record<string, string> = {}) {
  const env = { ...ENV, ...extraEnv };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new PlatformStatusService(config);
}

/** A fetch stub: health probes answer per-host, provider APIs per-URL. */
function stubFetch(opts: {
  health?: (url: string) => { status?: number; body?: unknown } | "throw";
  vercel?: { status?: number; body?: unknown } | "throw";
  railway?: { status?: number; body?: unknown } | "throw";
}) {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const reply = (r: { status?: number; body?: unknown } | "throw" | undefined) => {
      if (r === "throw") throw Object.assign(new Error("boom"), { name: "TimeoutError" });
      const status = r?.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => r?.body ?? {},
      } as Response;
    };
    if (url.startsWith("https://api.vercel.com")) return reply(opts.vercel ?? { body: { deployments: [] } });
    if (url.startsWith("https://backboard.railway.app")) return reply(opts.railway ?? { body: { data: {} } });
    return reply(opts.health ? opts.health(url) : { body: { ok: true } });
  });
}

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

    it("names public services and the mock version", async () => {
      global.fetch = stubFetch({}) as unknown as typeof fetch;
      const publicStatus = await makeService().publicStatus();

      expect(publicStatus.version).toBe(PLATFORM_VERSION);
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
  });

  describe("rollUpPublic", () => {
    it("takes the worst health, and treats unknown as operational", () => {
      expect(rollUpPublic(["up", "up"])).toBe("Operational");
      expect(rollUpPublic(["up", "degraded"])).toBe("Degraded");
      expect(rollUpPublic(["degraded", "down"])).toBe("Outage");
      expect(rollUpPublic(["unknown"])).toBe("Operational");
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
  });
});
