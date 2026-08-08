import type { EffectiveLeaf } from "@uprise/segmentation";
import { memoiseUniverse, SegmentLeafResolverService } from "./segment-leaf-resolver.service";

const condLeaf = (condition: unknown): EffectiveLeaf =>
  ({ kind: "condition", layer: "intent", editable: true, condition }) as EffectiveLeaf;

function setup() {
  const prisma: any = {
    contact: { findMany: jest.fn(async () => [{ id: "c1" }, { id: "c2" }]) },
    suppression: { findMany: jest.fn(async () => []) },
    $queryRaw: jest.fn(async () => [{ id: "c1" }]),
    $queryRawUnsafe: jest.fn(async () => [{ id: "c1" }]),
  };
  const logger = { debug: jest.fn(), warn: jest.fn() } as any;
  const insights = { resolvePollThresholdToGeoCodes: jest.fn(async () => ["SED_X"]) } as any;
  const customQuery = { resolveContacts: jest.fn(async () => ({ ok: true, reasons: [], contactIds: ["c2"] })) } as any;
  const svc = new SegmentLeafResolverService(prisma, logger, insights, customQuery);
  return { svc, prisma, logger, insights, customQuery };
}

const U = new Set(["c1", "c2", "c3"]);

describe("SegmentLeafResolverService — routing edges", () => {
  it("insights.pollThreshold routes through InsightsService then the validated geo join", async () => {
    const { svc, prisma, insights } = setup();
    const leaf = condLeaf({
      type: "insights.pollThreshold",
      pollId: "p1",
      questionCode: "C5",
      response: "NET Support",
      op: ">=",
      value: 50,
      geoKind: "sed_upper",
    });
    const { resolved } = await svc.resolveLeaves("t1", [leaf], U, {});
    expect(insights.resolvePollThresholdToGeoCodes).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ pollId: "p1", geoKind: "sed_upper" }),
    );
    const [sql] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("ar.sed_upper_code IN");
    expect([...resolved.get(leaf)!]).toEqual(["c1"]);
  });

  it("custom.clause resolves via the contained SQL lane; failures surface + fail closed", async () => {
    const { svc, customQuery } = setup();
    const leaf = condLeaf({ type: "custom.clause", clauseRef: "cq1" });
    const clauses = [{ id: "cq1", label: "l", intent: "i", predicate: "state = 'NSW'" }];

    const ok = await svc.resolveLeaves("t1", [leaf], U, { customClauses: clauses });
    expect([...ok.resolved.get(leaf)!]).toEqual(["c2"]);
    expect(ok.clauseErrors).toHaveLength(0);

    customQuery.resolveContacts.mockResolvedValueOnce({ ok: false, reasons: ["nope"], contactIds: [] });
    const failed = await svc.resolveLeaves("t1", [leaf], U, { customClauses: clauses });
    expect(failed.resolved.get(leaf)!.size).toBe(0);
    expect(failed.clauseErrors).toEqual([{ clauseId: "cq1", reasons: ["nope"] }]);

    // Missing clause on the envelope: ∅ + surfaced error.
    const dangling = await svc.resolveLeaves("t1", [leaf], U, { customClauses: [] });
    expect(dangling.resolved.get(leaf)!.size).toBe(0);
    expect(dangling.clauseErrors[0].reasons[0]).toContain("not found");
  });

  it("an unroutable leaf and a throwing resolver both fail closed to ∅ with a warn", async () => {
    const { svc, prisma, logger } = setup();
    const unroutable = condLeaf({ type: "policy.isActive", op: "is", policy: "org-default" });
    const throwing = condLeaf({ type: "contact.createdAt", op: "within", days: 30 });
    prisma.contact.findMany.mockRejectedValueOnce(new Error("db down"));

    const { resolved } = await svc.resolveLeaves("t1", [throwing, unroutable], U, {});
    expect(resolved.get(throwing)!.size).toBe(0);
    expect(resolved.get(unroutable)!.size).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("geo.area refuses an off-allowlist areaType (∅, no SQL)", async () => {
    const { svc, prisma } = setup();
    const leaf = condLeaf({ type: "geo.area", areaType: "galaxy", op: "in", values: ["X"] });
    const { resolved } = await svc.resolveLeaves("t1", [leaf], U, {});
    expect(resolved.get(leaf)!.size).toBe(0);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("contact.consented resolves the APP 5 consent stamp; false/isNot ask the DB for the negative", async () => {
    const { svc, prisma } = setup();
    // The stamped / unstamped split, answered by the predicate rather than by
    // complementing the universe in JS.
    prisma.contact.findMany.mockImplementation(async ({ where }: any) =>
      where.consentAt === null ? [{ id: "c3" }] : [{ id: "c1" }, { id: "c2" }],
    );
    const consented = condLeaf({ type: "contact.consented", op: "is", value: true });
    const notConsented = condLeaf({ type: "contact.consented", op: "is", value: false });
    const isNot = condLeaf({ type: "contact.consented", op: "isNot", value: true });
    const isNotFalse = condLeaf({ type: "contact.consented", op: "isNot", value: false });

    const { resolved } = await svc.resolveLeaves(
      "t1",
      [consented, notConsented, isNot, isNotFalse],
      U,
      {},
    );
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", consentAt: { not: null } },
      select: { id: true },
    });
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", consentAt: null },
      select: { id: true },
    });
    expect([...resolved.get(consented)!].sort()).toEqual(["c1", "c2"]);
    expect([...resolved.get(notConsented)!]).toEqual(["c3"]);
    // `isNot true` flips to the absent side; `isNot false` flips back to the present one.
    expect([...resolved.get(isNot)!]).toEqual(["c3"]);
    expect([...resolved.get(isNotFalse)!].sort()).toEqual(["c1", "c2"]);
  });

  it("contact.hasEmail / hasPhone push both polarities into the predicate (no universe complement)", async () => {
    const { svc, prisma } = setup();
    prisma.contact.findMany.mockImplementation(async ({ where }: any) => {
      if (where.email === null) return [{ id: "c3" }];
      if (where.phoneE164 === null) return [{ id: "c2" }];
      return [{ id: "c1" }, { id: "c2" }];
    });
    const hasEmail = condLeaf({ type: "contact.hasEmail", op: "is", value: true });
    const noEmail = condLeaf({ type: "contact.hasEmail", op: "is", value: false });
    const notHasPhone = condLeaf({ type: "contact.hasPhone", op: "isNot", value: true });

    const { resolved } = await svc.resolveLeaves("t1", [hasEmail, noEmail, notHasPhone], U, {});

    expect([...resolved.get(hasEmail)!].sort()).toEqual(["c1", "c2"]);
    expect([...resolved.get(noEmail)!]).toEqual(["c3"]);
    expect([...resolved.get(notHasPhone)!]).toEqual(["c2"]);
    // Every polarity is one indexed read — never "fetch the positives, subtract".
    expect(prisma.contact.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", email: null },
      select: { id: true },
    });
    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", phoneE164: null },
      select: { id: true },
    });
  });

  it("compliance.notSuppressed anti-joins Suppression in one tenant-scoped query", async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ id: "c2" }, { id: "c3" }]);
    const leaf = condLeaf({ type: "compliance.notSuppressed", op: "is" });

    const { resolved } = await svc.resolveLeaves("t1", [leaf], U, {});

    expect([...resolved.get(leaf)!].sort()).toEqual(["c2", "c3"]);
    // The suppression list is never pulled into the app, and the tenant is bound as
    // a parameter on both sides of the anti-join.
    expect(prisma.suppression.findMany).not.toHaveBeenCalled();
    const [query] = prisma.$queryRaw.mock.calls[0];
    expect(query.sql).toContain("NOT EXISTS");
    expect(query.sql).toContain(`messaging."Suppression"`);
    expect(query.sql).toContain(`lower(s."email") = lower(c."email")`);
    expect(query.values).toEqual(["t1", "t1"]);
  });

  it("activity.lastActiveWithin fans its four sources out together", async () => {
    const { svc, prisma } = setup();
    const order: string[] = [];
    const settle = <T>(name: string, rows: T[]) => {
      order.push(`start:${name}`);
      return new Promise<T[]>((resolve) =>
        setImmediate(() => {
          order.push(`end:${name}`);
          resolve(rows);
        }),
      );
    };
    prisma.doorKnock = { findMany: jest.fn(() => settle("knock", [{ contactId: "c1" }])) };
    prisma.questionResponse = { findMany: jest.fn(() => settle("survey", [{ contactId: "c2" }])) };
    prisma.eventRsvp = { findMany: jest.fn(() => settle("rsvp", [{ contactId: "c3" }])) };
    prisma.inboundMessage = { findMany: jest.fn(() => settle("inbound", [{ contactId: null }])) };
    const leaf = condLeaf({ type: "activity.lastActiveWithin", op: "within", days: 30 });

    const { resolved } = await svc.resolveLeaves("t1", [leaf], U, {});

    expect([...resolved.get(leaf)!].sort()).toEqual(["c1", "c2", "c3"]);
    // All four start before any finishes — sequential awaits would interleave.
    expect(order.slice(0, 4)).toEqual(["start:knock", "start:survey", "start:rsvp", "start:inbound"]);
  });

  it("enum sanitisation: off-enum supportLevel values resolve ∅ rather than crashing Prisma", async () => {
    const { svc } = setup();
    const leaf = condLeaf({ type: "contact.supportLevel", op: "in", values: ["MEGA_FAN"] });
    const { resolved } = await svc.resolveLeaves("t1", [leaf], U, {});
    expect(resolved.get(leaf)!.size).toBe(0);
  });
});

describe("memoiseUniverse", () => {
  it("loads once per memo, however many callers ask", async () => {
    const load = jest.fn(async () => new Set(["c1", "c2"]));
    const universe = memoiseUniverse(load);

    const [a, b, c] = await Promise.all([universe(), universe(), universe()]);

    expect(load).toHaveBeenCalledTimes(1);
    // The same instance every time — callers share one set, they do not each get a copy.
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect([...a].sort()).toEqual(["c1", "c2"]);
    await universe();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares the in-flight promise rather than racing two loads", async () => {
    let release: (v: Set<string>) => void = () => {};
    const load = jest.fn(() => new Promise<Set<string>>((resolve) => (release = resolve)));
    const universe = memoiseUniverse(load);

    const first = universe();
    const second = universe();
    expect(load).toHaveBeenCalledTimes(1);

    release(new Set(["c1"]));
    expect([...(await first)]).toEqual(["c1"]);
    expect(await second).toBe(await first);
  });

  it("is per-memo, so a new run re-reads the roll (no cross-run staleness)", async () => {
    const load = jest.fn(async () => new Set(["c1"]));
    await memoiseUniverse(load)();
    await memoiseUniverse(load)();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache a hit under the miss — a rejection settles the run's universe", async () => {
    const load = jest.fn(async () => {
      throw new Error("db down");
    });
    const universe = memoiseUniverse(load);
    await expect(universe()).rejects.toThrow("db down");
    await expect(universe()).rejects.toThrow("db down");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
