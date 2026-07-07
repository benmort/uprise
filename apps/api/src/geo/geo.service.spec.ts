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

/**
 * The "Other Territories" split: Christmas Is./Cocos/Jervis Bay/Norfolk Is. are one
 * ASGS SA4 (901) but distinct SA3s (90101–90104), so their state code is the SA3
 * code. These assert the state-derivation (contactCount join + containment parent)
 * splits OT out while leaving the eight states + NT/ACT on their leading digit.
 */
describe("GeoService — Other Territories state split", () => {
  it("stateDetail joins OT contacts on the SA3 code, not the leading digit", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ code: "90101", name: "Christmas Island", geojson: '{"type":"MultiPolygon","coordinates":[]}' }])
      .mockResolvedValueOnce([{ addressCount: 12, contactCount: 3 }]);
    const svc = new GeoService({ $queryRawUnsafe } as never);
    const res = await svc.stateDetail("tenant-1", "90101");
    const countsSql = $queryRawUnsafe.mock.calls[1][0] as string;
    expect(countsSql).toContain("CASE WHEN left(ar.sa4_code, 1) = '9' THEN ar.sa3_code");
    expect(res).toMatchObject({ code: "90101", name: "Christmas Island", addressCount: 12, contactCount: 3, withoutContacts: 9 });
  });

  // Every containment level that carries an SA3 resolves its state parent to the
  // OT territory (SA3 code) rather than the vanished lumped "9" row.
  it.each([
    { kind: "sa3", code: "90101", join: [{ s4: "901", s4n: "Other Territories" }] },
    { kind: "sa2", code: "901011001", join: [{ s3: "90101", s3n: "Christmas Island", s4: "901", s4n: "Other Territories" }] },
    { kind: "sa1", code: "90101100101", join: [{ s2: "901011001", s2n: "Christmas Island", s3: "90101", s3n: "Christmas Island", s4: "901", s4n: "Other Territories" }] },
    {
      kind: "mb",
      code: "90101100101001",
      join: [{ sa4_code: "901", s4n: "Other Territories", sa3_code: "90101", s3n: "Christmas Island", sa2_code: "901011001", s2n: "Christmas Island", sa1_code: "90101100101", s1n: "Christmas Island", lga_code: null, lgan: null }],
    },
    {
      kind: "address",
      code: "GAOT0001",
      join: [{ sa4_code: "901", s4n: "Other Territories", sa3_code: "90101", s3n: "Christmas Island", sa2_code: "901011001", s2n: "Christmas Island", sa1_code: "90101100101", s1n: "Christmas Island", mb_code: "90101100101001", ced_code: null, cedn: null, sed_code: null, sedn: null, lga_code: null, lgan: null }],
    },
  ])("regionParents puts an OT $kind under its territory (SA3 code)", async ({ kind, code, join }) => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce(join)
      .mockResolvedValueOnce([{ name: "Christmas Island" }]);
    const svc = new GeoService({ $queryRawUnsafe } as never);
    const parents = await (svc as unknown as { regionParents: (k: string, c: string) => Promise<Array<{ kind: string; code: string; name: string }>> }).regionParents(kind, code);
    expect(parents[0]).toMatchObject({ kind: "state", code: "90101", name: "Christmas Island" });
  });

  it("regionParents keeps a mainland region under its single-digit state", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ s4: "101", s4n: "Sydney" }])
      .mockResolvedValueOnce([{ name: "New South Wales" }]);
    const svc = new GeoService({ $queryRawUnsafe } as never);
    const parents = await (svc as unknown as { regionParents: (k: string, c: string) => Promise<Array<{ kind: string; code: string; name: string }>> }).regionParents("sa3", "10102");
    expect(parents[0]).toMatchObject({ kind: "state", code: "1", name: "New South Wales" });
    // stateRef was queried with the leading digit, not the full SA3 code.
    expect($queryRawUnsafe.mock.calls[1][1]).toBe("1");
  });
});
