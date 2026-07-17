import type { EffectiveLeaf } from "@uprise/segmentation";
import { SegmentLeafResolverService } from "./segment-leaf-resolver.service";

const condLeaf = (condition: unknown): EffectiveLeaf =>
  ({ kind: "condition", layer: "intent", editable: true, condition }) as EffectiveLeaf;

function setup() {
  const prisma: any = {
    contact: { findMany: jest.fn(async () => [{ id: "c1" }, { id: "c2" }]) },
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

  it("enum sanitisation: off-enum supportLevel values resolve ∅ rather than crashing Prisma", async () => {
    const { svc } = setup();
    const leaf = condLeaf({ type: "contact.supportLevel", op: "in", values: ["MEGA_FAN"] });
    const { resolved } = await svc.resolveLeaves("t1", [leaf], U, {});
    expect(resolved.get(leaf)!.size).toBe(0);
  });
});
