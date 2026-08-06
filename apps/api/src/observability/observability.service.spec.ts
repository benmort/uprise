import { ObservabilityService } from "./observability.service";
import type { LogRecord } from "./log-line.parser";

/** Nth call's first argument, typed loosely — these are hand-rolled mocks, not Prisma. */
function argOf(mock: jest.Mock, call = 0): { where: Record<string, any>; take?: number } {
  return mock.mock.calls[call]?.[0] as { where: Record<string, any>; take?: number };
}

function build(over: { stored?: unknown[]; railway?: LogRecord[]; vercel?: LogRecord[] } = {}) {
  const prisma = {
    logEvent: {
      findMany: jest.fn(async (_args?: unknown) => over.stored ?? []),
      deleteMany: jest.fn(async (_args?: unknown) => ({ count: 7 })),
      createMany: jest.fn(async (_args?: unknown) => ({ count: 1 })),
    },
  };
  // Typed with the `warnings` bag the real clients take, so a test can simulate a provider
  // failure the way the service actually observes one.
  type WarnOpts = { warnings: string[] };
  const railway = {
    environmentLogs: jest.fn(async (_opts: WarnOpts) => over.railway ?? ([] as LogRecord[])),
  };
  const vercel = { buildLogs: jest.fn(async (_opts: WarnOpts) => over.vercel ?? ([] as LogRecord[])) };
  const queues = { listJobs: jest.fn(async (_opts: WarnOpts) => []) };
  const config = { get: (_k: string, fallback?: string) => fallback };
  const service = new ObservabilityService(
    railway as never,
    vercel as never,
    queues as never,
    prisma as never,
    config as never,
  );
  return { service, prisma, railway, vercel, queues };
}

const record = (over: Partial<LogRecord> = {}): LogRecord => ({
  at: "2026-08-06T05:00:00.000Z",
  source: "railway",
  service: "worker",
  level: "error",
  message: "boom",
  ...over,
});

const storedRow = (over: Record<string, unknown> = {}) => ({
  at: new Date("2026-08-06T06:00:00.000Z"),
  service: "worker",
  level: "error",
  message: "Sync credential could not be decrypted",
  domain: "integrations",
  context: { syncJobId: "j1" },
  ...over,
});

describe("ObservabilityService.queryLogs", () => {
  // `stored` is the only source that survives provider retention and the only one covering Vercel
  // runtime errors at all, so it must be what you get without asking.
  it("defaults to the stored source and does not call the providers", async () => {
    const { service, prisma, railway, vercel } = build({ stored: [storedRow()] });
    const result = await service.queryLogs({});
    expect(prisma.logEvent.findMany).toHaveBeenCalled();
    expect(railway.environmentLogs).not.toHaveBeenCalled();
    expect(vercel.buildLogs).not.toHaveBeenCalled();
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ source: "stored", domain: "integrations" });
  });

  it("merges sources newest-first", async () => {
    const { service } = build({
      stored: [storedRow({ at: new Date("2026-08-06T06:00:00.000Z"), message: "newest" })],
      railway: [record({ at: "2026-08-06T04:00:00.000Z", message: "oldest" })],
    });
    const result = await service.queryLogs({ sources: ["stored", "railway"] });
    expect(result.records.map((r) => r.message)).toEqual(["newest", "oldest"]);
  });

  it("pushes a text filter down to Railway rather than only filtering locally", async () => {
    const { service, railway } = build();
    await service.queryLogs({ sources: ["railway"], q: "decrypt" });
    expect(railway.environmentLogs).toHaveBeenCalledWith(expect.objectContaining({ filter: "decrypt" }));
  });

  it("filters provider records by level as a floor", async () => {
    const { service } = build({
      railway: [record({ level: "info", message: "chatter" }), record({ level: "error", message: "boom" })],
    });
    const result = await service.queryLogs({ sources: ["railway"], level: "warn" });
    expect(result.records.map((r) => r.message)).toEqual(["boom"]);
  });

  it("translates a level floor into the stored levels at or above it", async () => {
    const { service, prisma } = build();
    await service.queryLogs({ level: "warn" });
    expect(argOf(prisma.logEvent.findMany, 0).where.level).toEqual({ in: ["warn", "error"] });

    await service.queryLogs({ level: "error" });
    expect(argOf(prisma.logEvent.findMany, 1).where.level).toEqual({ in: ["error"] });
  });

  // A month of rows pulled back to filter three of them is a download, not a query.
  it("filters stored rows in SQL, not in memory", async () => {
    const { service, prisma } = build();
    const sinceMs = Date.parse("2026-08-01T00:00:00.000Z");
    await service.queryLogs({ domain: "integrations", q: "decrypt", sinceMs });
    const where = argOf(prisma.logEvent.findMany).where;
    expect(where.domain).toBe("integrations");
    expect(where.at).toEqual({ gte: new Date(sinceMs) });
    expect(where.message).toEqual({ contains: "decrypt", mode: "insensitive" });
  });

  it("drops provider records older than the since window", async () => {
    const { service } = build({
      railway: [
        record({ at: "2026-08-06T05:00:00.000Z", message: "keep" }),
        record({ at: "2026-08-01T05:00:00.000Z", message: "drop" }),
      ],
    });
    const result = await service.queryLogs({
      sources: ["railway"],
      sinceMs: Date.parse("2026-08-05T00:00:00.000Z"),
    });
    expect(result.records.map((r) => r.message)).toEqual(["keep"]);
  });

  it("clamps the limit", async () => {
    const { service, prisma } = build();
    await service.queryLogs({ limit: 100_000 });
    expect(argOf(prisma.logEvent.findMany).take).toBe(500);
  });

  // Partial results beat no results: during an incident the provider that is down is often the
  // one you least need.
  it("returns what worked alongside warnings when a provider fails", async () => {
    const { service, railway } = build({ stored: [storedRow()] });
    railway.environmentLogs.mockImplementationOnce(async (opts: { warnings: string[] }) => {
      opts.warnings.push("Railway API returned HTTP 500");
      return [];
    });
    const result = await service.queryLogs({ sources: ["stored", "railway"] });
    expect(result.records).toHaveLength(1);
    expect(result.warnings).toContain("Railway API returned HTTP 500");
  });
});

describe("ObservabilityService.ingestVercelDrain", () => {
  const line = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      message: "boom",
      level: "error",
      source: "lambda",
      projectName: "uprise-admin",
      timestamp: Date.parse("2026-08-07T01:00:00.000Z"),
      ...over,
    });

  it("stores the entries worth keeping and reports both counts", async () => {
    const { service, prisma } = build();
    const body = [line(), line({ level: "info", statusCode: 200 }), line({ level: "warning" })].join("\n");
    const result = await service.ingestVercelDrain(body);
    expect(result).toEqual({ received: 3, stored: 2 });
    expect(prisma.logEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the batch is all noise", async () => {
    const { service, prisma } = build();
    const result = await service.ingestVercelDrain(line({ level: "info", statusCode: 200 }));
    expect(result).toEqual({ received: 1, stored: 0 });
    expect(prisma.logEvent.createMany).not.toHaveBeenCalled();
  });

  // Vercel retries a non-2xx delivery in full, so a throw here is how a drain wedges into a loop.
  it("never throws when the write fails — it reports zero stored", async () => {
    const { service, prisma } = build();
    prisma.logEvent.createMany.mockRejectedValueOnce(new Error("db down"));
    await expect(service.ingestVercelDrain(line())).resolves.toEqual({ received: 1, stored: 0 });
  });

  it("handles an empty or malformed body without throwing", async () => {
    const { service } = build();
    await expect(service.ingestVercelDrain("")).resolves.toEqual({ received: 0, stored: 0 });
    await expect(service.ingestVercelDrain("[not json")).resolves.toEqual({ received: 0, stored: 0 });
  });

  // Drain context carries request metadata; the same redaction rule applies as anywhere else.
  it("redacts sensitive context before writing", async () => {
    const { service, prisma } = build();
    await service.ingestVercelDrain(line({ message: 'failed {"apiKey":"sk_live","id":"keep"}' }));
    const written = prisma.logEvent.createMany.mock.calls[0]?.[0] as { data: Array<{ context: Record<string, unknown> }> };
    expect(written.data[0].context).toMatchObject({ apiKey: "[redacted]", id: "keep" });
  });
});

describe("ObservabilityService.sweepRetention", () => {
  it("deletes rows older than the configured window and reports the cutoff", async () => {
    const { service, prisma } = build();
    const result = await service.sweepRetention();
    expect(result).toMatchObject({ deleted: 7, retentionDays: 30 });
    const cutoff = argOf(prisma.logEvent.deleteMany).where.at.lt as Date;
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(ageDays).toBeCloseTo(30, 1);
  });

  it("falls back to 30 days on a nonsense retention setting", async () => {
    const prisma = {
      logEvent: { findMany: jest.fn(), deleteMany: jest.fn(async () => ({ count: 0 })) },
    };
    const service = new ObservabilityService(
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      { get: () => "not-a-number" } as never,
    );
    expect((await service.sweepRetention()).retentionDays).toBe(30);
  });
});
