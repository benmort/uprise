import { AnalyticsService } from "./analytics.service";
import { VITAL_METRICS } from "./vitals.util";

describe("AnalyticsService", () => {
  const prisma = {
    blast: { findFirst: jest.fn(), findMany: jest.fn() },
    blastRecipient: { count: jest.fn(), groupBy: jest.fn() },
    analyticsSnapshot: { createMany: jest.fn() },
    $queryRaw: jest.fn(),
  } as any;

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Blast-scoped reads first assert the blast belongs to the caller's tenant.
    prisma.blast.findFirst.mockResolvedValue({ id: "blast_123" });
    prisma.blastRecipient.groupBy.mockResolvedValue([]);
    service = new AnalyticsService(prisma);
  });

  it("computes delivered KPI from deliveredAt", async () => {
    // sent/responded/failed (and the delivered bucket folded into totalContacted)
    // come off a single status roll-up; delivered keys off deliveredAt, so it stays
    // its own count.
    prisma.blastRecipient.groupBy.mockResolvedValue([
      { status: "SENT", _count: 15 },
      { status: "DELIVERED", _count: 0 },
      { status: "RESPONDED", _count: 4 },
      { status: "FAILED", _count: 1 },
      { status: "PENDING", _count: 7 },
    ]);
    prisma.blastRecipient.count.mockResolvedValueOnce(12);

    const summary = await service.kpiSummary("tenant-a", "blast_123");

    expect(prisma.blastRecipient.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.blastRecipient.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: { blastId: "blast_123" },
      _count: true,
    });
    // Exactly one count survives the roll-up, and it is the deliveredAt one.
    expect(prisma.blastRecipient.count).toHaveBeenCalledTimes(1);
    expect(prisma.blastRecipient.count).toHaveBeenNthCalledWith(1, {
      where: { blastId: "blast_123", deliveredAt: { not: null } },
    });
    // PENDING is not a contacted status, so it stays out of totalContacted.
    expect(summary).toEqual({
      totalContacted: 20,
      sent: 15,
      delivered: 12,
      responded: 4,
      failed: 1,
    });
  });

  it("reports zeroes for statuses the roll-up did not return", async () => {
    prisma.blastRecipient.groupBy.mockResolvedValue([]);
    prisma.blastRecipient.count.mockResolvedValue(0);

    await expect(service.kpiSummary("tenant-a", "blast_123")).resolves.toEqual({
      totalContacted: 0,
      sent: 0,
      delivered: 0,
      responded: 0,
      failed: 0,
    });
  });

  it("narrows the KPI queries by channel when one is given", async () => {
    prisma.blastRecipient.count.mockResolvedValue(0);

    await service.kpiSummary("tenant-a", "blast_123", "WHATSAPP");

    const calls = [
      ...prisma.blastRecipient.count.mock.calls,
      ...prisma.blastRecipient.groupBy.mock.calls,
    ];
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call[0].where).toMatchObject({ blastId: "blast_123", channel: "WHATSAPP" });
    }
  });

  it("ignores an invalid channel value (no channel filter applied)", async () => {
    prisma.blastRecipient.count.mockResolvedValue(0);

    await service.kpiSummary("tenant-a", "blast_123", "carrier-pigeon");

    const calls = [
      ...prisma.blastRecipient.count.mock.calls,
      ...prisma.blastRecipient.groupBy.mock.calls,
    ];
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call[0].where).not.toHaveProperty("channel");
    }
  });

  it("recentBlasts derives the recipient total and awaiting count from one roll-up", async () => {
    prisma.blast.findMany.mockResolvedValue([
      { id: "blast_a", title: "A" },
      { id: "blast_b", title: "B" },
    ]);
    prisma.blastRecipient.groupBy.mockResolvedValue([
      { blastId: "blast_a", status: "SENT", _count: 3 },
      { blastId: "blast_a", status: "DELIVERED", _count: 2 },
      { blastId: "blast_a", status: "RESPONDED", _count: 1 },
      { blastId: "blast_a", status: "PENDING", _count: 4 },
      { blastId: "blast_b", status: "FAILED", _count: 5 },
    ]);

    const rows = await service.recentBlasts("tenant-a");

    // One roll-up only – the relation _count pass over the same rows is gone.
    expect(prisma.blastRecipient.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.blast.findMany.mock.calls[0][0]).not.toHaveProperty("include");
    expect(rows).toEqual([
      { id: "blast_a", title: "A", _count: { recipients: 10 }, awaitingResponseCount: 5 },
      { id: "blast_b", title: "B", _count: { recipients: 5 }, awaitingResponseCount: 0 },
    ]);
  });

  it("recentBlasts skips the roll-up when the tenant has no blasts", async () => {
    prisma.blast.findMany.mockResolvedValue([]);

    await expect(service.recentBlasts("tenant-a")).resolves.toEqual([]);
    expect(prisma.blastRecipient.groupBy).not.toHaveBeenCalled();
  });

  it("recordVitals writes sanitised snapshot rows stamped with the caller's tenant", async () => {
    prisma.analyticsSnapshot.createMany.mockResolvedValue({ count: 1 });

    const result = await service.recordVitals("tenant-a", {
      vitals: [
        { metric: "lcp", value: 1800, route: "/", connection: "4g", device: "mobile" },
        { metric: "bogus", value: 1 },
      ],
    });

    expect(result).toEqual({ accepted: 1 });
    const { data } = prisma.analyticsSnapshot.createMany.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      tenantId: "tenant-a",
      metricName: "webvital.lcp",
      metricValue: 1800,
      labels: { route: "/", connection: "4g", device: "mobile" },
    });
    expect(data[0].bucketAt).toBeInstanceOf(Date);
  });

  it("recordVitals skips the write entirely when nothing survives sanitisation", async () => {
    const result = await service.recordVitals("tenant-a", { vitals: [{ metric: "nope", value: 1 }] });
    expect(result).toEqual({ accepted: 0 });
    expect(prisma.analyticsSnapshot.createMany).not.toHaveBeenCalled();
  });

  it("vitalsSummary clamps the window to 1–90 days and returns the percentile rows", async () => {
    const rows = [{ metricName: "webvital.lcp", route: "/", samples: 3, p50: 1, p75: 2, p95: 3 }];
    prisma.$queryRaw.mockResolvedValue(rows);

    const result = await service.vitalsSummary("tenant-a", 10_000);

    expect(result.days).toBe(90);
    expect(result.rows).toBe(rows);
    expect(result.since).toBeInstanceOf(Date);
    // The raw query is tenant-scoped and windowed on bucketAt, and matches metric
    // names by an explicit IN list (a LIKE prefix would defeat the composite index).
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toContain("tenant-a");
    expect(sql.sql).not.toContain("LIKE");
    for (const metric of VITAL_METRICS) {
      expect(sql.values).toContain(`webvital.${metric}`);
    }

    await service.vitalsSummary("tenant-a", -3);
    expect((await service.vitalsSummary("tenant-a", -3)).days).toBe(1);
  });
});
