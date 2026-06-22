import { ConfigService } from "@nestjs/config";
import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  const prisma = {
    tenant: { upsert: jest.fn() },
    blastRecipient: { count: jest.fn() },
  } as any;
  const config = {
    get: jest.fn((_: string, fallback?: string) => fallback),
  } as unknown as ConfigService;

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(prisma, config);
  });

  it("computes delivered KPI from deliveredAt", async () => {
    prisma.blastRecipient.count
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);

    const summary = await service.kpiSummary("blast_123");

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

    await service.kpiSummary("blast_123", "WHATSAPP");

    for (const call of prisma.blastRecipient.count.mock.calls) {
      expect(call[0].where).toMatchObject({ blastId: "blast_123", channel: "WHATSAPP" });
    }
  });

  it("ignores an invalid channel value (no channel filter applied)", async () => {
    prisma.blastRecipient.count.mockResolvedValue(0);

    await service.kpiSummary("blast_123", "carrier-pigeon");

    for (const call of prisma.blastRecipient.count.mock.calls) {
      expect(call[0].where).not.toHaveProperty("channel");
    }
  });
});
