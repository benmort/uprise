import * as XLSX from "xlsx";
import {
  InsightsIngestService,
  parsePollWorkbook,
  type RegionResolver,
} from "./insights-ingest.service";

/** A resolver that maps only the two VIC regions used in the fixtures. */
const resolver: RegionResolver = (name) =>
  name === "Northern Metropolitan"
    ? { geoKind: "sed_upper", geoCode: "2-LC-NORTHERN-METROPOLITAN" }
    : name === "Eastern Victoria"
      ? { geoKind: "sed_upper", geoCode: "2-LC-EASTERN-VICTORIA" }
      : null;

/** Build a one-block crosstab sheet in the source's shape (title / group / subcol /
 *  responses / Column n), with merged group spans. */
function fixtureWorkbook(): XLSX.WorkBook {
  const aoa: (string | number | null)[][] = [
    ["B1. Test primary vote", null, null, null, null, null, null, null, null],
    // group-header row — group labels sit at the merge start; spans set below.
    [null, null, "Gender", null, null, "VIC Upper House Electorate", null, "Region", null],
    ["Column %", "Total", "Male", "Female", null, "Northern Metropolitan", "Eastern Victoria", "Inner Metropolitan", "Rural"],
    ["Coalition", 26, 29, 22, null, 18, 35, 30, 40],
    ["NET Support", 40, 45, 35, null, 60, 32, 50, 30],
    ["Column n", 4003, 1755, 2237, null, 569, 497, 800, 50],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!merges"] = [
    { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } }, // Gender → Male, Female
    { s: { r: 1, c: 5 }, e: { r: 1, c: 6 } }, // VIC Upper House → the 2 regions
    { s: { r: 1, c: 7 }, e: { r: 1, c: 8 } }, // Region → Inner Metropolitan, Rural
  ];
  return { SheetNames: ["Polling background B1-C3"], Sheets: { "Polling background B1-C3": sheet } };
}

describe("parsePollWorkbook", () => {
  const [q] = parsePollWorkbook(fixtureWorkbook(), resolver);

  it("extracts the question code + title + net flag", () => {
    expect(q.code).toBe("B1");
    expect(q.title).toContain("Test primary vote");
    expect(q.category).toBe("polling_background");
    expect(q.hasNet).toBe(true);
  });

  it("resolves VIC Upper House columns to a geo.sed_upper code (id-only ref)", () => {
    const nm = q.estimates.find(
      (e) => e.responseLabel === "NET Support" && e.breakdownValue === "Northern Metropolitan",
    );
    expect(nm).toMatchObject({
      breakdownGroup: "VIC Upper House Electorate",
      geoKind: "sed_upper",
      geoCode: "2-LC-NORTHERN-METROPOLITAN",
      percent: 60,
      isNet: true,
    });
  });

  it("leaves the non-geo Region band unmapped", () => {
    const inner = q.estimates.find((e) => e.breakdownValue === "Inner Metropolitan");
    expect(inner?.breakdownGroup).toBe("Region");
    expect(inner?.geoKind).toBeNull();
    expect(inner?.geoCode).toBeNull();
  });

  it("stamps per-column base n and suppresses small bases", () => {
    const male = q.estimates.find((e) => e.responseLabel === "Coalition" && e.breakdownValue === "Male");
    expect(male?.baseN).toBe(1755);
    expect(male?.reportable).toBe(true);
    const rural = q.estimates.find((e) => e.breakdownValue === "Rural");
    expect(rural?.baseN).toBe(50);
    expect(rural?.reportable).toBe(false); // below the 100 threshold
  });

  it("de-duplicates recurring question codes and skips section headers", () => {
    // Two B1 blocks + a bare 'C3.' header row with no crosstab.
    const aoa: (string | number | null)[][] = [
      ["B1. First", null, null],
      ["Column %", "Total", "Male"],
      ["Yes", 50, 55],
      ["Column n", 100, 40],
      ["B1. Second (same code)", null, null],
      ["Column %", "Total", "Male"],
      ["Yes", 60, 65],
      ["Column n", 100, 40],
      ["C3. Section header with no table", null, null],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb: XLSX.WorkBook = {
      SheetNames: ["Polling background B1-C3"],
      Sheets: { "Polling background B1-C3": sheet },
    };
    const qs = parsePollWorkbook(wb, resolver);
    expect(qs.map((x) => x.code)).toEqual(["B1", "B1-2"]); // header skipped, dup suffixed
  });
});

describe("InsightsIngestService.ingestVicTreatyPoll", () => {
  function makePrisma() {
    const created = { questions: [] as unknown[], estimateBatches: [] as unknown[] };
    const tx = {
      pollEstimate: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        createMany: jest.fn(async ({ data }: { data: unknown[] }) => {
          created.estimateBatches.push(data);
          return { count: data.length };
        }),
      },
      pollQuestion: {
        deleteMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: { data: unknown }) => {
          created.questions.push(data);
          return { id: `q${created.questions.length}` };
        }),
      },
      poll: {
        update: jest.fn(async () => ({})),
        create: jest.fn(async () => ({ id: "poll1" })),
      },
    };
    const prisma = {
      $queryRawUnsafe: jest.fn(async () => [{ code: "2-LC-NORTHERN-METROPOLITAN", name: "Northern Metropolitan" }]),
      tenant: { findUnique: jest.fn(async () => ({ id: "t1" })) },
      poll: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    return { prisma, tx, created };
  }

  it("resolves the tenant, writes questions + estimates, and emits the outbox event", async () => {
    const { prisma, tx } = makePrisma();
    const outbox = { append: jest.fn(async () => undefined) };
    const svc = new InsightsIngestService(prisma as never, outbox as never);
    const res = await svc.ingestVicTreatyPoll({ workbook: fixtureWorkbook(), keyFindings: [{ heading: "h", body: "b" }] });

    expect(res).toMatchObject({ pollId: "poll1", questionCount: 1 });
    expect(res.estimateCount).toBeGreaterThan(0);
    expect(tx.poll.create).toHaveBeenCalled();
    expect(tx.pollEstimate.createMany).toHaveBeenCalled();
    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "insights.poll.ingested", tenantId: "t1", aggregateId: "poll1" }),
    );
  });

  it("throws when the tenant is missing", async () => {
    const { prisma } = makePrisma();
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);
    const svc = new InsightsIngestService(prisma as never, { append: jest.fn() } as never);
    await expect(svc.ingestVicTreatyPoll({ workbook: fixtureWorkbook() })).rejects.toThrow(/not found/);
  });
});
