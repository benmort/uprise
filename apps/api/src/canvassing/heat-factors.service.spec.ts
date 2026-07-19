import { HeatFactorsService } from "./heat-factors.service";

function setup(rows: Array<Record<string, unknown>> = []) {
  const prisma: any = { $queryRawUnsafe: jest.fn(async () => rows) };
  const svc = new HeatFactorsService(prisma);
  return { svc, prisma };
}

const BOUNDARY = { type: "MultiPolygon", coordinates: [] };

describe("HeatFactorsService", () => {
  it("passes boundary, tenant, indicator, poll, election and aligned metric keys as parameters", async () => {
    const { svc, prisma } = setup([]);
    await svc.extract({
      tenantId: "t1",
      boundary: BOUNDARY,
      fitIndicator: "seifa_irsd_decile",
      communityIndicator: "cald_lote_share",
      poll: { pollId: "p1", questionId: "q1", responseLabel: "NET Support", geoKind: "sed_upper" },
      electionId: "federal-2025",
      alignedPartyCodes: ["ALP", "GRN"],
    });
    const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("geo.meshblock");
    expect(sql).toContain("ST_PointOnSurface");
    expect(sql).toContain("se.sed_upper_code"); // allowlisted column interpolation
    expect(params[0]).toBe(JSON.stringify(BOUNDARY));
    expect(params[1]).toBe("t1");
    expect(params[2]).toBe("seifa_irsd_decile");
    expect(params.slice(3, 7)).toEqual(["p1", "q1", "NET Support", "sed_upper"]);
    expect(params[7]).toBe("federal-2025");
    expect(params[8]).toEqual(["fp_share:ALP", "fp_share:GRN"]);
    expect(params[9]).toBe("cald_lote_share");
  });

  it("refuses an unlisted poll geoKind (never interpolates caller input)", async () => {
    const { svc } = setup();
    await expect(
      svc.extract({
        tenantId: "t1",
        boundary: BOUNDARY,
        fitIndicator: "seifa_irsd_decile",
      communityIndicator: "cald_lote_share",
        poll: { pollId: "p1", questionId: "q1", responseLabel: "x", geoKind: "lga; DROP TABLE" },
        electionId: null,
        alignedPartyCodes: [],
      }),
    ).rejects.toThrow(/Unsupported poll geoKind/);
  });

  it("coerces raw rows to typed numbers with nulls preserved", async () => {
    const { svc } = setup([
      {
        sa1Code: "20401",
        doors: "120",
        occupiedMbs: "6",
        areaKm2: "0.5",
        fitValue: null,
        pollPercent: "22.5",
        pollIsNet: false,
        electorateMajorityShare: "0.95",
        competitiveness: null,
        attributedVotes: null,
        alignedFpShare: null,
        referendumYesPct: "48.2",
        contacts: "3",
        supporters: "1",
        dispositioned: "2",
        knockDecay: "0.7",
        coverageFraction: "1",
      },
    ]);
    const rows = await svc.extract({
      tenantId: "t1",
      boundary: BOUNDARY,
      fitIndicator: "seifa_irsd_decile",
      communityIndicator: "cald_lote_share",
      poll: null,
      electionId: null,
      alignedPartyCodes: [],
    });
    expect(rows).toEqual([
      expect.objectContaining({
        sa1Code: "20401",
        doors: 120,
        occupiedMbs: 6,
        areaKm2: 0.5,
        fitValue: null,
        pollPercent: 22.5,
        pollIsNet: false,
        electorateMajorityShare: 0.95,
        competitiveness: null,
        attributedVotes: null,
        referendumYesPct: 48.2,
        contacts: 3,
        supporters: 1,
        dispositioned: 2,
        knockDecay: 0.7,
        coverageFraction: 1,
      }),
    ]);
  });

  it("countSa1s returns the distinct member-SA1 count", async () => {
    const { svc, prisma } = setup([{ n: 412 }]);
    expect(await svc.countSa1s(BOUNDARY)).toBe(412);
    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain("COUNT(DISTINCT mb.sa1_code)");
  });
});
