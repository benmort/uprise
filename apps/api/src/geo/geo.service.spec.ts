import { GeoService } from "./geo.service";

/**
 * Focused unit tests for the vector-tile generator. The DB is mocked (the SQL is
 * exercised against a real PostGIS elsewhere); these assert the query shape, the
 * tile bbox maths, the simplify-tolerance branch, validation, and that the
 * geojson-vt + vt-pbf encode actually produces MVT bytes for intersecting features.
 */
describe("GeoService.tile", () => {
  const make = (rows: Array<{ code: string; name: string | null; geojson: string }> = []) => {
    const $queryRawUnsafe = jest.fn().mockResolvedValue(rows);
    const svc = new GeoService({ $queryRawUnsafe } as never);
    return { svc, $queryRawUnsafe };
  };
  const squarePoly = (x: number, y: number, d = 1) =>
    JSON.stringify({
      type: "Polygon",
      coordinates: [[[x, y], [x, y + d], [x + d, y + d], [x + d, y], [x, y]]],
    });

  it("encodes intersecting features into non-empty MVT bytes with the right query shape", async () => {
    const { svc, $queryRawUnsafe } = make([
      { code: "206061516", name: "South Yarra", geojson: squarePoly(0, 0) },
    ]);
    const buf = await svc.tile("sa2", 0, 0, 0);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    const [sql, w, s, e, n] = $queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("ST_AsGeoJSON");
    expect(sql).toContain("ST_MakeEnvelope");
    expect(sql).toContain("geo.sa2");
    // Tile (0,0,0) is the whole Web-Mercator world.
    expect(w).toBeCloseTo(-180);
    expect(e).toBeCloseTo(180);
    expect(s).toBeCloseTo(-85.051, 2);
    expect(n).toBeCloseTo(85.051, 2);
  });

  it("returns empty bytes when the tile has no features", async () => {
    const { svc } = make([]);
    const buf = await svc.tile("mb", 5, 3, 3);
    expect(buf.length).toBe(0);
  });

  it("simplifies geometry at low zoom but not at high zoom", async () => {
    const low = make([]);
    await low.svc.tile("sa2", 2, 1, 1);
    expect(low.$queryRawUnsafe.mock.calls[0][0]).toContain("ST_SimplifyPreserveTopology");

    const high = make([]);
    await high.svc.tile("sa2", 20, 0, 0);
    expect(high.$queryRawUnsafe.mock.calls[0][0]).toContain("ST_AsGeoJSON(geom)");
    expect(high.$queryRawUnsafe.mock.calls[0][0]).not.toContain("ST_SimplifyPreserveTopology");
  });

  it("resolves every supported layer to its table", async () => {
    for (const [layer, table] of [
      ["mb", "geo.meshblock"],
      ["sa1", "geo.sa1"],
      ["ced", "geo.ced"],
      ["state", "geo.state"],
    ] as const) {
      const { svc, $queryRawUnsafe } = make([]);
      await svc.tile(layer, 1, 0, 0);
      expect($queryRawUnsafe.mock.calls[0][0]).toContain(table);
    }
  });

  it("rejects an unknown layer", async () => {
    const { svc } = make();
    await expect(svc.tile("bogus", 0, 0, 0)).rejects.toThrow();
  });

  it("rejects non-integer or out-of-range tile coordinates", async () => {
    const { svc } = make();
    await expect(svc.tile("sa2", 1.5, 0, 0)).rejects.toThrow();
    await expect(svc.tile("sa2", -1, 0, 0)).rejects.toThrow();
    await expect(svc.tile("sa2", 3, 99, 0)).rejects.toThrow(); // x >= 2^3
    await expect(svc.tile("sa2", 3, 0, 8)).rejects.toThrow(); // y >= 2^3
  });
});
