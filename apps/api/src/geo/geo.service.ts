/// <reference path="./vt-pbf.d.ts" />
import { Injectable } from "@nestjs/common";
import geojsonvt from "geojson-vt";
import { fromGeojsonVt } from "vt-pbf";
import type { FeatureCollection, Geometry } from "geojson";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

/** Source table + code/name columns for a tileable geo layer (areas, divisions, state). */
const TILE_SOURCE: Record<string, { table: string; codeCol: string; nameExpr: string }> = {
  mb: { table: "geo.meshblock", codeCol: "mb_code", nameExpr: "mb_code" },
  sa1: { table: "geo.sa1", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa2: { table: "geo.sa2", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa3: { table: "geo.sa3", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa4: { table: "geo.sa4", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  ced: { table: "geo.ced", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sed: { table: "geo.sed", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  lga: { table: "geo.lga", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  state: { table: "geo.state", codeCol: "code", nameExpr: "COALESCE(name, code)" },
};

export type DivisionType = "ced" | "sed" | "lga";
const DIVISION_TABLE: Record<DivisionType, string> = { ced: "geo.ced", sed: "geo.sed", lga: "geo.lga" };
const REGION_COL: Record<DivisionType, string> = { ced: "ced_code", sed: "sed_code", lga: "lga_code" };

/** ASGS statistical-area levels selectable on the turf-cut map — the full
 *  hierarchy Mesh Block → SA1 → SA2 → SA3 → SA4. */
export type AreaLevel = "mb" | "sa1" | "sa2" | "sa3" | "sa4";
const AREA_TABLE: Record<AreaLevel, { table: string; codeCol: string; nameExpr: string }> = {
  // Meshblocks have no name — fall back to the code as the label.
  mb: { table: "geo.meshblock", codeCol: "mb_code", nameExpr: "mb_code" },
  sa1: { table: "geo.sa1", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa2: { table: "geo.sa2", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa3: { table: "geo.sa3", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa4: { table: "geo.sa4", codeCol: "code", nameExpr: "COALESCE(name, code)" },
};
// geo.address_region column that maps an address to each ASGS level — the join key for
// area address counts (mirrors REGION_COL for divisions).
const AREA_REGION_COL: Record<AreaLevel, string> = {
  mb: "mb_code",
  sa1: "sa1_code",
  sa2: "sa2_code",
  sa3: "sa3_code",
  sa4: "sa4_code",
};

/** A part of a campaign boundary or a turf cut: a whole division, an ASGS area, or a drawn polygon. */
export type BoundarySource =
  | { kind: "division"; type: DivisionType | "ste"; code: string }
  | { kind: "area"; layer: AreaLevel; code: string }
  | { kind: "polygon"; geometry: unknown };

/** A node in the geo containment tree. `state` is the top; `address` (a G-NAF
 *  door) is the leaf; ced/sed/lga hang under their state as a parallel branch. */
export type RegionKind = "state" | "ced" | "sed" | "lga" | "sa4" | "sa3" | "sa2" | "sa1" | "mb" | "address";
export type RegionRef = { kind: RegionKind; code: string; name: string; addressCount?: number };
/** One region's place in the tree: what contains it (coarsest→finest) and what it
 *  immediately contains (grouped by child kind, each capped with a real `total`). */
export type RegionHierarchy = {
  region: RegionRef;
  parents: RegionRef[];
  childGroups: Array<{ kind: RegionKind; label: string; total: number; rows: RegionRef[] }>;
};

const REGION_KINDS = new Set<RegionKind>([
  "state", "ced", "sed", "lga", "sa4", "sa3", "sa2", "sa1", "mb", "address",
]);
/** Cap on inlined child rows (esp. addresses); `total` always carries the real count. */
const CHILD_ROW_CAP = 200;

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  private table(type: string): { table: string; col: string; type: DivisionType } {
    if (type !== "ced" && type !== "sed" && type !== "lga") {
      throw new ApiHttpException("BAD_DIVISION_TYPE", "type must be ced, sed or lga");
    }
    return { table: DIVISION_TABLE[type], col: REGION_COL[type], type };
  }

  private areaTable(layer: string) {
    if (layer !== "mb" && layer !== "sa1" && layer !== "sa2" && layer !== "sa3" && layer !== "sa4") {
      throw new ApiHttpException("BAD_AREA_LEVEL", "layer must be mb, sa1, sa2, sa3 or sa4");
    }
    return AREA_TABLE[layer];
  }

  /**
   * Statistical-area boundaries intersecting a viewport, as a GeoJSON
   * FeatureCollection — the clickable/selectable layer on the turf-cut map.
   * bbox is "minLng,minLat,maxLng,maxLat"; the `geom &&` bbox-overlap test hits
   * the GIST index so meshblock-density viewports stay fast. Capped so a
   * zoomed-out request can't ship the whole country.
   */
  async areas(opts: { layer: string; bbox: string; limit?: number }) {
    const { table, codeCol, nameExpr } = this.areaTable(opts.layer);
    const b = (opts.bbox ?? "").split(",").map(Number);
    if (b.length !== 4 || b.some((n) => !Number.isFinite(n))) {
      throw new ApiHttpException("BAD_BBOX", "bbox must be minLng,minLat,maxLng,maxLat");
    }
    const limit = Math.min(Math.max(1, Number.isFinite(opts.limit as number) ? (opts.limit as number) : 800), 3000);
    // Simplify boundaries to the viewport's resolution: a zoomed-out meshblock
    // request previously shipped multi-MB of raw polygons. Tolerance ≈ one
    // on-screen pixel for a ~2000px viewport, clamped; near-zero → skip the
    // simplify call entirely (zoomed right in, geometry already small).
    const spanLng = Math.abs(b[2] - b[0]);
    const tolerance = Math.min(spanLng / 2000, 0.01);
    const geomExpr =
      tolerance > 0.00005 ? `ST_SimplifyPreserveTopology(geom, ${tolerance})` : "geom";
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ${codeCol} AS code, ${nameExpr} AS name, ST_AsGeoJSON(${geomExpr}) AS geojson
       FROM ${table}
       WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
       LIMIT ${limit}`,
      b[0],
      b[1],
      b[2],
      b[3],
    )) as Array<{ code: string; name: string | null; geojson: string }>;
    return {
      type: "FeatureCollection" as const,
      features: rows.map((r) => ({
        type: "Feature" as const,
        id: r.code,
        geometry: JSON.parse(r.geojson),
        properties: { code: r.code, name: r.name ?? r.code, level: opts.layer },
      })),
    };
  }

  /**
   * Statistical-area boundaries intersecting a campaign boundary polygon, as a
   * GeoJSON FeatureCollection — the selectable layer for cutting turf inside a
   * *bounded* campaign (only the areas within the campaign are drawn). The
   * boundary's own bbox drives the GIST index (`t.geom && b.g`), then ST_Intersects
   * refines. Whole areas are returned (selection is by code; the saved turf is
   * clipped to the boundary server-side), simplified to keep meshblock payloads
   * sane, and capped so a huge boundary can't ship the whole country.
   */
  async areasInBoundary(layer: string, boundary: unknown, limit = 5000) {
    const { table, codeCol, nameExpr } = this.areaTable(layer);
    if (boundary == null) return { type: "FeatureCollection" as const, features: [] };
    const lim = Math.min(Math.max(1, limit), 8000);
    // GeoJSON is always WGS84; SetSRID guards against a mixed-SRID `&&`/intersects.
    const geojson = JSON.stringify(boundary);
    // `coverage` = the fraction of each area that falls inside the boundary
    // (0–1). The area units cancel in the ratio, so raw EPSG:4326 ST_Area is fine.
    // The UI draws <50%-inside areas as dashed "edge" outlines.
    const rows = (await this.prisma.$queryRawUnsafe(
      `WITH b AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS g)
       SELECT ${codeCol} AS code, ${nameExpr} AS name,
              (ST_Area(ST_Intersection(t.geom, b.g)) / NULLIF(ST_Area(t.geom), 0))::double precision AS coverage,
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(t.geom, 0.0002)) AS geojson
       FROM ${table} t, b
       WHERE t.geom && b.g AND ST_Intersects(t.geom, b.g)
       LIMIT ${lim}`,
      geojson,
    )) as Array<{ code: string; name: string | null; coverage: number | null; geojson: string }>;
    return {
      type: "FeatureCollection" as const,
      features: rows.map((r) => ({
        type: "Feature" as const,
        id: r.code,
        geometry: JSON.parse(r.geojson),
        properties: {
          code: r.code,
          name: r.name ?? r.code,
          level: layer,
          coverage: r.coverage ?? 1,
        },
      })),
    };
  }

  /** Web-Mercator XYZ tile → [west, south, east, north] in EPSG:4326 degrees. */
  private tileToBBox(z: number, x: number, y: number): [number, number, number, number] {
    const n = 2 ** z;
    const lon = (xx: number) => (xx / n) * 360 - 180;
    const lat = (yy: number) => {
      const r = Math.PI * (1 - (2 * yy) / n);
      return (Math.atan(Math.sinh(r)) * 180) / Math.PI;
    };
    return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
  }

  private tileSource(layer: string): { table: string; codeCol: string; nameExpr: string } {
    const src = TILE_SOURCE[layer];
    if (!src) throw new ApiHttpException("BAD_TILE_LAYER", `unknown tile layer: ${layer}`);
    return src;
  }

  /**
   * One Mapbox Vector Tile (MVT) for a geo layer, generated on demand. Mapbox
   * requests only the tiles visible at the current zoom, so this replaces the
   * per-viewport GeoJSON fetch (`areas()`) as the map's boundary source — fast at
   * any zoom, and cacheable. The tile is encoded in Node (geojson-vt + vt-pbf)
   * rather than via PostGIS ST_AsMVT, so it works on any PostGIS build (the dev DB
   * is compiled without protobuf-c). The `geom && envelope` filter hits the same
   * GIST index `areas()` uses; ST_SimplifyPreserveTopology trims transfer volume
   * before geojson-vt re-simplifies into tile space. Returns empty bytes for a
   * tile with no features (the controller answers 204).
   */
  async tile(layer: string, z: number, x: number, y: number): Promise<Buffer> {
    const src = this.tileSource(layer);
    if (![z, x, y].every((v) => Number.isInteger(v)) || z < 0 || z > 24) {
      throw new ApiHttpException("BAD_TILE", "z, x, y must be integers and 0 <= z <= 24");
    }
    const span = 2 ** z;
    if (x < 0 || x >= span || y < 0 || y >= span) {
      throw new ApiHttpException("BAD_TILE", "x/y out of range for this zoom");
    }
    const [w, s, e, n] = this.tileToBBox(z, x, y);
    // Drop vertices finer than ~1/2048 of the tile width before transfer; geojson-vt
    // re-simplifies in tile space, so this only trims payload for dense tiles.
    const tolerance = Math.min((e - w) / 2048, 0.02);
    const geomExpr =
      tolerance > 0.00002 ? `ST_SimplifyPreserveTopology(geom, ${tolerance})` : "geom";
    // No feature cap — a tile holds every feature in its bbox so nothing truncates in
    // view. "Batching" is the vector-tile grid itself: mapbox requests the covering
    // tiles at the current zoom and renders each as it arrives, so a dense level loads
    // progressively rather than in one blocking chunk. The one runaway case (a whole
    // level's worth of meshblocks in a single low-zoom tile, ~368k) is kept off the
    // wire by the client's per-level minzoom floor, so that tile is never requested.
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ${src.codeCol} AS code, ${src.nameExpr} AS name, ST_AsGeoJSON(${geomExpr}) AS geojson
       FROM ${src.table}
       WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
      w,
      s,
      e,
      n,
    )) as Array<{ code: string; name: string | null; geojson: string }>;
    if (rows.length === 0) return Buffer.alloc(0);
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        geometry: JSON.parse(r.geojson) as Geometry,
        properties: { code: r.code, name: r.name ?? r.code },
      })),
    };
    // Slice/clip to this tile in tile-space coordinates, then encode to MVT.
    const index = geojsonvt(fc, {
      maxZoom: Math.max(z, 1),
      indexMaxZoom: Math.min(z, 5),
      // Don't drop features on a dense tile (default caps the index at 100k points).
      indexMaxPoints: 0,
      extent: 4096,
      buffer: 64,
      tolerance: 3,
    });
    const tile = index.getTile(z, x, y);
    if (!tile || tile.features.length === 0) return Buffer.alloc(0);
    return Buffer.from(fromGeojsonVt({ areas: tile }, { version: 2 }));
  }

  /** Type-ahead over a level's name/code for the area search box, optionally
   *  filtered to one state (the `state` ASGS digit, 1–9). */
  async searchAreas(layer: string, q: string, limit?: number, state?: string) {
    const { table, codeCol, nameExpr } = this.areaTable(layer);
    const term = `%${(q ?? "").trim()}%`;
    const lim = Math.min(Math.max(1, limit ?? 12), 50);
    // WHERE must hit the PLAIN columns so the GIN trigram indexes apply — a
    // COALESCE(name, code) ILIKE wraps the column in an expression and forces a
    // seq scan (368k meshblocks per keystroke before this). nameExpr stays in
    // the SELECT only. Meshblocks have no name column at all.
    const params: unknown[] = [term];
    const clauses = [layer === "mb" ? `${codeCol} ILIKE $1` : `(${codeCol} ILIKE $1 OR name ILIKE $1)`];
    // ASGS codes are state-prefixed (first digit = state), so a state filter is a
    // cheap code-prefix match. Restrict to one digit so it can't smuggle a pattern.
    if (state && /^[1-9]$/.test(state)) {
      params.push(`${state}%`);
      clauses.push(`${codeCol} LIKE $${params.length}`);
    }
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ${codeCol} AS code, ${nameExpr} AS name
       FROM ${table}
       WHERE ${clauses.join(" AND ")}
       ORDER BY name
       LIMIT ${lim}`,
      ...params,
    )) as Array<{ code: string; name: string | null }>;
    return rows.map((r) => ({ level: layer, code: r.code, name: r.name ?? r.code }));
  }

  /**
   * Paged browse over a level's full national set — the divisions-table
   * equivalent for the areas list view (name + address count + total), with the
   * same optional state-digit and name/code filters as searchAreas. Two queries:
   * the page reads via the PK index (ORDER BY code, LIMIT stops early even on
   * 368k meshblocks), the COUNT skips the address-count join entirely.
   */
  async browseAreas(layer: string, opts: { q?: string; state?: string; limit?: number; offset?: number }) {
    const { table, codeCol, nameExpr } = this.areaTable(layer);
    const lim = Math.min(Math.max(1, opts.limit ?? 20), 100);
    const off = Math.max(0, opts.offset ?? 0);
    const params: unknown[] = [];
    const clauses: string[] = [];
    const q = (opts.q ?? "").trim();
    if (q) {
      // Plain columns only, same trigram-index reasoning as searchAreas.
      params.push(`%${q}%`);
      clauses.push(
        layer === "mb" ? `${codeCol} ILIKE $${params.length}` : `(${codeCol} ILIKE $${params.length} OR name ILIKE $${params.length})`,
      );
    }
    if (opts.state && /^[1-9]$/.test(opts.state)) {
      params.push(`${opts.state}%`);
      clauses.push(`${codeCol} LIKE $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRawUnsafe(
        `SELECT d.${codeCol} AS code, ${nameExpr} AS name,
                COALESCE(rac.address_count, 0)::int AS "addressCount"
         FROM ${table} d
         LEFT JOIN geo.region_address_count rac ON rac.kind = '${layer}' AND rac.code = d.${codeCol}
         ${where}
         ORDER BY d.${codeCol}
         LIMIT ${lim} OFFSET ${off}`,
        ...params,
      ) as Promise<Array<{ code: string; name: string | null; addressCount: number }>>,
      this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS total FROM ${table} ${where}`,
        ...params,
      ) as Promise<Array<{ total: number }>>,
    ]);
    return {
      rows: rows.map((r) => ({ level: layer, code: r.code, name: r.name ?? r.code, addressCount: r.addressCount })),
      total: counts[0]?.total ?? 0,
    };
  }

  /** One statistical area's boundary — used when a search result is picked. */
  async area(layer: string, code: string) {
    const { table, codeCol, nameExpr } = this.areaTable(layer);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ${codeCol} AS code, ${nameExpr} AS name, ST_AsGeoJSON(geom) AS geojson
       FROM ${table} WHERE ${codeCol} = $1`,
      code,
    )) as Array<{ code: string; name: string | null; geojson: string | null }>;
    if (rows.length === 0 || !rows[0].geojson) {
      throw new ApiHttpException("AREA_NOT_FOUND", "Area not found");
    }
    const r = rows[0];
    return {
      type: "Feature" as const,
      id: r.code,
      geometry: JSON.parse(String(r.geojson)),
      properties: { code: r.code, name: r.name ?? r.code, level: layer },
    };
  }

  /**
   * One statistical area: boundary GeoJSON + total/contact/without-contact counts
   * for an org — the area equivalent of {@link divisionDetail}. Column refs are
   * qualified to the area table (`a`) because the address_region join shares the
   * `*_code` column names and Contact may share `name`.
   */
  async areaDetail(tenantId: string, layer: string, code: string) {
    const { table, codeCol } = this.areaTable(layer);
    const regionCol = AREA_REGION_COL[layer as AreaLevel];
    // Meshblocks have no name column — fall back to the code as the label. Single-table
    // meta query, so the column refs are unambiguous without an alias.
    const nameSel = layer === "mb" ? codeCol : "COALESCE(name, code)";
    const meta = (await this.prisma.$queryRawUnsafe(
      `SELECT ${codeCol} AS code, ${nameSel} AS name, ST_AsGeoJSON(geom) AS geojson
       FROM ${table} WHERE ${codeCol} = $1`,
      code,
    )) as Array<Record<string, unknown>>;
    if (meta.length === 0) throw new ApiHttpException("AREA_NOT_FOUND", "Area not found");
    const m = meta[0];
    // addressCount from the precomputed summary (PK lookup); contactCount stays
    // live (tenant-scoped, Contact_tenantId_gnafPid_idx). See divisionDetail.
    const counts = (await this.prisma.$queryRawUnsafe(
      `SELECT
         COALESCE((SELECT address_count FROM geo.region_address_count WHERE kind = $3 AND code = $1), 0)::int AS "addressCount",
         (SELECT COUNT(DISTINCT c."gnafPid")
            FROM "Contact" c
            JOIN geo.address_region ar ON ar.gnaf_pid = c."gnafPid"
            WHERE ar.${regionCol} = $1 AND c."tenantId" = $2)::int AS "contactCount"`,
      code,
      tenantId,
      layer,
    )) as Array<{ addressCount: number; contactCount: number }>;
    const addressCount = counts[0]?.addressCount ?? 0;
    const contactCount = counts[0]?.contactCount ?? 0;
    return {
      code: m.code,
      name: m.name ?? m.code,
      level: layer,
      geometry: m.geojson ? JSON.parse(String(m.geojson)) : null,
      addressCount,
      contactCount,
      withoutContacts: Math.max(0, addressCount - contactCount),
    };
  }

  /**
   * Union a mix of geographic sources — ASGS areas (mb/sa1-4), whole divisions
   * (ced/sed/lga), and free-drawn polygons — into one MultiPolygon. This one query
   * builds BOTH a campaign boundary and a turf cut. Drawn polygons are ST_MakeValid'd;
   * ST_CollectionExtract(…, 3) keeps polygons only. Returns null if nothing resolved.
   */
  async unionSources(sources: BoundarySource[], gnafPids: string[] = []): Promise<unknown | null> {
    const areaCodes = (layer: AreaLevel) =>
      JSON.stringify(
        sources
          .filter((s): s is Extract<BoundarySource, { kind: "area" }> => s.kind === "area" && s.layer === layer)
          .map((s) => s.code),
      );
    const divCodes = (type: DivisionType | "ste") =>
      JSON.stringify(
        sources
          .filter((s): s is Extract<BoundarySource, { kind: "division" }> => s.kind === "division" && s.type === type)
          .map((s) => s.code),
      );
    const polygons = JSON.stringify(
      sources
        .filter((s): s is Extract<BoundarySource, { kind: "polygon" }> => s.kind === "polygon")
        .map((s) => s.geometry),
    );
    // Individually-picked G-NAF doors join the union as ~55 m buffers (0.0005°),
    // so an address-stacked turf gets a real boundary that encloses them.
    const gnafPidsJson = JSON.stringify(gnafPids ?? []);
    const rows = (await this.prisma.$queryRawUnsafe(
      `WITH parts AS (
         SELECT geom FROM geo.meshblock WHERE mb_code IN (SELECT jsonb_array_elements_text($1::jsonb))
         UNION ALL SELECT geom FROM geo.sa1 WHERE code IN (SELECT jsonb_array_elements_text($2::jsonb))
         UNION ALL SELECT geom FROM geo.sa2 WHERE code IN (SELECT jsonb_array_elements_text($3::jsonb))
         UNION ALL SELECT geom FROM geo.sa3 WHERE code IN (SELECT jsonb_array_elements_text($4::jsonb))
         UNION ALL SELECT geom FROM geo.sa4 WHERE code IN (SELECT jsonb_array_elements_text($5::jsonb))
         UNION ALL SELECT geom FROM geo.ced WHERE code IN (SELECT jsonb_array_elements_text($6::jsonb))
         UNION ALL SELECT geom FROM geo.sed WHERE code IN (SELECT jsonb_array_elements_text($7::jsonb))
         UNION ALL SELECT geom FROM geo.lga WHERE code IN (SELECT jsonb_array_elements_text($8::jsonb))
         UNION ALL SELECT geom FROM geo.state WHERE code IN (SELECT jsonb_array_elements_text($11::jsonb))
         UNION ALL
           SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(je.value::text), 4326))
           FROM jsonb_array_elements($9::jsonb) AS je(value)
         UNION ALL
           SELECT ST_Buffer(geom, 0.0005) FROM geo.gnaf_address
           WHERE gnaf_pid IN (SELECT jsonb_array_elements_text($10::jsonb))
       )
       SELECT ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_Union(geom), 3))) AS geojson FROM parts`,
      areaCodes("mb"),
      areaCodes("sa1"),
      areaCodes("sa2"),
      areaCodes("sa3"),
      areaCodes("sa4"),
      divCodes("ced"),
      divCodes("sed"),
      divCodes("lga"),
      polygons,
      gnafPidsJson,
      divCodes("ste"),
    )) as Array<{ geojson: string | null }>;
    const geojson = rows[0]?.geojson;
    return geojson ? JSON.parse(geojson) : null;
  }

  /**
   * Union statistical areas + free-drawn polygons into a MultiPolygon (turf cut from a
   * mixed selection). Thin back-compat wrapper over {@link unionSources}.
   */
  async unionAreas(
    areas: Array<{ layer: string; code: string }>,
    polygons: unknown[] = [],
  ): Promise<unknown | null> {
    return this.unionSources([
      ...areas.map((a) => ({ kind: "area" as const, layer: a.layer as AreaLevel, code: a.code })),
      ...(polygons ?? []).map((geometry) => ({ kind: "polygon" as const, geometry })),
    ]);
  }

  /** Dataset provenance + row counts for /settings/data. */
  async status() {
    return this.prisma.$queryRawUnsafe(
      // row_count is bigint → cast to int so it serialises as a JS number, not a
      // BigInt (which JSON.stringify throws on → 500). National counts (~17M) fit int.
      `SELECT key, label, source_url AS "sourceUrl", release_date AS "releaseDate", licence,
              row_count::int AS "rowCount", status, last_ingested AS "lastIngested"
       FROM geo.dataset_meta ORDER BY key`,
    );
  }

  /**
   * Divisions of a type with total address counts, read from the precomputed
   * geo.region_address_count summary (refreshed by the geo ETL). The old query
   * GROUP-BY-aggregated all 16.9M address_region rows on EVERY call (seq scan,
   * EXPLAIN cost ~605k); this is a ≤548-row join to a tiny PK'd table.
   */
  async listDivisions(type: string) {
    const { table, type: kind } = this.table(type);
    return this.prisma.$queryRawUnsafe(
      `SELECT d.code, d.name, d.state, COALESCE(rac.address_count, 0)::int AS "addressCount"
       FROM ${table} d
       LEFT JOIN geo.region_address_count rac ON rac.kind = $1 AND rac.code = d.code
       ORDER BY d.name`,
      kind,
    );
  }

  /** The states + territories (derived geo.state layer) with total address counts —
   *  the divisions twin for the explorer's States kind. */
  async listStates() {
    return this.prisma.$queryRawUnsafe(
      `SELECT s.code, s.name, s.name AS state, COALESCE(rac.address_count, 0)::int AS "addressCount"
       FROM geo.state s
       LEFT JOIN geo.region_address_count rac ON rac.kind = 'state' AND rac.code = s.code
       ORDER BY s.name`,
    );
  }

  /** One state: boundary GeoJSON + total/contact/without-contact counts for an org.
   *  contactCount joins on the SA4 leading digit (states have no code column on
   *  address_region) — except Other Territories, which join on their SA3 code so
   *  the split territories count separately. Same return shape as divisionDetail. */
  async stateDetail(tenantId: string, code: string) {
    const meta = (await this.prisma.$queryRawUnsafe(
      `SELECT code, name, ST_AsGeoJSON(geom) AS geojson FROM geo.state WHERE code = $1`,
      code,
    )) as Array<Record<string, unknown>>;
    if (meta.length === 0) throw new ApiHttpException("STATE_NOT_FOUND", "State not found");
    const m = meta[0];
    const counts = (await this.prisma.$queryRawUnsafe(
      `SELECT
         COALESCE((SELECT address_count FROM geo.region_address_count WHERE kind = 'state' AND code = $1), 0)::int AS "addressCount",
         (SELECT COUNT(DISTINCT c."gnafPid")
            FROM "Contact" c
            JOIN geo.address_region ar ON ar.gnaf_pid = c."gnafPid"
            WHERE (CASE WHEN left(ar.sa4_code, 1) = '9' THEN ar.sa3_code ELSE left(ar.sa4_code, 1) END) = $1
              AND c."tenantId" = $2)::int AS "contactCount"`,
      code,
      tenantId,
    )) as Array<{ addressCount: number; contactCount: number }>;
    const addressCount = counts[0]?.addressCount ?? 0;
    const contactCount = counts[0]?.contactCount ?? 0;
    return {
      code: String(m.code),
      name: String(m.name),
      state: String(m.name),
      geometry: m.geojson ? JSON.parse(String(m.geojson)) : null,
      addressCount,
      contactCount,
      withoutContacts: Math.max(0, addressCount - contactCount),
    };
  }

  /** One division: boundary GeoJSON + total/contact/without-contact counts for an org. */
  async divisionDetail(tenantId: string, type: string, code: string) {
    const { table, col } = this.table(type);
    // Boundary + labels: a single row, cheap even for a metro LGA (ST_AsGeoJSON ≈ 30ms).
    const meta = (await this.prisma.$queryRawUnsafe(
      `SELECT code, name, state, ST_AsGeoJSON(geom) AS geojson FROM ${table} WHERE code = $1`,
      code,
    )) as Array<Record<string, unknown>>;
    if (meta.length === 0) throw new ApiHttpException("DIVISION_NOT_FOUND", "Division not found");
    const m = meta[0];
    // addressCount from the precomputed summary (PK lookup — a metro LGA used to
    // COUNT ~800k index entries per open); contactCount stays live because it is
    // tenant-scoped, backed by Contact_tenantId_gnafPid_idx.
    const counts = (await this.prisma.$queryRawUnsafe(
      `SELECT
         COALESCE((SELECT address_count FROM geo.region_address_count WHERE kind = $3 AND code = $1), 0)::int AS "addressCount",
         (SELECT COUNT(DISTINCT c."gnafPid")
            FROM "Contact" c
            JOIN geo.address_region ar ON ar.gnaf_pid = c."gnafPid"
            WHERE ar.${col} = $1 AND c."tenantId" = $2)::int AS "contactCount"`,
      code,
      tenantId,
      type,
    )) as Array<{ addressCount: number; contactCount: number }>;
    const addressCount = counts[0]?.addressCount ?? 0;
    const contactCount = counts[0]?.contactCount ?? 0;
    return {
      code: m.code,
      name: m.name,
      state: m.state,
      geometry: m.geojson ? JSON.parse(String(m.geojson)) : null,
      addressCount,
      contactCount,
      withoutContacts: Math.max(0, addressCount - contactCount),
    };
  }

  /**
   * Addresses inside a division (or a turf polygon), optionally only those with no Contact
   * for the org — the "addresses without contacts" canvassing universe.
   */
  async addresses(
    tenantId: string,
    opts: {
      divisionType?: string;
      divisionCode?: string;
      turfId?: string;
      withoutContacts?: boolean;
      limit?: number;
    },
  ) {
    const limit = Math.min(Math.max(1, Number.isFinite(opts.limit as number) ? (opts.limit as number) : 500), 5000);
    const noContact = opts.withoutContacts
      ? `AND c."gnafPid" IS NULL`
      : "";
    const join = `LEFT JOIN "Contact" c ON c."gnafPid" = a.gnaf_pid AND c."tenantId" = $1`;

    if (opts.turfId) {
      // ST_Contains against the drawn turf polygon (GeoJSON stored on Turf.geometry).
      const turf = (await this.prisma.$queryRawUnsafe(
        // Turf lives in the `canvass` schema (multiSchema) — the raw-query connection's
        // search_path doesn't include it, so it MUST be qualified. Unqualified "Turf"
        // throws 42P01 (relation does not exist), which aborted loadUniverseIntoTurf and
        // silently left every cut turf with zero bucketed cold doors.
        `SELECT geometry FROM canvass."Turf" WHERE id = $1 AND "tenantId" = $2`,
        opts.turfId,
        tenantId,
      )) as Array<{ geometry: unknown }>;
      if (turf.length === 0) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
      const geojson = JSON.stringify(turf[0].geometry);
      return this.prisma.$queryRawUnsafe(
        `SELECT a.gnaf_pid AS "gnafPid", a.address_label AS address, a.lat, a.lng
         FROM geo.gnaf_address a
         ${join}
         WHERE ST_Contains(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)), a.geom) ${noContact}
         LIMIT ${limit}`,
        tenantId,
        geojson,
      );
    }

    const { col } = this.table(opts.divisionType ?? "ced");
    if (!opts.divisionCode) throw new ApiHttpException("MISSING_DIVISION", "divisionCode required");
    return this.prisma.$queryRawUnsafe(
      `SELECT a.gnaf_pid AS "gnafPid", a.address_label AS address, a.lat, a.lng
       FROM geo.address_region ar
       JOIN geo.gnaf_address a ON a.gnaf_pid = ar.gnaf_pid
       ${join.replace("a.gnaf_pid", "ar.gnaf_pid")}
       WHERE ar.${col} = $2 ${noContact}
       LIMIT ${limit}`,
      tenantId,
      opts.divisionCode,
    );
  }

  /**
   * The nearest G-NAF addresses to a point (KNN on the gnaf_geom_gix GIST
   * index — fast at 16.9M rows), with each address's electorates + ASGS codes
   * and whether it already maps to a contact. Backs the Addresses page: a
   * geocoded search pin fans out to the real doors around it.
   */
  async nearbyAddresses(
    tenantId: string,
    opts: { lat: number; lng: number; limit?: number },
  ) {
    if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) {
      throw new ApiHttpException("INVALID_POINT", "lat and lng are required numbers");
    }
    const limit = Math.min(Math.max(1, Number.isFinite(opts.limit as number) ? (opts.limit as number) : 25), 200);
    return this.prisma.$queryRawUnsafe(
      `SELECT a.gnaf_pid AS "gnafPid",
              a.address_label AS address,
              a.state,
              a.lat,
              a.lng,
              ROUND((a.geom::geography <-> ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography)::numeric) AS "distanceM",
              ar.ced_code AS "cedCode",
              ced.name    AS "cedName",
              ar.sed_code AS "sedCode",
              sed.name    AS "sedName",
              ar.sa1_code AS "sa1Code",
              ar.sa2_code AS "sa2Code",
              ar.sa3_code AS "sa3Code",
              ar.sa4_code AS "sa4Code",
              ar.lga_code AS "lgaCode",
              (c."gnafPid" IS NOT NULL) AS "hasContact"
       FROM geo.gnaf_address a
       LEFT JOIN geo.address_region ar ON ar.gnaf_pid = a.gnaf_pid
       LEFT JOIN geo.ced ced ON ced.code = ar.ced_code
       LEFT JOIN geo.sed sed ON sed.code = ar.sed_code
       LEFT JOIN "Contact" c ON c."gnafPid" = a.gnaf_pid AND c."tenantId" = $1
       ORDER BY a.geom <-> ST_SetSRID(ST_MakePoint($3, $2), 4326)
       LIMIT ${limit}`,
      tenantId,
      opts.lat,
      opts.lng,
    );
  }

  // ── Containment hierarchy (state → SA4 → … → meshblock → address, + divisions) ──

  private q(sql: string, ...params: unknown[]) {
    return this.prisma.$queryRawUnsafe(sql, ...params) as Promise<Array<Record<string, unknown>>>;
  }

  /** National address count for a region (PK lookup on the summary table). */
  private async countOf(kind: RegionKind, code: string): Promise<number> {
    if (kind === "address") return 0;
    const r = await this.q(
      `SELECT COALESCE(address_count, 0)::int AS n FROM geo.region_address_count WHERE kind = $1 AND code = $2`,
      kind,
      code,
    );
    return (r[0]?.n as number) ?? 0;
  }

  private async stateRef(digit: string): Promise<RegionRef | null> {
    const r = await this.q(`SELECT name FROM geo.state WHERE code = $1`, digit);
    return r.length ? { kind: "state", code: digit, name: r[0].name as string } : null;
  }

  /**
   * The explorer's state code for an address/area: the ASGS state digit for the
   * eight states + NT/ACT, but the SA3 code for Other Territories (leading digit
   * 9) — so Christmas Is./Cocos/Jervis Bay/Norfolk Is. are separate selectable
   * states, not one lumped "Other Territories". Mirrors the geo:map state split.
   * Returns null when the state can't be resolved (e.g. the OT umbrella SA4, which
   * spans all four territories, has no single SA3).
   */
  private stateCodeOf(sa4Code?: string | null, sa3Code?: string | null): string | null {
    if (!sa4Code) return null;
    const digit = String(sa4Code).slice(0, 1);
    return digit === "9" ? (sa3Code ? String(sa3Code) : null) : digit;
  }

  /** {@link stateRef} for a region, resolving the OT split via {@link stateCodeOf}. */
  private async stateRefFor(sa4Code?: unknown, sa3Code?: unknown): Promise<RegionRef | null> {
    const code = this.stateCodeOf(
      sa4Code == null ? null : String(sa4Code),
      sa3Code == null ? null : String(sa3Code),
    );
    return code ? this.stateRef(code) : null;
  }

  /** One region's own ref (name + national address count). */
  private async regionRef(kind: RegionKind, code: string): Promise<RegionRef | null> {
    if (kind === "address") {
      const r = await this.q(`SELECT address_label AS name FROM geo.gnaf_address WHERE gnaf_pid = $1`, code);
      return r.length ? { kind, code, name: (r[0].name as string) ?? code } : null;
    }
    if (kind === "state") {
      const r = await this.q(`SELECT name FROM geo.state WHERE code = $1`, code);
      return r.length ? { kind, code, name: r[0].name as string, addressCount: await this.countOf("state", code) } : null;
    }
    if (kind === "ced" || kind === "sed" || kind === "lga") {
      const r = await this.q(`SELECT name FROM geo.${kind} WHERE code = $1`, code);
      return r.length ? { kind, code, name: r[0].name as string, addressCount: await this.countOf(kind, code) } : null;
    }
    // ASGS area kinds (meshblock has no name column → fall back to its code).
    const { table, codeCol } = this.areaTable(kind);
    const nameSel = kind === "mb" ? codeCol : "COALESCE(name, code)";
    const r = await this.q(`SELECT ${nameSel} AS name FROM ${table} WHERE ${codeCol} = $1`, code);
    return r.length ? { kind, code, name: (r[0].name as string) ?? code, addressCount: await this.countOf(kind, code) } : null;
  }

  /** The chain of regions that CONTAIN this one, coarsest→finest (state first). */
  private async regionParents(kind: RegionKind, code: string): Promise<RegionRef[]> {
    const ref = (k: RegionKind, c: unknown, n: unknown): RegionRef | null =>
      c ? { kind: k, code: String(c), name: (n as string) ?? String(c) } : null;
    const compact = (arr: Array<RegionRef | null>) => arr.filter((x): x is RegionRef => !!x);

    switch (kind) {
      case "state":
        return [];
      case "ced":
      case "sed":
      case "lga": {
        const r = await this.q(`SELECT state FROM geo.${kind} WHERE code = $1`, code);
        const name = r[0]?.state as string | undefined;
        if (!name) return [];
        const st = await this.q(`SELECT code, name FROM geo.state WHERE name = $1`, name);
        return st.length ? compact([ref("state", st[0].code, st[0].name)]) : [];
      }
      case "sa4": {
        const s = await this.stateRef(code.slice(0, 1));
        return s ? [s] : [];
      }
      case "sa3": {
        const r = await this.q(
          `SELECT s4.code s4, COALESCE(s4.name, s4.code) s4n
           FROM geo.sa3 s3 JOIN geo.sa4 s4 ON s4.code = s3.sa4_code WHERE s3.code = $1`,
          code,
        );
        const row = r[0];
        const st = row ? await this.stateRefFor(row.s4, code) : null;
        return compact([st, ref("sa4", row?.s4, row?.s4n)]);
      }
      case "sa2": {
        const r = await this.q(
          `SELECT s3.code s3, COALESCE(s3.name, s3.code) s3n, s4.code s4, COALESCE(s4.name, s4.code) s4n
           FROM geo.sa2 s2 JOIN geo.sa3 s3 ON s3.code = s2.sa3_code JOIN geo.sa4 s4 ON s4.code = s3.sa4_code
           WHERE s2.code = $1`,
          code,
        );
        const row = r[0];
        const st = row ? await this.stateRefFor(row.s4, row.s3) : null;
        return compact([st, ref("sa4", row?.s4, row?.s4n), ref("sa3", row?.s3, row?.s3n)]);
      }
      case "sa1": {
        const r = await this.q(
          `SELECT s2.code s2, COALESCE(s2.name, s2.code) s2n, s3.code s3, COALESCE(s3.name, s3.code) s3n,
                  s4.code s4, COALESCE(s4.name, s4.code) s4n
           FROM geo.sa1 s1 JOIN geo.sa2 s2 ON s2.code = s1.sa2_code JOIN geo.sa3 s3 ON s3.code = s2.sa3_code
           JOIN geo.sa4 s4 ON s4.code = s3.sa4_code WHERE s1.code = $1`,
          code,
        );
        const row = r[0];
        const st = row ? await this.stateRefFor(row.s4, row.s3) : null;
        return compact([st, ref("sa4", row?.s4, row?.s4n), ref("sa3", row?.s3, row?.s3n), ref("sa2", row?.s2, row?.s2n)]);
      }
      case "mb": {
        const r = await this.q(
          `SELECT m.sa1_code, COALESCE(s1.name, s1.code) s1n, m.sa2_code, COALESCE(s2.name, s2.code) s2n,
                  m.sa3_code, COALESCE(s3.name, s3.code) s3n, m.sa4_code, COALESCE(s4.name, s4.code) s4n,
                  m.lga_code, l.name lgan
           FROM geo.meshblock m
           LEFT JOIN geo.sa1 s1 ON s1.code = m.sa1_code
           LEFT JOIN geo.sa2 s2 ON s2.code = m.sa2_code
           LEFT JOIN geo.sa3 s3 ON s3.code = m.sa3_code
           LEFT JOIN geo.sa4 s4 ON s4.code = m.sa4_code
           LEFT JOIN geo.lga l ON l.code = m.lga_code
           WHERE m.mb_code = $1`,
          code,
        );
        const row = r[0];
        if (!row) return [];
        const st = row.sa4_code ? await this.stateRefFor(row.sa4_code, row.sa3_code) : null;
        return compact([
          st,
          ref("sa4", row.sa4_code, row.s4n),
          ref("sa3", row.sa3_code, row.s3n),
          ref("sa2", row.sa2_code, row.s2n),
          ref("sa1", row.sa1_code, row.s1n),
          ref("lga", row.lga_code, row.lgan),
        ]);
      }
      case "address": {
        const r = await this.q(
          `SELECT ar.mb_code, ar.sa1_code, COALESCE(s1.name, s1.code) s1n, ar.sa2_code, COALESCE(s2.name, s2.code) s2n,
                  ar.sa3_code, COALESCE(s3.name, s3.code) s3n, ar.sa4_code, COALESCE(s4.name, s4.code) s4n,
                  ar.ced_code, ced.name cedn, ar.sed_code, sed.name sedn, ar.lga_code, l.name lgan
           FROM geo.address_region ar
           LEFT JOIN geo.sa1 s1 ON s1.code = ar.sa1_code
           LEFT JOIN geo.sa2 s2 ON s2.code = ar.sa2_code
           LEFT JOIN geo.sa3 s3 ON s3.code = ar.sa3_code
           LEFT JOIN geo.sa4 s4 ON s4.code = ar.sa4_code
           LEFT JOIN geo.ced ced ON ced.code = ar.ced_code
           LEFT JOIN geo.sed sed ON sed.code = ar.sed_code
           LEFT JOIN geo.lga l ON l.code = ar.lga_code
           WHERE ar.gnaf_pid = $1`,
          code,
        );
        const row = r[0];
        if (!row) return [];
        const st = row.sa4_code ? await this.stateRefFor(row.sa4_code, row.sa3_code) : null;
        return compact([
          st,
          ref("sa4", row.sa4_code, row.s4n),
          ref("sa3", row.sa3_code, row.s3n),
          ref("sa2", row.sa2_code, row.s2n),
          ref("sa1", row.sa1_code, row.s1n),
          ref("mb", row.mb_code, row.mb_code),
          ref("ced", row.ced_code, row.cedn),
          ref("sed", row.sed_code, row.sedn),
          ref("lga", row.lga_code, row.lgan),
        ]);
      }
      default:
        return [];
    }
  }

  /** The regions this one immediately CONTAINS, grouped by child kind. */
  private async regionChildren(kind: RegionKind, code: string, region: RegionRef): Promise<RegionHierarchy["childGroups"]> {
    const groups: RegionHierarchy["childGroups"] = [];

    const areaGroup = async (childKind: RegionKind, whereExpr: string, label: string) => {
      const { table, codeCol } = this.areaTable(childKind);
      const nameSel = childKind === "mb" ? `${table}.${codeCol}` : `COALESCE(${table}.name, ${table}.code)`;
      const rows = await this.q(
        `SELECT ${table}.${codeCol} AS code, ${nameSel} AS name, COALESCE(rac.address_count, 0)::int AS "addressCount"
         FROM ${table}
         LEFT JOIN geo.region_address_count rac ON rac.kind = '${childKind}' AND rac.code = ${table}.${codeCol}
         WHERE ${whereExpr} ORDER BY 2 LIMIT ${CHILD_ROW_CAP}`,
        code,
      );
      if (rows.length) {
        groups.push({
          kind: childKind,
          label,
          total: rows.length,
          rows: rows.map((r) => ({ kind: childKind, code: String(r.code), name: String(r.name), addressCount: Number(r.addressCount) })),
        });
      }
    };

    const divGroup = async (divKind: "ced" | "sed" | "lga", label: string) => {
      const rows = await this.q(
        `SELECT d.code, d.name, COALESCE(rac.address_count, 0)::int AS "addressCount"
         FROM geo.${divKind} d LEFT JOIN geo.region_address_count rac ON rac.kind = '${divKind}' AND rac.code = d.code
         WHERE d.state = $1 ORDER BY d.name LIMIT ${CHILD_ROW_CAP}`,
        region.name,
      );
      if (rows.length) {
        groups.push({
          kind: divKind,
          label,
          total: rows.length,
          rows: rows.map((r) => ({ kind: divKind, code: String(r.code), name: String(r.name), addressCount: Number(r.addressCount) })),
        });
      }
    };

    const addressGroup = async (col: string) => {
      const total = await this.countOf(kind, code);
      const rows = await this.q(
        `SELECT a.gnaf_pid AS code, a.address_label AS name
         FROM geo.address_region ar JOIN geo.gnaf_address a ON a.gnaf_pid = ar.gnaf_pid
         WHERE ar.${col} = $1 ORDER BY a.address_label LIMIT ${CHILD_ROW_CAP}`,
        code,
      );
      groups.push({
        kind: "address",
        label: "Addresses",
        total,
        rows: rows.map((r) => ({ kind: "address" as const, code: String(r.code), name: String(r.name ?? r.code) })),
      });
    };

    switch (kind) {
      case "state":
        await areaGroup("sa4", `left(geo.sa4.code, 1) = $1`, "SA4 regions");
        await divGroup("ced", "Federal electorates (CED)");
        await divGroup("sed", "State electorates (SED)");
        await divGroup("lga", "Local government areas (LGA)");
        break;
      case "sa4":
        await areaGroup("sa3", `geo.sa3.sa4_code = $1`, "SA3 regions");
        break;
      case "sa3":
        await areaGroup("sa2", `geo.sa2.sa3_code = $1`, "SA2 regions");
        break;
      case "sa2":
        await areaGroup("sa1", `geo.sa1.sa2_code = $1`, "SA1 regions");
        break;
      case "sa1":
        await areaGroup("mb", `geo.meshblock.sa1_code = $1`, "Meshblocks");
        break;
      case "mb":
        await addressGroup("mb_code");
        break;
      case "ced":
        await addressGroup("ced_code");
        break;
      case "sed":
        await addressGroup("sed_code");
        break;
      case "lga":
        await addressGroup("lga_code");
        break;
      case "address":
        break;
    }
    return groups;
  }

  /** One region's place in the containment tree: what contains it + what it contains. */
  async regionHierarchy(kind: string, code: string): Promise<RegionHierarchy> {
    const k = kind as RegionKind;
    if (!REGION_KINDS.has(k)) throw new ApiHttpException("BAD_REGION_KIND", "unknown region kind");
    if (!code) throw new ApiHttpException("MISSING_CODE", "code is required");
    const region = await this.regionRef(k, code);
    if (!region) throw new ApiHttpException("REGION_NOT_FOUND", "Region not found");
    const [parents, childGroups] = await Promise.all([
      this.regionParents(k, code),
      this.regionChildren(k, code, region),
    ]);
    return { region, parents, childGroups };
  }
}
