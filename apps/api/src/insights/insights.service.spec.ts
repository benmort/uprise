import { InsightsService } from "./insights.service";
import { ApiHttpException } from "../common/http/api-response";

// Two-response, three-column question fixture (Total, one region, one non-geo col).
const EST = (over: Partial<Record<string, unknown>>) => ({
  responseLabel: "NET Support",
  responseOrdinal: 0,
  isNet: true,
  breakdownGroup: "Total",
  breakdownValue: "Total",
  breakdownOrdinal: 1,
  geoKind: null,
  geoCode: null,
  percent: 40,
  baseN: 4003,
  reportable: true,
  ...over,
});

function svcWith(prisma: Record<string, unknown>) {
  return new InsightsService(prisma as never);
}

describe("InsightsService", () => {
  it("listPolls maps rows and flags shared (global) polls", async () => {
    const prisma = {
      poll: {
        findMany: jest.fn(async () => [
          { id: "p1", slug: "s", title: "T", source: "YouGov", commissioner: "CT", sampleSize: 4003, fieldworkStart: null, fieldworkEnd: null, weighted: true, geoScope: "VIC", status: "PUBLISHED", attribution: "a", tenantId: "t1", lastIngestedAt: null, _count: { questions: 5 } },
          { id: "p2", slug: "g", title: "G", source: "YouGov", commissioner: null, sampleSize: null, fieldworkStart: null, fieldworkEnd: null, weighted: true, geoScope: null, status: "PUBLISHED", attribution: null, tenantId: null, lastIngestedAt: null, _count: { questions: 2 } },
        ]),
      },
    };
    const res = await svcWith(prisma).listPolls("t1");
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ id: "p1", questionCount: 5, shared: false });
    expect(res[1].shared).toBe(true);
    // Visibility gate: own OR global.
    expect((prisma.poll.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ OR: [{ tenantId: "t1" }, { tenantId: null }] });
  });

  it("getPoll throws when not visible", async () => {
    const prisma = { poll: { findFirst: jest.fn(async () => null) } };
    await expect(svcWith(prisma).getPoll("t1", "x")).rejects.toBeInstanceOf(ApiHttpException);
  });

  it("getPollQuestion pivots estimates into ordered groups + response rows", async () => {
    const estimates = [
      EST({ responseOrdinal: 0, responseLabel: "NET Support", breakdownOrdinal: 1, breakdownGroup: "Total", breakdownValue: "Total", percent: 40 }),
      EST({ responseOrdinal: 0, responseLabel: "NET Support", breakdownOrdinal: 40, breakdownGroup: "VIC Upper House Electorate", breakdownValue: "Northern Metropolitan", geoKind: "sed_upper", geoCode: "2-LC-NM", percent: 60 }),
      EST({ responseOrdinal: 1, responseLabel: "NET Oppose", breakdownOrdinal: 1, breakdownGroup: "Total", breakdownValue: "Total", isNet: true, percent: 32 }),
      EST({ responseOrdinal: 1, responseLabel: "NET Oppose", breakdownOrdinal: 40, breakdownGroup: "VIC Upper House Electorate", breakdownValue: "Northern Metropolitan", geoKind: "sed_upper", geoCode: "2-LC-NM", isNet: true, percent: 20 }),
    ];
    const prisma = {
      pollQuestion: {
        findFirst: jest.fn(async () => ({ code: "C5", title: "Treaty", category: "treaty", hasNet: true, poll: { id: "p1", title: "T", attribution: "a" }, estimates })),
      },
    };
    const res = await svcWith(prisma).getPollQuestion("t1", "p1", "C5");
    expect(res.groups.map((g) => g.group)).toEqual(["Total", "VIC Upper House Electorate"]);
    expect(res.groups[1].columns[0]).toMatchObject({ value: "Northern Metropolitan", geoKind: "sed_upper", ordinal: 40 });
    expect(res.responses).toHaveLength(2);
    expect(res.responses[0].cells[40]).toBe(60); // NET Support in Northern Metro
  });

  it("getChoropleth returns only geographic cells for a response", async () => {
    const prisma = {
      pollQuestion: { findFirst: jest.fn(async () => ({ id: "q1", code: "C5", title: "Treaty" })) },
      pollEstimate: {
        findMany: jest.fn(async () => [
          EST({ breakdownGroup: "VIC Upper House Electorate", breakdownValue: "Northern Metropolitan", geoKind: "sed_upper", geoCode: "2-LC-NM", percent: 60 }),
        ]),
      },
    };
    const res = await svcWith(prisma).getChoropleth("t1", "p1", "C5", "NET Support");
    expect(res.cells).toHaveLength(1);
    expect(res.cells[0]).toMatchObject({ geoCode: "2-LC-NM", percent: 60 });
    expect((prisma.pollEstimate.findMany as jest.Mock).mock.calls[0][0].where.geoKind).toEqual({ not: null });
  });

  it("getRegionPolling pairs region cells with the statewide Total", async () => {
    const prisma = {
      pollEstimate: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { questionId: "q1", responseLabel: "NET Support", responseOrdinal: 0, isNet: true, percent: 60, poll: { id: "p1", title: "T", attribution: "a" }, question: { id: "q1", code: "C5", title: "Treaty", ordinal: 3 } },
          ])
          .mockResolvedValueOnce([{ questionId: "q1", responseLabel: "NET Support", percent: 40 }]),
      },
    };
    const res = await svcWith(prisma).getRegionPolling("t1", "sed_upper", "2-LC-NM");
    expect(res.polls[0].questions[0].rows[0]).toMatchObject({ responseLabel: "NET Support", regionPercent: 60, totalPercent: 40 });
  });

  it("getRegionPolling returns empty for a region with no estimates", async () => {
    const prisma = { pollEstimate: { findMany: jest.fn(async () => []) } };
    const res = await svcWith(prisma).getRegionPolling("t1", "sed_lower", "nope");
    expect(res.polls).toEqual([]);
  });

  it("resolvePollThresholdToGeoCodes filters by the comparison op", async () => {
    const prisma = {
      pollQuestion: { findFirst: jest.fn(async () => ({ id: "q1" })) },
      pollEstimate: {
        findMany: jest.fn(async () => [
          { geoCode: "A", percent: 60 },
          { geoCode: "B", percent: 30 },
          { geoCode: "C", percent: 50 },
        ]),
      },
    };
    const codes = await svcWith(prisma).resolvePollThresholdToGeoCodes("t1", {
      pollId: "p1",
      questionCode: "C5",
      response: "NET Support",
      op: ">",
      value: 45,
      geoKind: "sed_upper",
    });
    expect(codes.sort()).toEqual(["A", "C"]);
  });
});
