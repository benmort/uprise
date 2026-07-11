import {
  PoliticianImageSyncService,
  chunk,
  federalHouseImageQuery,
  statePeopleImageQuery,
} from "./politician-image-sync.service";

describe("statePeopleImageQuery", () => {
  it("builds a VALUES batch over the given QIDs", () => {
    const q = statePeopleImageQuery(["Q1", "Q2"]);
    expect(q).toContain("VALUES ?person { wd:Q1 wd:Q2 }");
    expect(q).toContain("?person wdt:P18 ?image");
  });
});

describe("federalHouseImageQuery", () => {
  it("filters to current holders of the House position and pulls district + image", () => {
    const q = federalHouseImageQuery();
    expect(q).toContain("wd:Q18912794");
    expect(q).toContain("pq:P768 ?district");
    expect(q).toContain("FILTER NOT EXISTS { ?ps pq:P582 ?end }");
    expect(q).toContain("?person wdt:P18 ?image");
  });
});

describe("chunk", () => {
  it("splits into groups of at most size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

type Row = { id: string; wikidataId?: string | null; electorate?: string | null; imageSourceRef?: string | null };

function svcWith(opts: {
  enabled?: boolean;
  state?: Row[];
  house?: Row[];
  senate?: number;
  stateImages?: Array<{ person: string; image: string }>;
  houseImages?: Array<{ districtLabel: string; image: string }>;
  mirror?: (ref: string, id: string) => unknown;
}) {
  const update = jest.fn(async () => ({}));
  const prisma = {
    civicSyncRun: { create: jest.fn(async () => ({ id: "run1" })), update: jest.fn(async () => ({})) },
    politician: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        where.wikidataId ? (opts.state ?? []) : (opts.house ?? []),
      ),
      count: jest.fn(async () => opts.senate ?? 0),
      update,
    },
  };
  const wikidata = {
    select: jest.fn(async (query: string) =>
      query.includes("VALUES") ? (opts.stateImages ?? []) : (opts.houseImages ?? []),
    ),
  };
  const commons = {
    enabled: opts.enabled ?? true,
    mirror: jest.fn(async (ref: string, id: string) =>
      opts.mirror
        ? opts.mirror(ref, id)
        : {
            imageUrl: `https://blob/${id}.jpg`,
            imageSourceUrl: "https://commons/File",
            imageCredit: "Someone",
            imageLicence: "CC BY 4.0",
            imageSourceRef: ref.replace(/.*FilePath\//, "").replace(/_/g, " "),
          },
    ),
  };
  return {
    svc: new PoliticianImageSyncService(prisma as never, wikidata as never, commons as never),
    prisma,
    wikidata,
    commons,
    update,
  };
}

describe("PoliticianImageSyncService.run", () => {
  it("refuses when Blob storage is not configured — no half-done sync", async () => {
    const { svc, wikidata } = svcWith({ enabled: false });
    await expect(svc.run()).rejects.toThrow(/Blob storage is not configured/);
    expect(wikidata.select).not.toHaveBeenCalled();
  });

  it("matches state MPs by QID and updates each with its mirrored photo", async () => {
    const { svc, update } = svcWith({
      state: [{ id: "s1", wikidataId: "Q10" }],
      stateImages: [{ person: "http://www.wikidata.org/entity/Q10", image: "Special:FilePath/Jane_Doe.jpg" }],
    });
    const out = await svc.run();
    expect(out.updated).toBe(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ imageUrl: "https://blob/s1.jpg" }) }),
    );
  });

  it("matches federal House by electorate, not by name", async () => {
    const { svc, update } = svcWith({
      house: [{ id: "h1", electorate: "Warringah" }],
      houseImages: [{ districtLabel: "Division of Warringah", image: "Special:FilePath/Zali.jpg" }],
    });
    const out = await svc.run();
    expect(out.updated).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "h1" } }));
  });

  it("counts a member with no free photo as unmatched, and does not update it", async () => {
    const { svc, update } = svcWith({
      state: [{ id: "s1", wikidataId: "Q10" }],
      stateImages: [], // Q10 has no P18
    });
    const out = await svc.run();
    expect(out.updated).toBe(0);
    expect(out.unmatched).toBe(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("skips an unchanged photo (same source filename) unless forced", async () => {
    const rows: Row[] = [{ id: "s1", wikidataId: "Q10", imageSourceRef: "Jane Doe.jpg" }];
    const images = [{ person: "http://www.wikidata.org/entity/Q10", image: "Special:FilePath/Jane_Doe.jpg" }];

    const unforced = svcWith({ state: rows, stateImages: images });
    const a = await unforced.svc.run();
    expect(a.skipped).toBe(1);
    expect(a.updated).toBe(0);
    expect(unforced.commons.mirror).not.toHaveBeenCalled();

    const forced = svcWith({ state: rows, stateImages: images });
    const b = await forced.svc.run({ force: true });
    expect(b.updated).toBe(1);
    expect(forced.commons.mirror).toHaveBeenCalled();
  });

  it("reports deferred senators without trying to photograph them", async () => {
    const { svc } = svcWith({ senate: 76 });
    const out = await svc.run();
    expect(out.senateDeferred).toBe(76);
    expect(out.updated).toBe(0);
  });

  it("records a failed sync run when a query throws", async () => {
    const { svc, prisma } = svcWith({ state: [{ id: "s1", wikidataId: "Q10" }] });
    prisma.politician.findMany.mockRejectedValueOnce(new Error("db down"));
    await expect(svc.run()).rejects.toThrow("db down");
    expect(prisma.civicSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }),
    );
  });
});
