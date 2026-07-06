import { SegmentEvaluatorService } from "./segment-evaluator.service";

function setup(definition: unknown) {
  const created: Array<{ segmentId: string; contactId: string }> = [];
  const prisma: any = {
    audienceSegment: {
      findUnique: jest.fn(async () => ({ id: "seg1", tenantId: "t1", definition })),
    },
    contact: { findMany: jest.fn(async () => []) },
    contactSourceRecord: { findMany: jest.fn(async () => []) },
    contactConsent: { findMany: jest.fn(async () => []) },
    audienceSegmentMember: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async ({ data }: any) => {
        created.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const outbox = { append: jest.fn(async () => undefined) } as any;
  const svc = new SegmentEvaluatorService(prisma, logger, outbox);
  return { svc, prisma, created, outbox };
}

const idSet = (created: Array<{ contactId: string }>) =>
  new Set(created.map((m) => m.contactId));

describe("SegmentEvaluatorService", () => {
  it("emailDomain clause materialises matching contacts", async () => {
    const { svc, prisma, created } = setup({ type: "emailDomain", domain: "getup.org.au" });
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);

    const { count } = await svc.evaluate("seg1");

    expect(count).toBe(2);
    // queries by the @domain suffix, case-insensitive
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          email: { endsWith: "@getup.org.au", mode: "insensitive" },
        }),
      }),
    );
    expect(idSet(created)).toEqual(new Set(["c1", "c2"]));
  });

  it("hasSource clause joins ContactSourceRecord by sourceSystem", async () => {
    const { svc, prisma, created } = setup({ type: "hasSource", sourceSystem: "action_network" });
    prisma.contactSourceRecord.findMany.mockResolvedValueOnce([
      { contactId: "c3" },
      { contactId: "c4" },
    ]);

    await svc.evaluate("seg1");

    expect(prisma.contactSourceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", sourceSystem: "action_network" },
        distinct: ["contactId"],
      }),
    );
    expect(idSet(created)).toEqual(new Set(["c3", "c4"]));
  });

  it("`all` combinator intersects child clauses", async () => {
    const { svc, prisma, created } = setup({
      all: [
        { type: "emailDomain", domain: "getup.org.au" },
        { type: "hasSource", sourceSystem: "csv" },
      ],
    });
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);
    prisma.contactSourceRecord.findMany.mockResolvedValueOnce([
      { contactId: "c2" },
      { contactId: "c3" },
    ]);

    await svc.evaluate("seg1");

    expect(idSet(created)).toEqual(new Set(["c2"])); // intersection
  });

  it("`any` combinator unions child clauses", async () => {
    const { svc, prisma, created } = setup({
      any: [
        { type: "turf", turfId: "turf1" },
        { type: "consentState", channel: "WHATSAPP", state: "OPTED_IN" },
      ],
    });
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]); // turf
    prisma.contactConsent.findMany.mockResolvedValueOnce([{ contactId: "c2" }]); // consent

    await svc.evaluate("seg1");

    expect(idSet(created)).toEqual(new Set(["c1", "c2"]));
  });

  it("consentState clause ignores unknown channel/state (no members)", async () => {
    const { svc, prisma, created } = setup({ type: "consentState", channel: "EMAIL", state: "OPTED_IN" });

    const { count } = await svc.evaluate("seg1");

    expect(count).toBe(0);
    expect(prisma.contactConsent.findMany).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });

  it("wholesale-rewrites membership: stale members are deleted before re-insert", async () => {
    const { svc, prisma } = setup({ type: "all" });
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]);

    await svc.evaluate("seg1");

    expect(prisma.audienceSegmentMember.deleteMany).toHaveBeenCalledWith({ where: { segmentId: "seg1" } });
    expect(prisma.audienceSegmentMember.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ segmentId: "seg1", contactId: "c1" }] }),
    );
  });

  it("empty result still clears stale membership but skips createMany", async () => {
    const { svc, prisma } = setup({ type: "emailDomain", domain: "nobody.example" });
    prisma.contact.findMany.mockResolvedValueOnce([]);

    const { count } = await svc.evaluate("seg1");

    expect(count).toBe(0);
    expect(prisma.audienceSegmentMember.deleteMany).toHaveBeenCalledWith({ where: { segmentId: "seg1" } });
    expect(prisma.audienceSegmentMember.createMany).not.toHaveBeenCalled();
  });

  it("no rule (empty definition) → every contact in the tenant", async () => {
    const { svc, prisma, created } = setup(null);
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);

    await svc.evaluate("seg1");

    expect(prisma.contact.findMany).toHaveBeenCalledWith({ where: { tenantId: "t1" }, select: { id: true } });
    expect(idSet(created)).toEqual(new Set(["c1", "c2", "c3"]));
  });

  it("throws when the segment does not exist", async () => {
    const { svc, prisma } = setup({ type: "all" });
    prisma.audienceSegment.findUnique.mockResolvedValueOnce(null);
    await expect(svc.evaluate("missing")).rejects.toThrow();
  });

  it("unwraps an { include: {...} } rule wrapper (prog parity)", async () => {
    const { svc, prisma, created } = setup({ include: { type: "emailDomain", domain: "getup.org.au" } });
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c9" }]);

    await svc.evaluate("seg1");

    expect(idSet(created)).toEqual(new Set(["c9"]));
  });

  it("emits audience.segment.recomputed atomically with the rewrite, carrying the count", async () => {
    const { svc, prisma, outbox } = setup({ type: "all" });
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);

    await svc.evaluate("seg1");

    // Emitted with the transaction handle (cb receives `prisma` as tx here).
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: "audience.segment.recomputed",
        aggregateId: "seg1",
        payload: expect.objectContaining({ segmentId: "seg1", tenantId: "t1", memberCount: 2 }),
      }),
    );
  });

  it("emits audience.segment.recomputed even when membership resolves to empty (count 0)", async () => {
    const { svc, prisma, outbox } = setup({ type: "emailDomain", domain: "nobody.example" });
    prisma.contact.findMany.mockResolvedValueOnce([]);

    await svc.evaluate("seg1");

    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: "audience.segment.recomputed",
        payload: expect.objectContaining({ memberCount: 0 }),
      }),
    );
  });
});
