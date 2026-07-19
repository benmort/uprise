import { HeatService, INLINE_SA1_CAP, PREVIEW_SA1_CAP } from "./heat.service";
import type { RawHeatRow } from "./heat-score";

const BOUNDARY = { type: "MultiPolygon", coordinates: [[[[144, -37], [145, -37], [145, -38], [144, -37]]]] };

function rawRow(overrides: Partial<RawHeatRow> = {}): RawHeatRow {
  return {
    sa1Code: "20401",
    doors: 120,
    occupiedMbs: 5,
    areaKm2: 0.4,
    fitValue: 5,
    pollPercent: null,
    pollIsNet: false,
    electorateMajorityShare: 1,
    competitiveness: 0.7,
    attributedVotes: 300,
    alignedFpShare: null,
    referendumYesPct: null,
    contacts: 10,
    supporters: 4,
    dispositioned: 6,
    knockDecay: 2,
    communityValue: 30,
    informalityShare: 0.04,
    coverageFraction: 1,
    ...overrides,
  };
}

function setup(opts: {
  campaign?: Record<string, unknown> | null;
  existingRun?: Record<string, unknown> | null;
  sa1Count?: number;
  rows?: RawHeatRow[];
} = {}) {
  const campaign =
    opts.campaign === undefined
      ? { id: "camp1", boundary: BOUNDARY, heatConfig: null }
      : opts.campaign;
  const prisma: any = {
    canvassCampaign: {
      findFirst: jest.fn(async () => campaign),
      update: jest.fn(async ({ data }: any) => ({ id: "camp1", ...data })),
    },
    canvassHeatRun: {
      findUnique: jest.fn(async () => opts.existingRun ?? null),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async ({ data }: any) => ({ id: "run1", computedAt: new Date("2026-07-19T00:00:00Z"), ...data })),
    },
    canvassHeatCell: { createMany: jest.fn(async () => ({ count: 1 })) },
    pollQuestion: { findFirst: jest.fn(async () => ({ id: "q-id-1" })) },
    doorKnock: { findFirst: jest.fn(async () => null) },
    disposition: { findFirst: jest.fn(async () => null) },
    $queryRawUnsafe: jest.fn(async (sql: string) => {
      if (sql.includes("dataset_meta")) return [{ v: "2026-07-19" }];
      if (sql.includes("geo.election")) return [{ id: "federal-2025" }];
      return [];
    }),
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const factors: any = {
    countSa1s: jest.fn(async () => opts.sa1Count ?? 3),
    extract: jest.fn(async () => opts.rows ?? [rawRow(), rawRow({ sa1Code: "20402", doors: 60 }), rawRow({ sa1Code: "20403", doors: 200 })]),
  };
  const geo: any = { unionSources: jest.fn(async () => BOUNDARY) };
  const queue: any = { enqueue: jest.fn(async () => undefined) };
  const svc = new HeatService(prisma, factors, geo, queue);
  return { svc, prisma, factors, geo, queue };
}

describe("HeatService.getForCampaign", () => {
  it("computes, persists (delete-and-insert in one tx) and returns the contract", async () => {
    const { svc, prisma, factors } = setup();
    const res = await svc.getForCampaign("t1", "camp1");
    expect(factors.extract).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", electionId: "federal-2025", fitIndicator: "seifa_irsd_decile" }),
    );
    expect(prisma.canvassHeatRun.deleteMany).toHaveBeenCalledWith({ where: { campaignId: "camp1" } });
    expect(prisma.canvassHeatCell.createMany).toHaveBeenCalled();
    expect(res.meta.campaignId).toBe("camp1");
    expect(res.meta.preset).toBe("coverage");
    expect(res.meta.stale).toBe(false);
    expect(res.cells).toHaveLength(3);
    expect(res.meta.election).toEqual({ id: "federal-2025", note: "election-day booths only" });
  });

  it("returns the cached run untouched when the inputs hash matches", async () => {
    // First compute to learn the hash the service derives.
    const first = setup();
    await first.svc.getForCampaign("t1", "camp1");
    const storedHash = first.prisma.canvassHeatRun.create.mock.calls[0][0].data.inputsHash;

    const { svc, prisma, factors } = setup({
      existingRun: {
        inputsHash: storedHash,
        preset: "coverage",
        weights: {},
        meta: { breaks: [], factorCoverage: {}, constantFactors: [], lowResolutionFactors: [], sa1Count: 1, weights: {} },
        computedAt: new Date(),
        cells: [{ sa1Code: "20401", score: 50, band: 3, subScores: {}, flags: [], available: [], coverageFraction: 1 }],
      },
    });
    const res = await svc.getForCampaign("t1", "camp1");
    expect(factors.extract).not.toHaveBeenCalled();
    expect(prisma.canvassHeatRun.create).not.toHaveBeenCalled();
    expect(res.meta.stale).toBe(false);
    expect(res.cells[0].sa1Code).toBe("20401");
  });

  it("queues the compute above the inline cap and serves the stale cache with queued:true", async () => {
    const { svc, queue } = setup({
      sa1Count: INLINE_SA1_CAP + 1,
      existingRun: {
        inputsHash: "stale-hash",
        preset: "coverage",
        weights: {},
        meta: { breaks: [], factorCoverage: {}, constantFactors: [], lowResolutionFactors: [], sa1Count: 1, weights: {} },
        computedAt: new Date(),
        cells: [],
      },
    });
    const res = await svc.getForCampaign("t1", "camp1");
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ queue: "heat-run", type: "heat.run.compute", payload: { tenantId: "t1", campaignId: "camp1" } }),
    );
    expect(res.meta.stale).toBe(true);
    expect(res.meta.queued).toBe(true);
  });

  it("202s (HEAT_QUEUED) on a large boundary with no cache to serve", async () => {
    const { svc } = setup({ sa1Count: INLINE_SA1_CAP + 1 });
    await expect(svc.getForCampaign("t1", "camp1")).rejects.toMatchObject({
      response: { error: { code: "HEAT_QUEUED" } },
    });
  });

  it("422s when the campaign has no boundary", async () => {
    const { svc } = setup({ campaign: { id: "camp1", boundary: null, heatConfig: null } });
    await expect(svc.getForCampaign("t1", "camp1")).rejects.toMatchObject({
      response: { error: { code: "NO_BOUNDARY" } },
    });
  });

  it("resolves the campaign pollRef's questionCode to a questionId for extraction", async () => {
    const { svc, factors, prisma } = setup({
      campaign: {
        id: "camp1",
        boundary: BOUNDARY,
        heatConfig: {
          preset: "persuasion",
          pollRef: { pollId: "p1", questionCode: "C5", responseLabel: "NET Support" },
        },
      },
    });
    await svc.getForCampaign("t1", "camp1");
    expect(prisma.pollQuestion.findFirst).toHaveBeenCalledWith({
      where: { pollId: "p1", code: "C5" },
      select: { id: true },
    });
    expect(factors.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        poll: { pollId: "p1", questionId: "q-id-1", responseLabel: "NET Support", geoKind: "sed_upper" },
      }),
    );
  });
});

describe("HeatService.preview", () => {
  it("unions the sources and scores without persisting", async () => {
    const { svc, geo, prisma } = setup();
    const res = await svc.preview("t1", [{ kind: "division", type: "sed", code: "X" } as never]);
    expect(geo.unionSources).toHaveBeenCalled();
    expect(prisma.canvassHeatRun.create).not.toHaveBeenCalled();
    expect(res.meta.campaignId).toBeNull();
    expect(res.cells.length).toBeGreaterThan(0);
  });

  it("422s over the preview cap with the SA1 count in the message", async () => {
    const { svc } = setup({ sa1Count: PREVIEW_SA1_CAP + 1 });
    await expect(svc.preview("t1", [{ kind: "division" } as never])).rejects.toMatchObject({
      response: { error: { code: "PREVIEW_TOO_LARGE" } },
    });
  });

  it("422s on an empty selection", async () => {
    const { svc } = setup();
    await expect(svc.preview("t1", [])).rejects.toMatchObject({
      response: { error: { code: "NO_SOURCES" } },
    });
  });
});

describe("HeatService.setConfig + refresh + worker entry", () => {
  it("persists the config then recomputes through the standard path", async () => {
    const { svc, prisma } = setup();
    const res = await svc.setConfig("t1", "camp1", { preset: "gotv" });
    expect(prisma.canvassCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "camp1" }, data: { heatConfig: { preset: "gotv" } } }),
    );
    expect(res.meta.campaignId).toBe("camp1");
  });

  it("refresh recomputes inline regardless of an existing fresh hash", async () => {
    const { svc, factors } = setup();
    await svc.refresh("t1", "camp1");
    expect(factors.extract).toHaveBeenCalled();
  });

  it("the worker entry swallows a vanished campaign", async () => {
    const { svc } = setup({ campaign: null });
    expect(await svc.processHeatJob({ tenantId: "t1", campaignId: "gone" })).toBeNull();
  });

  it("day-truncates the tenant watermark so per-knock churn can't thrash the cache", async () => {
    const { svc, prisma } = setup();
    prisma.doorKnock.findFirst.mockResolvedValue({ createdAt: new Date("2026-07-19T14:33:21Z") });
    prisma.disposition.findFirst.mockResolvedValue({ createdAt: new Date("2026-07-19T09:10:00Z") });
    await svc.getForCampaign("t1", "camp1");
    const hash1 = prisma.canvassHeatRun.create.mock.calls[0][0].data.inputsHash;

    const again = setup();
    again.prisma.doorKnock.findFirst.mockResolvedValue({ createdAt: new Date("2026-07-19T23:59:59Z") });
    again.prisma.disposition.findFirst.mockResolvedValue({ createdAt: new Date("2026-07-19T01:00:00Z") });
    await again.svc.getForCampaign("t1", "camp1");
    const hash2 = again.prisma.canvassHeatRun.create.mock.calls[0][0].data.inputsHash;
    expect(hash2).toBe(hash1); // same day → same watermark → same hash
  });
});
