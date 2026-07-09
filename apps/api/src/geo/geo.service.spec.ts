import { GeoService, DIVISION_TYPES, TURF_DIVISION_TYPES } from "./geo.service";

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

  it("addresses(turfId) qualifies the canvass-schema Turf table (42P01 regression)", async () => {
    // Turf lives in the `canvass` schema; an unqualified "Turf" in the raw query threw
    // `relation "Turf" does not exist`, aborting cold-door materialisation so every cut
    // turf ended up with zero bucketed doors. The lookup MUST use canvass."Turf".
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ geometry: { type: "MultiPolygon", coordinates: [] } }])
      .mockResolvedValueOnce([{ gnafPid: "GA1", address: "1 St", lat: -33, lng: 151 }]);
    const svc = new GeoService({ $queryRawUnsafe } as never);
    const rows = await svc.addresses("tenant-1", { turfId: "turf-1", withoutContacts: true });
    const turfSql = $queryRawUnsafe.mock.calls[0][0] as string;
    expect(turfSql).toContain('canvass."Turf"');
    expect(turfSql).not.toMatch(/FROM\s+"Turf"/); // never the unqualified form
    expect(rows).toHaveLength(1);
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

/**
 * Chamber layers. `geo.sed` is the raw ABS layer; `sed_lower`/`sed_upper` are the derived
 * chamber-pure ones. The load-bearing asymmetry: a Victorian Legislative Council region is
 * exactly 11 Assembly districts (so it nests), while Tasmania's House of Assembly and
 * Legislative Council divisions CROSS-CUT each other (so they do not). That is encoded as
 * data via sed_lower.parent_upper_code — these tests pin both sides of it.
 */
describe("GeoService — chambers", () => {
  type Parents = (k: string, c: string) => Promise<Array<{ kind: string; code: string; name: string }>>;
  type Children = (
    k: string,
    c: string,
    r: { kind: string; code: string; name: string },
  ) => Promise<Array<{ kind: string; label: string; total: number }>>;
  const svcOf = ($queryRawUnsafe: jest.Mock) => new GeoService({ $queryRawUnsafe } as never);

  it("table() accepts every division layer and rejects an unknown one", async () => {
    for (const [type, table] of [
      ["ced", "geo.ced"],
      ["sed", "geo.sed"],
      ["sed_lower", "geo.sed_lower"],
      ["sed_upper", "geo.sed_upper"],
      ["lga", "geo.lga"],
      ["ward", "geo.ward"],
    ] as const) {
      const $queryRawUnsafe = jest.fn().mockResolvedValue([]);
      await svcOf($queryRawUnsafe).listDivisions(type);
      expect($queryRawUnsafe.mock.calls[0][0]).toContain(table);
      expect($queryRawUnsafe.mock.calls[0][1]).toBe(type);
    }
    await expect(svcOf(jest.fn()).listDivisions("bogus")).rejects.toThrow();
  });

  it("tile() resolves the chamber layers to their tables", async () => {
    for (const [layer, table] of [
      ["sed_lower", "geo.sed_lower"],
      ["sed_upper", "geo.sed_upper"],
      ["ward", "geo.ward"],
      ["chamber_electorate", "geo.chamber_electorate"],
    ] as const) {
      const $queryRawUnsafe = jest.fn().mockResolvedValue([]);
      await svcOf($queryRawUnsafe).tile(layer, 1, 0, 0);
      expect($queryRawUnsafe.mock.calls[0][0]).toContain(table);
    }
  });

  it("divisionDetail(sed_upper) reads the derived table, kind and address_region column", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ code: "2-LC-SOUTHERN-METROPOLITAN", name: "Southern Metropolitan", state: "Victoria", geojson: null }])
      .mockResolvedValueOnce([{ addressCount: 10, contactCount: 4 }]);
    const res = await svcOf($queryRawUnsafe).divisionDetail("t1", "sed_upper", "2-LC-SOUTHERN-METROPOLITAN");
    expect($queryRawUnsafe.mock.calls[0][0]).toContain("geo.sed_upper");
    expect($queryRawUnsafe.mock.calls[1][0]).toContain("ar.sed_upper_code");
    expect($queryRawUnsafe.mock.calls[1][3]).toBe("sed_upper"); // region_address_count kind
    expect(res).toMatchObject({ addressCount: 10, contactCount: 4, withoutContacts: 6 });
  });

  it("addresses(divisionType=ward) filters on the ward_code column", async () => {
    const $queryRawUnsafe = jest.fn().mockResolvedValue([]);
    await svcOf($queryRawUnsafe).addresses("t1", { divisionType: "ward", divisionCode: "LGA1-W-NORTH" });
    expect($queryRawUnsafe.mock.calls[0][0]).toContain("ar.ward_code = $2");
  });

  it("nearbyAddresses joins every chamber a door sits in", async () => {
    const $queryRawUnsafe = jest.fn().mockResolvedValue([]);
    await svcOf($queryRawUnsafe).nearbyAddresses("t1", { lat: -37.8, lng: 144.9 });
    const sql = $queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("LEFT JOIN geo.sed_lower sedl");
    expect(sql).toContain("LEFT JOIN geo.sed_upper sedu");
    expect(sql).toContain("LEFT JOIN geo.ward w");
    expect(sql).toContain('"sedUpperName"');
    // The raw ABS sed fields stay for back-compat.
    expect(sql).toContain('"sedCode"');
  });

  it("unionSources builds one CTE branch and one param per layer, in lockstep", async () => {
    const $queryRawUnsafe = jest.fn().mockResolvedValue([{ geojson: null }]);
    await svcOf($queryRawUnsafe).unionSources(
      [
        { kind: "division", type: "sed_upper", code: "2-LC-SOUTHERN-METROPOLITAN" },
        { kind: "division", type: "ward", code: "LGA1-W-NORTH" },
        { kind: "division", type: "chamber_electorate", code: "SENATE-VIC" },
        { kind: "area", layer: "sa1", code: "S1" },
      ],
      ["GA1"],
    );
    const [sql, ...params] = $queryRawUnsafe.mock.calls[0] as [string, ...string[]];
    for (const t of [
      "geo.meshblock", "geo.sa1", "geo.sa2", "geo.sa3", "geo.sa4", "geo.ced", "geo.sed",
      "geo.sed_lower", "geo.sed_upper", "geo.lga", "geo.ward", "geo.state",
      "geo.chamber_electorate", "geo.gnaf_address",
    ]) {
      expect(sql).toContain(t);
    }
    // 13 layers + drawn polygons + picked doors. The highest placeholder must be the last
    // param — this is what the old hand-numbered $1..$11 kept getting wrong.
    expect(params).toHaveLength(15);
    expect(sql).toContain("$15::jsonb");
    expect(sql).not.toContain("$16");
    const slot = sql.match(/geo\.sed_upper WHERE code IN \(SELECT jsonb_array_elements_text\(\$(\d+)::jsonb\)\)/);
    expect(slot).toBeTruthy();
    expect(params[Number(slot![1]) - 1]).toBe(JSON.stringify(["2-LC-SOUTHERN-METROPOLITAN"]));
    expect(params[14]).toBe(JSON.stringify(["GA1"]));
  });

  it("regionParents(sed_lower) nests a VICTORIAN district under its Legislative Council region", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ state: "Victoria", pu: "2-LC-SOUTHERN-METROPOLITAN", pun: "Southern Metropolitan" }])
      .mockResolvedValueOnce([{ code: "2", name: "Victoria" }]);
    const parents = await (svcOf($queryRawUnsafe) as unknown as { regionParents: Parents }).regionParents("sed_lower", "20106");
    expect(parents).toEqual([
      { kind: "state", code: "2", name: "Victoria" },
      { kind: "sed_upper", code: "2-LC-SOUTHERN-METROPOLITAN", name: "Southern Metropolitan" },
    ]);
  });

  it("regionParents(sed_lower) does NOT nest a TASMANIAN division — the chambers cross-cut", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ state: "Tasmania", pu: null, pun: null }])
      .mockResolvedValueOnce([{ code: "6", name: "Tasmania" }]);
    const parents = await (svcOf($queryRawUnsafe) as unknown as { regionParents: Parents }).regionParents("sed_lower", "6-HA-BASS");
    expect(parents).toEqual([{ kind: "state", code: "6", name: "Tasmania" }]);
    expect(parents.some((p) => p.kind === "sed_upper")).toBe(false);
  });

  it("regionParents(ward) puts a ward under its council, under its state", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ state: "Victoria", lga: "LGA1", lgan: "Melbourne" }])
      .mockResolvedValueOnce([{ code: "2", name: "Victoria" }]);
    const parents = await (svcOf($queryRawUnsafe) as unknown as { regionParents: Parents }).regionParents("ward", "LGA1-W-NORTH");
    expect(parents).toEqual([
      { kind: "state", code: "2", name: "Victoria" },
      { kind: "lga", code: "LGA1", name: "Melbourne" },
    ]);
  });

  it("regionChildren(sed_upper) lists nested districts for Victoria", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ code: "20106", name: "Albert Park", addressCount: 100 }]) // nestedGroup
      .mockResolvedValueOnce([{ n: 100 }]) // countOf
      .mockResolvedValueOnce([]); // addressGroup rows
    const region = { kind: "sed_upper", code: "2-LC-SOUTHERN-METROPOLITAN", name: "Southern Metropolitan" };
    const groups = await (svcOf($queryRawUnsafe) as unknown as { regionChildren: Children }).regionChildren(
      "sed_upper", region.code, region,
    );
    expect($queryRawUnsafe.mock.calls[0][0]).toContain("d.parent_upper_code = $1");
    expect(groups.map((g) => g.kind)).toEqual(["sed_lower", "address"]);
  });

  it("regionChildren(sed_upper) yields NO nested districts for Tasmania — only addresses", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([]) // nestedGroup: parent_upper_code is NULL for every TAS district
      .mockResolvedValueOnce([{ n: 24840 }])
      .mockResolvedValueOnce([]);
    const region = { kind: "sed_upper", code: "6-LC-DERWENT", name: "Derwent" };
    const groups = await (svcOf($queryRawUnsafe) as unknown as { regionChildren: Children }).regionChildren(
      "sed_upper", region.code, region,
    );
    expect(groups.map((g) => g.kind)).toEqual(["address"]);
  });

  it("regionChildren(lga) lists its wards before its addresses", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ code: "LGA1-W-NORTH", name: "North", addressCount: 5 }])
      .mockResolvedValueOnce([{ n: 5 }])
      .mockResolvedValueOnce([]);
    const region = { kind: "lga", code: "LGA1", name: "Melbourne" };
    const groups = await (svcOf($queryRawUnsafe) as unknown as { regionChildren: Children }).regionChildren("lga", "LGA1", region);
    expect($queryRawUnsafe.mock.calls[0][0]).toContain("d.lga_code = $1");
    expect(groups.map((g) => g.kind)).toEqual(["ward", "address"]);
  });

  it("chamberElectorateDetail counts contacts across every state code the electorate absorbs", async () => {
    // The Senate's ACT contest absorbs Jervis Bay (90103) and Norfolk Is. (90104).
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([
        { code: "SENATE-ACT", name: "Senate – Australian Capital Territory", state: "Australian Capital Territory", chamberKey: "fed-senate", memberCount: 2, geojson: null },
      ])
      .mockResolvedValueOnce([{ addressCount: 200, contactCount: 30 }]);
    const res = await svcOf($queryRawUnsafe).chamberElectorateDetail("t1", "SENATE-ACT");
    const countsSql = $queryRawUnsafe.mock.calls[1][0] as string;
    expect(countsSql).toContain("CASE WHEN left(ar.sa4_code, 1) = '9' THEN ar.sa3_code");
    expect(countsSql).toContain("unnest(state_codes)");
    expect(res).toMatchObject({ code: "SENATE-ACT", chamberKey: "fed-senate", memberCount: 2, addressCount: 200, contactCount: 30, withoutContacts: 170 });
  });

  it("chamberElectorateDetail throws when the electorate does not exist", async () => {
    const $queryRawUnsafe = jest.fn().mockResolvedValueOnce([]);
    await expect(svcOf($queryRawUnsafe).chamberElectorateDetail("t1", "NOPE")).rejects.toThrow();
  });

  it("listChambers surfaces the catalogue, including chambers that do not exist", async () => {
    const $queryRawUnsafe = jest.fn().mockResolvedValue([{ key: "qld-lc", exists: false }]);
    await svcOf($queryRawUnsafe).listChambers();
    const sql = $queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("geo.chamber");
    expect(sql).toContain('"exists"');
  });

  it("listChamberElectorates joins the precomputed address counts", async () => {
    const $queryRawUnsafe = jest.fn().mockResolvedValue([]);
    await svcOf($queryRawUnsafe).listChamberElectorates();
    const sql = $queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("geo.chamber_electorate");
    expect(sql).toContain("rac.kind = 'chamber_electorate'");
  });
});

/**
 * Polling places (booths) — the SQL is exercised against real PostGIS by the
 * loader/manual verification; these assert filter/param shape, the limit caps,
 * the division joins and the not-found branch. The DB is mocked.
 */
describe("GeoService polling places", () => {
  const svcOf = ($queryRawUnsafe: jest.Mock) => new GeoService({ $queryRawUnsafe } as never);

  it("browsePollingPlaces filters by jurisdiction, state and text, and returns rows + total", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ id: "federal:11877", name: "Bonython" }]) // rows
      .mockResolvedValueOnce([{ total: 42 }]); // count
    const res = await svcOf($queryRawUnsafe).browsePollingPlaces({
      jurisdiction: "Federal",
      state: "nsw",
      q: "bon",
    });
    expect(res).toEqual({ rows: [{ id: "federal:11877", name: "Bonython" }], total: 42 });

    const [rowsSql, ...rowsParams] = $queryRawUnsafe.mock.calls[0];
    expect(rowsSql).toContain("geo.polling_place");
    expect(rowsSql).toContain("jurisdiction = $1");
    expect(rowsSql).toContain("state = $2");
    expect(rowsSql).toContain("ILIKE $3");
    expect(rowsSql).toContain("LEFT JOIN geo.ced");
    expect(rowsSql).toContain("LEFT JOIN geo.sed");
    // jurisdiction lower-cased, state upper-cased, q wrapped for ILIKE.
    expect(rowsParams).toEqual(["federal", "NSW", "%bon%"]);
    // The count query carries the same WHERE + params.
    const [countSql, ...countParams] = $queryRawUnsafe.mock.calls[1];
    expect(countSql).toContain("COUNT(*)");
    expect(countParams).toEqual(["federal", "NSW", "%bon%"]);
  });

  it("browsePollingPlaces treats 'all' as unfiltered and caps the page size at 100", async () => {
    const $queryRawUnsafe = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);
    await svcOf($queryRawUnsafe).browsePollingPlaces({ jurisdiction: "all", limit: 500 });
    const [rowsSql, ...rowsParams] = $queryRawUnsafe.mock.calls[0];
    expect(rowsSql).toContain("LIMIT 100");
    expect(rowsSql).not.toContain("WHERE");
    expect(rowsParams).toEqual([]);
  });

  it("pollingPlacePoints requires geom, caps at 20k, and filters when asked", async () => {
    const cap = svcOf(jest.fn().mockResolvedValue([]));
    await cap.pollingPlacePoints({ jurisdiction: "all", limit: 99999 });
    const capSql = (cap as unknown as { prisma: { $queryRawUnsafe: jest.Mock } }).prisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(capSql).toContain("geom IS NOT NULL");
    expect(capSql).toContain("LIMIT 20000");

    const $queryRawUnsafe = jest.fn().mockResolvedValue([{ id: "nsw:1", lat: -33, lng: 151, jurisdiction: "nsw", name: "X" }]);
    const rows = await svcOf($queryRawUnsafe).pollingPlacePoints({ jurisdiction: "nsw", state: "nsw" });
    expect(rows).toHaveLength(1);
    const [sql, ...params] = $queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("jurisdiction = $1");
    expect(sql).toContain("state = $2");
    expect(params).toEqual(["nsw", "NSW"]);
  });

  it("pollingPlaceDetail returns the row with division names, and throws when missing", async () => {
    const found = jest.fn().mockResolvedValue([{ id: "federal:11877", name: "Bonython", cedName: "Bean", sedName: null }]);
    const detail = await svcOf(found).pollingPlaceDetail("federal:11877");
    expect(detail).toMatchObject({ id: "federal:11877", cedName: "Bean" });
    const [sql, id] = found.mock.calls[0];
    expect(sql).toContain("geo.polling_place");
    expect(sql).toContain("LEFT JOIN geo.ced");
    expect(id).toBe("federal:11877");

    await expect(svcOf(jest.fn().mockResolvedValue([])).pollingPlaceDetail("nope:0")).rejects.toThrow();
  });
});

/**
 * First Nations — the ABS Indigenous Structure as a REFERENCE-ONLY layer.
 *
 * The load-bearing test here is the last one. "An organiser cannot cut a doorknocking turf
 * from an Indigenous Area" is a product guarantee, so it is pinned by assertion rather than
 * left to convention: the three levels must be unreachable from `table()`, absent from
 * `DIVISION_TYPES`/`TURF_DIVISION_TYPES`, and never nameable in `unionSources`' generated SQL.
 */
/**
 * Any query that joins `geo.region_address_count` sees TWO `code` columns (and, for the area
 * layers, two candidate `name`s). An unqualified reference makes Postgres reject the whole
 * statement with `column reference "code" is ambiguous` — a 500, not a wrong answer.
 *
 * The unit tests mock Prisma, so they assert SQL strings and never execute them. That let
 * exactly this bug ship on `/geo/first-nations?state=2` and on every `/geo/areas` sa1..sa4
 * browse. This guard closes the gap: in a joined query, every bare `code`/`name` must be
 * table-qualified. Column ALIASES (`AS code`) are fine — they are output names, not inputs.
 */
function expectNoAmbiguousColumns(sql: string): void {
  if (!/JOIN\s+geo\.region_address_count/i.test(sql)) return;
  const offenders = [...sql.matchAll(/(?<![.\w])(?<!AS\s)\b(code|name)\b/gi)].map((m) => m[0]);
  expect({ sql, offenders }).toMatchObject({ offenders: [] });
}

describe("GeoService — ambiguous-column regression guard", () => {
  const svcOf = ($queryRawUnsafe: jest.Mock) => new GeoService({ $queryRawUnsafe } as never);

  it.each(["ireg", "iare", "iloc"] as const)(
    "listFirstNations(%s) qualifies every column when filtering by state and q",
    async (level) => {
      const $queryRawUnsafe = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);
      await svcOf($queryRawUnsafe).listFirstNations(level, { q: "dub", state: "2" });
      const [rowsSql] = $queryRawUnsafe.mock.calls[0] as [string];
      const [countSql] = $queryRawUnsafe.mock.calls[1] as [string];
      expect(rowsSql).toContain("d.code LIKE");
      expect(rowsSql).toContain("d.code ILIKE");
      expect(rowsSql).toContain("d.name ILIKE");
      expectNoAmbiguousColumns(rowsSql);
      // The COUNT shares the WHERE, so it must alias the table too.
      expect(countSql).toMatch(/FROM geo\.\w+ d /);
    },
  );

  // Pre-existing: browseAreas built COALESCE(name, code) unqualified beside the same join,
  // so every sa1..sa4 browse 500'd — even with no filters. `mb` escaped it (code = mb_code).
  it.each(["sa1", "sa2", "sa3", "sa4", "mb"] as const)(
    "browseAreas(%s) qualifies every column, filtered and unfiltered",
    async (layer) => {
      for (const opts of [{}, { q: "syd", state: "1" }]) {
        const $queryRawUnsafe = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);
        await svcOf($queryRawUnsafe).browseAreas(layer, opts);
        expectNoAmbiguousColumns($queryRawUnsafe.mock.calls[0][0] as string);
      }
    },
  );
});

describe("GeoService — First Nations", () => {
  type Parents = (k: string, c: string) => Promise<Array<{ kind: string; code: string; name: string }>>;
  type Children = (
    k: string,
    c: string,
    r: { kind: string; code: string; name: string },
  ) => Promise<Array<{ kind: string; label: string; total: number }>>;
  const svcOf = ($queryRawUnsafe: jest.Mock) => new GeoService({ $queryRawUnsafe } as never);

  it("tile() resolves each Indigenous level to its table", async () => {
    for (const [layer, table] of [
      ["ireg", "geo.ireg"],
      ["iare", "geo.iare"],
      ["iloc", "geo.iloc"],
    ] as const) {
      const $queryRawUnsafe = jest.fn().mockResolvedValue([]);
      await svcOf($queryRawUnsafe).tile(layer, 1, 0, 0);
      expect($queryRawUnsafe.mock.calls[0][0]).toContain(table);
    }
  });

  it("listFirstNations pages a level, joins its counts, filters by state digit, and exposes the slug", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ code: "101", name: "Dubbo", state: "New South Wales", slug: "dubbo", addressCount: 12 }])
      .mockResolvedValueOnce([{ total: 1 }]);
    const res = await svcOf($queryRawUnsafe).listFirstNations("ireg", { state: "1", limit: 5 });
    const [sql, param] = $queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("geo.ireg");
    expect(sql).toContain("rac.kind = 'ireg'");
    // Alias-qualified: the rac join also has a `code`.
    expect(sql).toContain("d.code LIKE $1");
    // The URL-friendly key is derived, not stored — names are unique at every level.
    expect(sql).toContain("regexp_replace(d.name");
    expect(sql).toContain("AS slug");
    expect(param).toBe("1%");
    expect(res).toMatchObject({ total: 1 });
    expect(res.rows[0]).toMatchObject({ level: "ireg", code: "101", name: "Dubbo", slug: "dubbo", addressCount: 12 });
  });

  it("listFirstNations rejects an unknown level", async () => {
    await expect(svcOf(jest.fn()).listFirstNations("bogus", {})).rejects.toThrow();
  });

  it("firstNationsDetail reads addressCount and contactCount from the SAME per-address column", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ code: "10100101", name: "Bogan", state: "New South Wales", slug: "bogan", geojson: null }])
      .mockResolvedValueOnce([{ addressCount: 100, contactCount: 30 }]);
    const res = await svcOf($queryRawUnsafe).firstNationsDetail("t1", "iloc", "10100101");
    expect($queryRawUnsafe.mock.calls[0][0]).toContain("geo.iloc");
    // Both counts key off ar.iloc_code, so they can never disagree the way the chamber
    // layers did when the summary was published without the column.
    expect($queryRawUnsafe.mock.calls[1][0]).toContain("ar.iloc_code");
    expect($queryRawUnsafe.mock.calls[1][3]).toBe("iloc");
    expect(res).toMatchObject({ level: "iloc", slug: "bogan", addressCount: 100, contactCount: 30, withoutContacts: 70 });
  });

  it("firstNationsDetail resolves a NAME SLUG as well as an ABS code, and counts on the resolved code", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ code: "107", name: "Sydney - Wollongong", state: "New South Wales", slug: "sydney-wollongong", geojson: null }])
      .mockResolvedValueOnce([{ addressCount: 9, contactCount: 2 }]);
    const res = await svcOf($queryRawUnsafe).firstNationsDetail("t1", "ireg", "sydney-wollongong");
    const metaSql = $queryRawUnsafe.mock.calls[0][0] as string;
    expect(metaSql).toContain("WHERE code = $1 OR");
    expect(metaSql).toContain("regexp_replace(name");
    expect($queryRawUnsafe.mock.calls[0][1]).toBe("sydney-wollongong");
    // The counts must bind the RESOLVED ABS code, never the slug the caller passed in.
    expect($queryRawUnsafe.mock.calls[1][1]).toBe("107");
    expect(res).toMatchObject({ code: "107", slug: "sydney-wollongong", withoutContacts: 7 });
  });

  it("firstNationsDetail throws when the region does not exist", async () => {
    await expect(svcOf(jest.fn().mockResolvedValue([])).firstNationsDetail("t1", "ireg", "999")).rejects.toThrow();
  });

  it("regionParents walks iloc → iare → ireg → state", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ state: "New South Wales", ireg: "101", iregn: "Dubbo", iare: "101001", iaren: "Bogan" }])
      .mockResolvedValueOnce([{ code: "1", name: "New South Wales" }]);
    const parents = await (svcOf($queryRawUnsafe) as unknown as { regionParents: Parents }).regionParents("iloc", "10100101");
    expect(parents).toEqual([
      { kind: "state", code: "1", name: "New South Wales" },
      { kind: "ireg", code: "101", name: "Dubbo" },
      { kind: "iare", code: "101001", name: "Bogan" },
    ]);
  });

  // Indigenous Regions 901/902/903 carry state 'Other Territories', which geo.state does not
  // have (it was split into 90101-90104). 901 spans two of those rows, so it genuinely has no
  // single state parent — the breadcrumb must omit it rather than throw.
  it("regionParents omits the state parent for an Other Territories region", async () => {
    const $queryRawUnsafe = jest
      .fn()
      .mockResolvedValueOnce([{ state: "Other Territories" }])
      .mockResolvedValueOnce([]); // geo.state has no row named 'Other Territories'
    const parents = await (svcOf($queryRawUnsafe) as unknown as { regionParents: Parents }).regionParents("ireg", "901");
    expect(parents).toEqual([]);
  });

  it("regionChildren nests Areas under a Region and Locations under an Area", async () => {
    const ireg = jest
      .fn()
      .mockResolvedValueOnce([{ code: "101001", name: "Bogan", addressCount: 5 }]) // fnGroup(iare)
      .mockResolvedValueOnce([{ n: 5 }]) // countOf
      .mockResolvedValueOnce([]); // addressGroup rows
    const g1 = await (svcOf(ireg) as unknown as { regionChildren: Children }).regionChildren(
      "ireg", "101", { kind: "ireg", code: "101", name: "Dubbo" },
    );
    expect(ireg.mock.calls[0][0]).toContain("d.ireg_code = $1");
    expect(g1.map((g) => g.kind)).toEqual(["iare", "address"]);

    const iare = jest
      .fn()
      .mockResolvedValueOnce([{ code: "10100101", name: "Bogan", addressCount: 5 }])
      .mockResolvedValueOnce([{ n: 5 }])
      .mockResolvedValueOnce([]);
    const g2 = await (svcOf(iare) as unknown as { regionChildren: Children }).regionChildren(
      "iare", "101001", { kind: "iare", code: "101001", name: "Bogan" },
    );
    expect(iare.mock.calls[0][0]).toContain("d.iare_code = $1");
    expect(g2.map((g) => g.kind)).toEqual(["iloc", "address"]);
  });

  it("regionChildren of a Location is addresses only", async () => {
    const $queryRawUnsafe = jest.fn().mockResolvedValueOnce([{ n: 5 }]).mockResolvedValueOnce([]);
    const groups = await (svcOf($queryRawUnsafe) as unknown as { regionChildren: Children }).regionChildren(
      "iloc", "10100101", { kind: "iloc", code: "10100101", name: "Bogan" },
    );
    expect(groups.map((g) => g.kind)).toEqual(["address"]);
  });

  it("REFERENCE-ONLY: an Indigenous level can never reach a turf or campaign boundary", async () => {
    for (const level of ["ireg", "iare", "iloc"] as const) {
      // Not a division layer …
      expect(DIVISION_TYPES).not.toContain(level);
      expect(TURF_DIVISION_TYPES as readonly string[]).not.toContain(level);
      // … so table() refuses it, which shuts every division/turf code path.
      await expect(svcOf(jest.fn()).listDivisions(level)).rejects.toThrow();
      await expect(svcOf(jest.fn()).divisionDetail("t1", level, "101")).rejects.toThrow();
    }

    // … and even if a caller forges a BoundarySource, unionSources must never name the tables.
    const $queryRawUnsafe = jest.fn().mockResolvedValue([{ geojson: null }]);
    await svcOf($queryRawUnsafe).unionSources([
      { kind: "division", type: "ireg" as never, code: "101" },
      { kind: "division", type: "iare" as never, code: "101001" },
      { kind: "division", type: "iloc" as never, code: "10100101" },
    ]);
    const sql = $queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).not.toContain("geo.ireg");
    expect(sql).not.toContain("geo.iare");
    expect(sql).not.toContain("geo.iloc");
  });
});

// Mesh blocks + SA1s now carry a backfilled place-like name (geo:names). These pin the
// read-path flip: mb is labelled/searched by COALESCE(name, mb_code), not the bare code.
describe("GeoService — area names", () => {
  const svcWith = (impl: (m: jest.Mock) => void) => {
    const $queryRawUnsafe = jest.fn();
    impl($queryRawUnsafe);
    return { svc: new GeoService({ $queryRawUnsafe } as never), $queryRawUnsafe };
  };

  it("searchAreas matches a mesh block by its new name as well as its code", async () => {
    const { svc, $queryRawUnsafe } = svcWith((m) =>
      m.mockResolvedValue([{ code: "20388010000", name: "Fitzroy North · SE" }]),
    );
    const res = await svc.searchAreas("mb", "fitzroy");
    const sql = $queryRawUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("mb_code ILIKE $1 OR name ILIKE $1"); // trigram-indexed, code OR name
    expect(sql).toContain("COALESCE(name, mb_code)"); // SELECT label
    expect(res[0]).toMatchObject({ level: "mb", code: "20388010000", name: "Fitzroy North · SE" });
  });

  it("areaDetail labels a mesh block by name, falling back to the code", async () => {
    const { svc, $queryRawUnsafe } = svcWith((m) =>
      m
        .mockResolvedValueOnce([{ code: "20388010000", name: "Fitzroy North · SE", geojson: null }])
        .mockResolvedValueOnce([{ addressCount: 12, contactCount: 3 }]),
    );
    const res = await svc.areaDetail("t1", "mb", "20388010000");
    expect($queryRawUnsafe.mock.calls[0][0]).toContain("COALESCE(name, mb_code)");
    expect(res).toMatchObject({
      level: "mb",
      name: "Fitzroy North · SE",
      addressCount: 12,
      contactCount: 3,
      withoutContacts: 9,
    });
  });

  it("regionRef resolves a mesh block name via COALESCE(name, mb_code)", async () => {
    const { svc, $queryRawUnsafe } = svcWith((m) => m.mockResolvedValue([]));
    // Empty row → not found; the point is line coverage of the mb nameSel expr it builds first.
    await expect(svc.regionHierarchy("mb", "20388010000")).rejects.toThrow();
    expect($queryRawUnsafe.mock.calls[0][0]).toContain("COALESCE(name, mb_code)");
  });
});
