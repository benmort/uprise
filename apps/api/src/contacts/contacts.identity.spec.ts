import { ContactsService } from "./contacts.service";

function setup() {
  const prisma: any = {
    contact: {
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async () => ({})),
    },
    contactSourceRecord: { upsert: jest.fn(async () => ({})) },
    // resolveIdentity uses the array form of $transaction.
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const svc = new ContactsService(prisma);
  return { svc, prisma };
}

describe("ContactsService — identity resolution (meld doc 10)", () => {
  it("collapses two contacts sharing an email onto one canonicalContactId", async () => {
    const { svc, prisma } = setup();
    prisma.contact.findMany.mockResolvedValueOnce([
      { id: "c1", createdAt: new Date("2026-01-01") }, // earliest → canonical
      { id: "c2", createdAt: new Date("2026-02-01") },
    ]);

    const canonical = await svc.resolveIdentity("t1", { email: "ada@example.org" });

    expect(canonical?.id).toBe("c1");
    // duplicates (and anyone pointing at them) re-point to the canonical id
    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        OR: [{ id: { in: ["c2"] } }, { canonicalContactId: { in: ["c2"] } }],
      },
      data: { canonicalContactId: "c1" },
    });
    // the canonical row points at nobody
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { canonicalContactId: null },
    });
  });

  it("matches on email OR phoneE164", async () => {
    const { svc, prisma } = setup();
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c1", createdAt: new Date() }]);

    await svc.resolveIdentity("t1", { email: "ada@example.org", phoneE164: "+61400000000" });

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", OR: [{ email: "ada@example.org" }, { phoneE164: "+61400000000" }] },
      }),
    );
  });

  it("a single match is left untouched (no transaction)", async () => {
    const { svc, prisma } = setup();
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "c1", createdAt: new Date() }]);

    const result = await svc.resolveIdentity("t1", { phoneE164: "+61400000000" });

    expect(result?.id).toBe("c1");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns null when no identifiers are supplied", async () => {
    const { svc, prisma } = setup();
    const result = await svc.resolveIdentity("t1", {});
    expect(result).toBeNull();
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches", async () => {
    const { svc, prisma } = setup();
    prisma.contact.findMany.mockResolvedValueOnce([]);
    const result = await svc.resolveIdentity("t1", { email: "nobody@example.org" });
    expect(result).toBeNull();
  });

  it("recordSourceRecord upserts provenance idempotently on (sourceSystem, externalId)", async () => {
    const { svc, prisma } = setup();

    await svc.recordSourceRecord({
      tenantId: "t1",
      contactId: "c1",
      sourceSystem: "action_network",
      externalId: "an_123",
      data: { tags: ["volunteer"] },
    });

    expect(prisma.contactSourceRecord.upsert).toHaveBeenCalledWith({
      where: { sourceSystem_externalId: { sourceSystem: "action_network", externalId: "an_123" } },
      create: {
        tenantId: "t1",
        contactId: "c1",
        sourceSystem: "action_network",
        externalId: "an_123",
        data: { tags: ["volunteer"] },
      },
      update: { tenantId: "t1", contactId: "c1", data: { tags: ["volunteer"] } },
    });
  });
});
