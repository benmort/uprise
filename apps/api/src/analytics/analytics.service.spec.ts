import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  const prisma = {
    blast: { findFirst: jest.fn() },
    blastRecipient: { count: jest.fn() },
    analyticsSnapshot: { createMany: jest.fn() },
    $queryRaw: jest.fn(),
  } as any;

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Blast-scoped reads first assert the blast belongs to the caller's tenant.
    prisma.blast.findFirst.mockResolvedValue({ id: "blast_123" });
    service = new AnalyticsService(prisma);
  });

  it("computes delivered KPI from deliveredAt", async () => {
    prisma.blastRecipient.count
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);

    const summary = await service.kpiSummary("tenant-a", "blast_123");

    expect(prisma.blastRecipient.count).toHaveBeenNthCalledWith(3, {
      where: { blastId: "blast_123", deliveredAt: { not: null } },
    });
    expect(summary).toEqual({
      totalContacted: 20,
      sent: 15,
      delivered: 12,
      responded: 4,
      failed: 1,
    });
  });

  it("narrows the KPI queries by channel when one is given", async () => {
    prisma.blastRecipient.count.mockResolvedValue(0);

    await service.kpiSummary("tenant-a", "blast_123", "WHATSAPP");

    for (const call of prisma.blastRecipient.count.mock.calls) {
      expect(call[0].where).toMatchObject({ blastId: "blast_123", channel: "WHATSAPP" });
    }
  });

  it("ignores an invalid channel value (no channel filter applied)", async () => {
    prisma.blastRecipient.count.mockResolvedValue(0);

    await service.kpiSummary("tenant-a", "blast_123", "carrier-pigeon");

    for (const call of prisma.blastRecipient.count.mock.calls) {
      expect(call[0].where).not.toHaveProperty("channel");
    }
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
    // The raw query is tenant-scoped and windowed on bucketAt.
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toContain("tenant-a");

    await service.vitalsSummary("tenant-a", -3);
    expect((await service.vitalsSummary("tenant-a", -3)).days).toBe(1);
  });
});
