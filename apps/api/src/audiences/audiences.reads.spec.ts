import { NotFoundException } from "@nestjs/common";
import { AudienceKind } from "@uprise/db";
import { AudiencesService } from "./audiences.service";

/**
 * The audience READ surface that used to pull whole tables into the app:
 * `whatsappReach` (consent ledger × members) and `exportContactsCsv` (every row,
 * every column). Both now push the work into Postgres — these pin the query
 * shapes as well as the answers.
 */
function setup() {
  const prisma: any = {
    audience: { findFirst: jest.fn() },
    audienceContact: { findMany: jest.fn(async () => []) },
    contactConsent: { findMany: jest.fn(async () => []) },
    $queryRaw: jest.fn(async () => []),
  };
  const config: any = { get: (_k: string, d?: unknown) => d };
  const svc = new AudiencesService(prisma, config);
  return { svc, prisma };
}

describe("AudiencesService — whatsappReach", () => {
  it("404s on an audience outside the tenant", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue(null);
    await expect(svc.whatsappReach("t1", "aud1")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("counts the dynamic opt-in audience as the ledger's distinct phones", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue({
      id: "aud1",
      tenantId: "t1",
      kind: AudienceKind.WHATSAPP_OPTED_IN,
    });
    // Postgres COUNT comes back as bigint.
    prisma.$queryRaw.mockResolvedValue([{ optedIn: 12n }]);

    expect(await svc.whatsappReach("t1", "aud1")).toEqual({ total: 12, reachable: 12 });

    const [query] = prisma.$queryRaw.mock.calls[0];
    expect(query.sql).toContain(`COUNT(DISTINCT cc."phoneE164")`);
    expect(query.sql).toContain(`messaging."ContactConsent"`);
    expect(query.values).toEqual(["t1", "WHATSAPP", "OPTED_IN"]);
    // Neither side is read into memory any more.
    expect(prisma.contactConsent.findMany).not.toHaveBeenCalled();
    expect(prisma.audienceContact.findMany).not.toHaveBeenCalled();
  });

  it("semi-joins a static audience's members against the tenant's opt-ins", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue({
      id: "aud1",
      tenantId: "t1",
      kind: AudienceKind.STATIC,
    });
    prisma.$queryRaw.mockResolvedValue([{ total: 500n, reachable: 130n }]);

    expect(await svc.whatsappReach("t1", "aud1")).toEqual({ total: 500, reachable: 130 });

    const [query] = prisma.$queryRaw.mock.calls[0];
    // One query: rows counted, opt-ins counted by a filtered EXISTS on the phone.
    expect(query.sql).toContain(`audience."AudienceContact" ac`);
    expect(query.sql).toContain("COUNT(*) FILTER");
    expect(query.sql).toContain(`cc."phoneE164" = ac."phoneE164"`);
    // Tenant scopes the consent side; the audience (already tenant-checked) scopes the members.
    expect(query.values).toEqual(["t1", "WHATSAPP", "OPTED_IN", "aud1"]);
    expect(prisma.audienceContact.findMany).not.toHaveBeenCalled();
  });

  it("reads zero when the count query returns nothing", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue({ id: "aud1", tenantId: "t1", kind: AudienceKind.STATIC });
    prisma.$queryRaw.mockResolvedValue([]);
    expect(await svc.whatsappReach("t1", "aud1")).toEqual({ total: 0, reachable: 0 });
  });
});

describe("AudiencesService — exportContactsCsv", () => {
  const row = (id: string, at: string, over: Record<string, unknown> = {}) => ({
    id,
    createdAt: new Date(at),
    fullName: `Name ${id}`,
    phoneE164: `+6140000000${id.slice(-1)}`,
    metadata: { contactable: true },
    ...over,
  });

  it("404s on an audience outside the tenant", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue(null);
    await expect(svc.exportContactsCsv("t1", "aud1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("selects only the CSV columns (+ the keyset) and orders by createdAt then id", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue({ id: "aud1", tenantId: "t1" });
    prisma.audienceContact.findMany.mockResolvedValue([row("c1", "2026-01-01T00:00:00Z")]);

    const csv = await svc.exportContactsCsv("t1", "aud1");

    expect(csv).toBe('name,phone,metadata\n"Name c1","+61400000001","{\\"contactable\\":true}"');
    const [args] = prisma.audienceContact.findMany.mock.calls[0];
    expect(args.select).toEqual({
      id: true,
      createdAt: true,
      fullName: true,
      phoneE164: true,
      metadata: true,
    });
    expect(args.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(args.take).toBe(1000);
    // First page has no keyset predicate.
    expect(args.where).toEqual({ audienceId: "aud1" });
  });

  it("walks forward on (createdAt, id) until a short page ends it", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue({ id: "aud1", tenantId: "t1" });
    const full = Array.from({ length: 1000 }, (_, i) =>
      row(`c${i}`, i === 999 ? "2026-01-02T00:00:00Z" : "2026-01-01T00:00:00Z"),
    );
    prisma.audienceContact.findMany
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([row("c1000", "2026-01-03T00:00:00Z")]);

    const csv = await svc.exportContactsCsv("t1", "aud1");

    expect(csv.split("\n")).toHaveLength(1002); // header + 1001 rows
    expect(prisma.audienceContact.findMany).toHaveBeenCalledTimes(2);
    // The second page resumes strictly after the last row of the first.
    const [second] = prisma.audienceContact.findMany.mock.calls[1];
    expect(second.where).toEqual({
      audienceId: "aud1",
      OR: [
        { createdAt: { gt: new Date("2026-01-02T00:00:00Z") } },
        { createdAt: new Date("2026-01-02T00:00:00Z"), id: { gt: "c999" } },
      ],
    });
  });

  it("stops on an exactly-full final page rather than looping forever", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue({ id: "aud1", tenantId: "t1" });
    const full = Array.from({ length: 1000 }, (_, i) => row(`c${i}`, "2026-01-01T00:00:00Z"));
    prisma.audienceContact.findMany.mockResolvedValueOnce(full).mockResolvedValueOnce([]);

    const csv = await svc.exportContactsCsv("t1", "aud1");

    expect(csv.split("\n")).toHaveLength(1001);
    expect(prisma.audienceContact.findMany).toHaveBeenCalledTimes(2);
  });

  it("emits the header alone for an empty audience", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue({ id: "aud1", tenantId: "t1" });
    expect(await svc.exportContactsCsv("t1", "aud1")).toBe("name,phone,metadata\n");
  });

  it("tolerates a null name and null metadata", async () => {
    const { svc, prisma } = setup();
    prisma.audience.findFirst.mockResolvedValue({ id: "aud1", tenantId: "t1" });
    prisma.audienceContact.findMany.mockResolvedValue([
      row("c1", "2026-01-01T00:00:00Z", { fullName: null, metadata: null }),
    ]);
    expect(await svc.exportContactsCsv("t1", "aud1")).toBe(
      'name,phone,metadata\n"","+61400000001","{}"',
    );
  });
});
