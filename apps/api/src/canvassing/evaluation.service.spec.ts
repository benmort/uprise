import { EvaluationService } from "./evaluation.service";
import type { RawHeatRow } from "./heat-score";

const BOUNDARY = { type: "MultiPolygon", coordinates: [] };

function rawRow(code: string, doors = 100, competitiveness = 0.5): Partial<RawHeatRow> & { sa1Code: string } {
  return { sa1Code: code, doors, competitiveness } as never;
}

function setup(opts: {
  campaign?: Record<string, unknown> | null;
  walkLists?: number;
  rows?: Array<Partial<RawHeatRow>>;
  holdoutShare?: number;
} = {}) {
  const campaign =
    opts.campaign === undefined
      ? { id: "camp1", boundary: BOUNDARY, heatConfig: null, evaluation: null }
      : opts.campaign;
  const prisma: any = {
    canvassCampaign: {
      findFirst: jest.fn(async () => campaign),
      findUnique: jest.fn(async () => campaign),
      update: jest.fn(async ({ data }: any) => ({ id: "camp1", ...data })),
    },
    walkList: { count: jest.fn(async () => opts.walkLists ?? 0) },
    $queryRawUnsafe: jest.fn(async () => [{ share: opts.holdoutShare ?? 0 }]),
  };
  const factors: any = {
    extract: jest.fn(async () => opts.rows ?? Array.from({ length: 40 }, (_, i) => rawRow(`sa1-${i}`, 80 + i, (i % 10) / 10))),
  };
  const svc = new EvaluationService(prisma, factors);
  return { svc, prisma, factors };
}

describe("EvaluationService", () => {
  it("power previews without persisting", async () => {
    const { svc, prisma } = setup();
    const power = await svc.power("t1", "camp1");
    expect(power.clustersPerArm).toBe(20);
    expect(prisma.canvassCampaign.update).not.toHaveBeenCalled();
  });

  it("enable assigns arms deterministically and persists the stored evaluation", async () => {
    const { svc, prisma } = setup();
    const stored = await svc.enable("t1", "camp1");
    expect(stored.treatmentCodes.length + stored.holdoutCodes.length).toBe(40);
    expect(stored.power.refusal).toBeNull();
    expect(prisma.canvassCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "camp1" } }),
    );
    // Deterministic: enabling the same campaign again (fresh service) yields the same arms.
    const again = await setup().svc.enable("t1", "camp1");
    expect(again.treatmentCodes.sort()).toEqual(stored.treatmentCodes.sort());
  });

  it("refuses an unpowered design instead of blessing it", async () => {
    const { svc } = setup({ rows: Array.from({ length: 6 }, (_, i) => rawRow(`s${i}`)) });
    await expect(svc.enable("t1", "camp1")).rejects.toMatchObject({
      response: { error: { code: "EVALUATION_UNPOWERED" } },
    });
  });

  it("refuses enable when evaluation already exists (immutable assignment)", async () => {
    const { svc } = setup({
      campaign: { id: "camp1", boundary: BOUNDARY, heatConfig: null, evaluation: { holdoutCodes: [] } },
    });
    await expect(svc.enable("t1", "camp1")).rejects.toMatchObject({
      response: { error: { code: "EVALUATION_EXISTS" } },
    });
  });

  it("locks enable/disable once walklists exist (field work precedes nothing)", async () => {
    const { svc } = setup({ walkLists: 3 });
    await expect(svc.enable("t1", "camp1")).rejects.toMatchObject({
      response: { error: { code: "EVALUATION_LOCKED" } },
    });
    await expect(svc.disable("t1", "camp1")).rejects.toMatchObject({
      response: { error: { code: "EVALUATION_LOCKED" } },
    });
  });

  it("422s without a boundary", async () => {
    const { svc } = setup({ campaign: { id: "camp1", boundary: null, heatConfig: null, evaluation: null } });
    await expect(svc.power("t1", "camp1")).rejects.toMatchObject({
      response: { error: { code: "NO_BOUNDARY" } },
    });
  });

  describe("assertTurfOutsideHoldout", () => {
    const evaluation = { holdoutCodes: ["sa1-1", "sa1-2"] };

    it("refuses a turf substantially inside holdout SA1s", async () => {
      const { svc } = setup({
        campaign: { id: "camp1", boundary: BOUNDARY, heatConfig: null, evaluation },
        holdoutShare: 0.45,
      });
      await expect(svc.assertTurfOutsideHoldout("camp1", { type: "Polygon" })).rejects.toMatchObject({
        response: { error: { code: "EVALUATION_HOLDOUT" } },
      });
    });

    it("allows a turf with incidental overlap (≤ 20%)", async () => {
      const { svc } = setup({
        campaign: { id: "camp1", boundary: BOUNDARY, heatConfig: null, evaluation },
        holdoutShare: 0.1,
      });
      await expect(svc.assertTurfOutsideHoldout("camp1", { type: "Polygon" })).resolves.toBeUndefined();
    });

    it("no-ops without a campaign or without evaluation", async () => {
      const { svc, prisma } = setup();
      await svc.assertTurfOutsideHoldout(null, { type: "Polygon" });
      await svc.assertTurfOutsideHoldout("camp1", { type: "Polygon" }); // evaluation null
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
