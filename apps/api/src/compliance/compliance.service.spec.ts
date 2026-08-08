import { ConsentState } from "@uprise/db";
import { ComplianceService } from "./compliance.service";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    contactConsent: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    ...overrides,
  };
  return base;
}

describe("ComplianceService", () => {
  let prisma: any;
  let service: ComplianceService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ComplianceService(prisma);
  });

  it("returns the real total, per-channel counts and page entries", async () => {
    prisma.contactConsent.findMany.mockResolvedValue([
      { id: "e1", phoneE164: "+61400000000", channel: "SMS", source: "keyword", updatedAt: new Date() },
    ]);
    prisma.contactConsent.groupBy.mockResolvedValue([
      { channel: "SMS", _count: { _all: 7 } },
      { channel: "WHATSAPP", _count: { _all: 3 } },
    ]);
    const res = await service.optOutLedger("t1", { take: 10, skip: 20 });

    // The groupBy already partitions exactly the same `where`, so the total is its
    // sum — a second full count of the ledger buys nothing.
    expect(res.total).toBe(10);
    expect(res.byChannel).toEqual([
      { channel: "SMS", count: 7 },
      { channel: "WHATSAPP", count: 3 },
    ]);
    expect(res.entries).toHaveLength(1);
    expect(prisma.contactConsent.count).not.toHaveBeenCalled();

    // Scoped to the tenant's opted-out rows, with the requested pagination.
    const where = { tenantId: "t1", state: ConsentState.OPTED_OUT };
    expect(prisma.contactConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, take: 10, skip: 20 }),
    );
    expect(prisma.contactConsent.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["channel"], where }),
    );
  });

  it("an empty ledger totals zero (no rows to sum)", async () => {
    const res = await service.optOutLedger("t1");
    expect(res).toEqual({ total: 0, byChannel: [], entries: [] });
  });

  it("defaults to take 50 / skip 0 when unspecified", async () => {
    await service.optOutLedger("t1");
    expect(prisma.contactConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 0 }),
    );
  });

  it("clamps take to [1,100] and floors skip at 0", async () => {
    await service.optOutLedger("t1", { take: 500, skip: -5 });
    expect(prisma.contactConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100, skip: 0 }),
    );

    prisma.contactConsent.findMany.mockClear();
    await service.optOutLedger("t1", { take: 0 });
    expect(prisma.contactConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it("falls back to the default take when a non-numeric value is passed", async () => {
    await service.optOutLedger("t1", { take: Number.NaN as any });
    expect(prisma.contactConsent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });
});
