import { DemographicsService } from "./demographics.service";

/**
 * The service is pure `$queryRawUnsafe` over geo.abs_*. The mock routes by a fragment of each
 * query's SQL so a single service call (which fires several queries) gets the right shape back.
 */
function svc(routes: Array<{ match: RegExp; rows: unknown[] }>) {
  const $queryRawUnsafe = jest.fn(async (sql: string) => {
    const hit = routes.find((r) => r.match.test(sql));
    return hit ? hit.rows : [];
  });
  return { service: new DemographicsService({ $queryRawUnsafe } as never), $queryRawUnsafe };
}

const INDICATOR = { key: "median_age", name: "Median age", unit: "years", format: "number", polarity: "neutral" };
const SCALE = [{ regions: 2600, min: 20, max: 55, breaks: [32, 36, 40, 45] }];

describe("DemographicsService", () => {
  it("listIndicators returns the catalogue ordered by category", async () => {
    const { service, $queryRawUnsafe } = svc([{ match: /FROM geo\.abs_indicator/, rows: [INDICATOR] }]);
    const rows = await service.listIndicators();
    expect(rows).toEqual([INDICATOR]);
    expect($queryRawUnsafe.mock.calls[0][0]).toMatch(/ORDER BY category, sort, name/);
  });

  describe("choropleth", () => {
    it("rejects an unknown level before querying", async () => {
      const { service, $queryRawUnsafe } = svc([]);
      await expect(service.choropleth("bogus", "median_age")).rejects.toThrow();
      expect($queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("throws when the indicator doesn't exist", async () => {
      const { service } = svc([{ match: /abs_indicator WHERE key/, rows: [] }]);
      await expect(service.choropleth("sa2", "nope")).rejects.toThrow();
    });

    it("returns breaks + {code,value} rows for a client-join level (sa2)", async () => {
      const { service } = svc([
        { match: /abs_indicator WHERE key/, rows: [INDICATOR] },
        { match: /percentile_cont/, rows: SCALE },
        { match: /SELECT code, value/, rows: [{ code: "201011001", value: 38 }] },
      ]);
      const res = await service.choropleth("sa2", "median_age");
      expect(res).toMatchObject({ level: "sa2", min: 20, max: 55, breaks: [32, 36, 40, 45], regions: 2600 });
      expect(res.indicator).toEqual(INDICATOR);
      expect(res.rows).toEqual([{ code: "201011001", value: 38 }]);
    });

    it("OMITS rows for the big tile-baked levels (sa1, mb)", async () => {
      const routes = [
        { match: /abs_indicator WHERE key/, rows: [INDICATOR] },
        { match: /percentile_cont/, rows: SCALE },
        { match: /SELECT code, value/, rows: [{ code: "x", value: 1 }] },
      ];
      for (const level of ["sa1", "mb"]) {
        const { service } = svc(routes);
        const res = await service.choropleth(level, "median_age");
        expect(res.rows).toBeUndefined(); // painted from the value baked on the tile
        expect(res.breaks).toEqual([32, 36, 40, 45]); // scale still returned
      }
    });

    it("defaults an empty scale to no breaks (loader unrun)", async () => {
      const { service } = svc([
        { match: /abs_indicator WHERE key/, rows: [INDICATOR] },
        { match: /percentile_cont/, rows: [{ regions: 0, min: null, max: null, breaks: null }] },
      ]);
      const res = await service.choropleth("sa2", "median_age");
      expect(res.breaks).toEqual([]);
      expect(res.regions).toBe(0);
    });
  });

  describe("regionProfile", () => {
    it("reads the meshblock table + code column for the mb level", async () => {
      const { service, $queryRawUnsafe } = svc([
        { match: /FROM geo\.meshblock WHERE mb_code/, rows: [{ name: "MB 123" }] },
        { match: /JOIN geo\.abs_indicator/, rows: [{ key: "median_age", name: "Median age", category: "demographic", unit: "years", format: "number", polarity: "neutral", value: 40 }] },
      ]);
      const res = await service.regionProfile("mb", "20604112700");
      expect(res).toMatchObject({ level: "mb", code: "20604112700", name: "MB 123" });
      expect(res.values[0]).toMatchObject({ key: "median_age", value: 40 });
      // The meta query used the meshblock table + mb_code column (validated map, not the raw level).
      expect($queryRawUnsafe.mock.calls[0][0]).toContain("geo.meshblock");
      expect($queryRawUnsafe.mock.calls[0][0]).toContain("mb_code");
    });

    it("falls back to the code as the name when the region has none", async () => {
      const { service } = svc([
        { match: /FROM geo\.sa2 WHERE code/, rows: [] },
        { match: /JOIN geo\.abs_indicator/, rows: [] },
      ]);
      const res = await service.regionProfile("sa2", "201011001");
      expect(res.name).toBe("201011001");
      expect(res.values).toEqual([]);
    });

    it("rejects an unknown level", async () => {
      const { service } = svc([]);
      await expect(service.regionProfile("planet", "x")).rejects.toThrow();
    });
  });

  it("status summarises indicator/level coverage + last ingest", async () => {
    const { service } = svc([
      { match: /abs_indicator/, rows: [{ indicators: 22, values: 500000, levels: ["sa2", "sa3", "sa4"], lastIngested: new Date("2026-07-13T00:00:00Z") }] },
    ]);
    const res = await service.status();
    expect(res).toMatchObject({ indicators: 22, values: 500000, levels: ["sa2", "sa3", "sa4"] });
    expect(res.lastIngested).toBeInstanceOf(Date);
  });
});
