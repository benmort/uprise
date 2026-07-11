import {
  StateMpSyncService,
  STATE_CHAMBERS,
  normElectorate,
  qidFromUri,
  membersQuery,
} from "./state-mp-sync.service";

describe("state-mp pure helpers", () => {
  it("normElectorate strips layer prefixes/suffixes and normalises", () => {
    expect(normElectorate("Electoral district of Bellarine")).toBe("bellarine");
    expect(normElectorate("Division of Kew")).toBe("kew");
    expect(normElectorate("Northern Victoria Region")).toBe("northern victoria");
    expect(normElectorate("  Shepparton  ")).toBe("shepparton");
  });

  it("qidFromUri extracts the QID, else null", () => {
    expect(qidFromUri("http://www.wikidata.org/entity/Q42")).toBe("Q42");
    expect(qidFromUri("not-a-uri")).toBeNull();
  });

  it("membersQuery targets the position + district + current-member filters", () => {
    const q = membersQuery("Q123");
    expect(q).toContain("wd:Q123");
    expect(q).toContain("pq:P768"); // electoral district
    expect(q).toContain("P570"); // exclude deceased
  });

  it("STATE_CHAMBERS is the 10 districted chambers (state-wide LCs omitted)", () => {
    expect(STATE_CHAMBERS).toHaveLength(10);
    // Type guarantees geoKind ∈ {sed_lower, sed_upper} — state-wide chamber_electorate LCs are absent.
    expect(STATE_CHAMBERS.every((c) => c.geoKind === "sed_lower" || c.geoKind === "sed_upper")).toBe(true);
    expect(STATE_CHAMBERS.filter((c) => c.chamber === "LOWER")).toHaveLength(8);
    expect(STATE_CHAMBERS.filter((c) => c.chamber === "UPPER")).toHaveLength(2);
  });
});

describe("StateMpSyncService.run", () => {
  const prismaMock = () => ({
    civicSyncRun: { create: jest.fn(async () => ({ id: "r1" })), update: jest.fn(async () => ({})) },
    politician: { upsert: jest.fn(async () => ({})) },
    // Only Victoria has a geo row (Bellarine); everything else resolves to nothing.
    $queryRawUnsafe: jest.fn(async (_sql: string, state: string) =>
      state === "Victoria" ? [{ code: "vic-bellarine", name: "Bellarine" }] : [],
    ),
  });

  const wikidataMock = () => ({
    select: jest.fn(async (q: string) =>
      q.includes("Q18534408") // VIC Legislative Assembly
        ? [
            { person: "http://www.wikidata.org/entity/Q1", personLabel: "Alice", districtLabel: "Bellarine", partyLabel: "Labor" },
            { person: "http://www.wikidata.org/entity/Q2", personLabel: "Bob", districtLabel: "Nowhere", partyLabel: "Liberal" },
          ]
        : [],
    ),
  });

  it("upserts members on wikidataId, counts unmatched, stamps source=wikidata + succeeded", async () => {
    const prisma = prismaMock();
    const wd = wikidataMock();
    const summary = await new StateMpSyncService(prisma as never, wd as never).run();

    expect(summary).toEqual({ politicians: 2, unmatched: 1 }); // Bellarine matches, Nowhere doesn't
    expect(prisma.civicSyncRun.create).toHaveBeenCalledWith({ data: { source: "wikidata" } });
    expect(prisma.politician.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { wikidataId: "Q1" }, create: expect.objectContaining({ geoCode: "vic-bellarine", house: null }) }),
    );
    expect(prisma.politician.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { wikidataId: "Q2" }, create: expect.objectContaining({ geoCode: null }) }),
    );
    expect(prisma.civicSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "succeeded", politicians: 2, unmatched: 1 }) }),
    );
  });

  it("marks the run failed and rethrows when Wikidata errors", async () => {
    const prisma = prismaMock();
    const wd = { select: jest.fn(async () => { throw new Error("boom"); }) };
    await expect(new StateMpSyncService(prisma as never, wd as never).run()).rejects.toThrow("boom");
    expect(prisma.civicSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }),
    );
  });
});
