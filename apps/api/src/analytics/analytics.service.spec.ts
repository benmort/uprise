import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  const prisma = {
    blast: { findFirst: jest.fn() },
    blastRecipient: { count: jest.fn() },
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
});
