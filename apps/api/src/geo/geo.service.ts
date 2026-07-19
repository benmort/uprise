/// <reference path="./vt-pbf.d.ts" />
import { Injectable } from "@nestjs/common";
import geojsonvt from "geojson-vt";
import { fromGeojsonVt } from "vt-pbf";
import type { FeatureCollection, Geometry } from "geojson";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

/** Source table + code/name columns for a tileable geo layer (areas, divisions, state). */
/**
 * Every region kind that has a geometry table, and how to read its code + name from it.
 *
 * Serves the vector tiles, and doubles as the kind → geometry map for `geo:density`
 * (`ST_Area(geom::geography)`). Exported so that script cannot keep a second copy that
 * drifts from this one.
 */
export const TILE_SOURCE: Record<string, { table: string; codeCol: string; nameExpr: string }> = {
  mb: { table: "geo.meshblock", codeCol: "mb_code", nameExpr: "COALESCE(name, mb_code)" },
  sa1: { table: "geo.sa1", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa2: { table: "geo.sa2", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa3: { table: "geo.sa3", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa4: { table: "geo.sa4", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  ced: { table: "geo.ced", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sed: { table: "geo.sed", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sed_lower: { table: "geo.sed_lower", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sed_upper: { table: "geo.sed_upper", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  lga: { table: "geo.lga", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  ward: { table: "geo.ward", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  // First Nations (ABS Indigenous Structure) — tileable, but never turf-cuttable.
  ireg: { table: "geo.ireg", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  iare: { table: "geo.iare", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  iloc: { table: "geo.iloc", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  state: { table: "geo.state", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  chamber_electorate: { table: "geo.chamber_electorate", codeCol: "code", nameExpr: "COALESCE(name, code)" },
};

/**
 * A division layer keyed by an `address_region` column — so every one of these supports
 * per-address lookups, address counts and turf-cutting uniformly.
 *
 * `sed` is the raw ABS layer, kept exactly as shipped. `sed_lower`/`sed_upper` are the
 * chamber-pure layers derived from it: ABS encodes the upper-house division in the
 * parenthetical of the name, so Victoria's 8 Legislative Council regions and Tasmania's
 * 15 Legislative Council divisions fall out of a dissolve. Tasmania's raw `sed` rows are
 * House-of-Assembly × Legislative-Council intersection CELLS and belong to neither
 * chamber — `sed_lower` is what a Tasmanian seat actually is.
 *
 * The Senate and the NSW/SA/WA Legislative Councils are deliberately NOT here: they have
 * no sub-state boundaries and therefore no address_region column. See chamberElectorate*.
 */
export type DivisionType = "ced" | "sed" | "sed_lower" | "sed_upper" | "lga" | "ward";
const DIVISION_TABLE: Record<DivisionType, string> = {
  ced: "geo.ced",
  sed: "geo.sed",
  sed_lower: "geo.sed_lower",
  sed_upper: "geo.sed_upper",
  lga: "geo.lga",
  ward: "geo.ward",
};
const REGION_COL: Record<DivisionType, string> = {
  ced: "ced_code",
  sed: "sed_code",
  sed_lower: "sed_lower_code",
  sed_upper: "sed_upper_code",
  lga: "lga_code",
  ward: "ward_code",
};

/** The geo table backing each division layer. Exported so turf-cutting resolves the same
 *  table this service does, instead of keeping its own copy of the mapping. */
export const DIVISION_TABLES: Readonly<Record<DivisionType, string>> = DIVISION_TABLE;
/** Wire values a division layer may take — the single source of truth for DTO validation. */
export const DIVISION_TYPES = Object.keys(DIVISION_TABLE) as DivisionType[];
/** Division layers a turf/boundary source may reference, plus the two whole-jurisdiction
 *  layers: `ste` (a state/territory) and `chamber_electorate` (Senate, state-wide councils). */
export const TURF_DIVISION_TYPES = [...DIVISION_TYPES, "ste", "chamber_electorate"] as const;
export type TurfDivisionType = (typeof TURF_DIVISION_TYPES)[number];

/** ASGS statistical-area levels selectable on the turf-cut map — the full
 *  hierarchy Mesh Block → SA1 → SA2 → SA3 → SA4. */
export type AreaLevel = "mb" | "sa1" | "sa2" | "sa3" | "sa4";
const AREA_TABLE: Record<AreaLevel, { table: string; codeCol: string; nameExpr: string }> = {
  // Mesh blocks are named by the geo:names backfill (suburb + compass, e.g. "Fitzroy North · SE");
  // fall back to the code for any row not yet named.
  mb: { table: "geo.meshblock", codeCol: "mb_code", nameExpr: "COALESCE(name, mb_code)" },
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
  | { kind: "division"; type: DivisionType | "ste" | "chamber_electorate"; code: string }
  | { kind: "area"; layer: AreaLevel; code: string }
  | { kind: "polygon"; geometry: unknown };

/** A {@link BoundarySource} resolved to its human name for display — `key` is the
 *  {@link TILE_SOURCE} layer key (a division's `ste` maps to `state`); a drawn polygon
 *  has no code or name. See {@link GeoService.describeSources}. */
export type DescribedSource =
  | { kind: "division" | "area"; key: string; code: string; name: string }
  | { kind: "polygon"; key: "polygon"; name: null };

/**
 * Every layer a boundary source can union from, declared once so the CTE branches and
 * their positional params can never drift apart (they used to be hand-numbered $1..$11).
 * `key` is the wire value on BoundarySource; order here is irrelevant.
 */
const UNION_SOURCES: ReadonlyArray<{ table: string; codeCol: string; kind: "area" | "division"; key: string }> = [
  { table: "geo.meshblock", codeCol: "mb_code", kind: "area", key: "mb" },
  { table: "geo.sa1", codeCol: "code", kind: "area", key: "sa1" },
  { table: "geo.sa2", codeCol: "code", kind: "area", key: "sa2" },
  { table: "geo.sa3", codeCol: "code", kind: "area", key: "sa3" },
  { table: "geo.sa4", codeCol: "code", kind: "area", key: "sa4" },
  { table: "geo.ced", codeCol: "code", kind: "division", key: "ced" },
  { table: "geo.sed", codeCol: "code", kind: "division", key: "sed" },
  { table: "geo.sed_lower", codeCol: "code", kind: "division", key: "sed_lower" },
  { table: "geo.sed_upper", codeCol: "code", kind: "division", key: "sed_upper" },
  { table: "geo.lga", codeCol: "code", kind: "division", key: "lga" },
  { table: "geo.ward", codeCol: "code", kind: "division", key: "ward" },
  { table: "geo.state", codeCol: "code", kind: "division", key: "ste" },
  { table: "geo.chamber_electorate", codeCol: "code", kind: "division", key: "chamber_electorate" },
];

/**
 * The ABS ASGS Indigenous Structure — a REFERENCE-ONLY layer family.
 *
 * Deliberately absent from `DivisionType`, `DIVISION_TABLE`, `TURF_DIVISION_TYPES` and
 * `UNION_SOURCES`: an organiser must not be able to cut a doorknocking turf from an
 * Indigenous Area, nor stack one into a campaign boundary. A unit test pins this.
 *
 * These are STATISTICAL geographies, not cultural, language or nation boundaries. `iloc`
 * carries both parent codes denormalised straight from the ABS row, so a single
 * address → ILOC spatial join attributes all three levels.
 */
export type FirstNationsLevel = "ireg" | "iare" | "iloc";
const FN_TABLE: Record<FirstNationsLevel, { table: string; regionCol: string; label: string }> = {
  ireg: { table: "geo.ireg", regionCol: "ireg_code", label: "Indigenous Regions" },
  iare: { table: "geo.iare", regionCol: "iare_code", label: "Indigenous Areas" },
  iloc: { table: "geo.iloc", regionCol: "iloc_code", label: "Indigenous Locations" },
};
export const FIRST_NATIONS_LEVELS = Object.keys(FN_TABLE) as FirstNationsLevel[];
const isFnLevel = (k: string): k is FirstNationsLevel =>
  Object.prototype.hasOwnProperty.call(FN_TABLE, k);

/**
 * A URL-friendly key derived from the name: "Sydney - Wollongong" → "sydney-wollongong".
 * Derived in SQL rather than stored, because names are unique at every level (40/412/1,120,
 * verified) and the tables are small enough that a seq scan to resolve one is free.
 * `apps/admin/src/lib/canvass/first-nations.ts#firstNationsSlug` mirrors this exactly.
 *
 * Takes the column EXPLICITLY: any query that joins geo.region_address_count has two `code`
 * columns and (for the area layers) two candidate `name`s, so a bare identifier is ambiguous
 * and Postgres rejects the whole statement.
 */
const fnSlug = (col: string) => `btrim(lower(regexp_replace(${col}, '[^a-zA-Z0-9]+', '-', 'g')), '-')`;

/** A node in the geo containment tree. `state` is the top; `address` (a G-NAF
 *  door) is the leaf; the division kinds hang under their state as parallel branches. */
export type RegionKind =
  | "state"
  | "ced"
  | "sed"
  | "sed_lower"
  | "sed_upper"
  | "lga"
  | "ward"
  | "ireg"
  | "iare"
  | "iloc"
  | "sa4"
  | "sa3"
  | "sa2"
  | "sa1"
  | "mb"
  | "address";
export type RegionRef = { kind: RegionKind; code: string; name: string; addressCount?: number };
/** One region's place in the tree: what contains it (coarsest→finest) and what it
 *  immediately contains (grouped by child kind, each capped with a real `total`). */
export type RegionHierarchy = {
  region: RegionRef;
  parents: RegionRef[];
  childGroups: Array<{ kind: RegionKind; label: string; total: number; rows: RegionRef[] }>;
};

const REGION_KINDS = new Set<RegionKind>([
  "state", "ced", "sed", "sed_lower", "sed_upper", "lga", "ward",
  "ireg", "iare", "iloc",
  "sa4", "sa3", "sa2", "sa1", "mb", "address",
]);
/** Cap on inlined child rows (esp. addresses); `total` always carries the real count. */
const CHILD_ROW_CAP = 200;

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Map-driven so a new division layer can never be added to DIVISION_TABLE and then
   *  silently rejected here (the old hardcoded chain drifted by construction). */
  private table(type: string): { table: string; col: string; type: DivisionType } {
    if (!Object.prototype.hasOwnProperty.call(DIVISION_TABLE, type)) {
      throw new ApiHttpException("BAD_DIVISION_TYPE", `type must be one of ${Object.keys(DIVISION_TABLE).join(", ")}`);
    }
    const t = type as DivisionType;
    return { table: DIVISION_TABLE[t], col: REGION_COL[t], type: t };
  }

  private areaTable(layer: string) {
    if (layer !== "mb" && layer !== "sa1" && layer !== "sa2" && layer !== "sa3" && layer !== "sa4") {
      throw new ApiHttpException("BAD_AREA_LEVEL", "layer must be mb, sa1, sa2, sa3 or sa4");
    }
    return AREA_TABLE[layer];
  }

  /** The First Nations twin of `table()`/`areaTable()`. Separate on purpose: these levels
   *  are NOT in DIVISION_TABLE, so they can never reach the turf-cutting code paths. */
  private fnTable(level: string) {
    if (!isFnLevel(level)) {
      throw new ApiHttpException("BAD_FN_LEVEL", `level must be one of ${FIRST_NATIONS_LEVELS.join(", ")}`);
    }
    return FN_TABLE[level];
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
  async tile(layer: string, z: number, x: number, y: number, metric?: string): Promise<Buffer> {
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
      tolerance > 0.00002 ? `ST_SimplifyPreserveTopology(d.geom, ${tolerance})` : "d.geom";
    // No feature cap — a tile holds every feature in its bbox so nothing truncates in
    // view. "Batching" is the vector-tile grid itself: mapbox requests the covering
    // tiles at the current zoom and renders each as it arrives, so a dense level loads
    // progressively rather than in one blocking chunk. The one runaway case (a whole
    // level's worth of meshblocks in a single low-zoom tile, ~368k) is kept off the
    // wire by the client's per-level minzoom floor, so that tile is never requested.
    //
    // Address density rides along on the feature. The alternative — shipping the client a
    // `["match", ["get","code"], …]` expression — would be 61,811 code/colour pairs at SA1
    // before a single tile rendered. One number per feature, already clipped to the
    // viewport, costs nothing. `NULLIF(area_km2, 0)` is what keeps a region with no
    // measured area reading as no-data rather than as infinity.
    //
    // Every column is table-qualified: `geo.region_address_count` also has a `code`, and an
    // unqualified one is the exact ambiguity that 500'd the First Nations browse. A spec
    // guard (`expectNoAmbiguousColumns`) fails this file if it comes back.
    // Optional ABS indicator value baked onto each feature (`value`) so SA1/meshblock choropleths
    // paint from the tile — a client `["match", code, …]` can't carry 60k/360k pairs. `av.value`
    // is table-qualified (abs_value also has `code`) to satisfy the no-ambiguous-column guard.
    const metricSelect = metric ? `, av.value AS value` : "";
    const metricJoin = metric
      ? `LEFT JOIN geo.abs_value av ON av.level = $5 AND av.code = d.${src.codeCol} AND av.indicator_key = $6`
      : "";
    const params: unknown[] = [w, s, e, n, layer];
    if (metric) params.push(metric);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT d.${src.codeCol} AS code,
              COALESCE(d.name, d.${src.codeCol}) AS name,
              (rac.address_count / NULLIF(rac.area_km2, 0)) AS density${metricSelect},
              ST_AsGeoJSON(${geomExpr}) AS geojson
         FROM ${src.table} d
         LEFT JOIN geo.region_address_count rac
                ON rac.kind = $5 AND rac.code = d.${src.codeCol}
         ${metricJoin}
        WHERE d.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`,
      ...params,
    )) as Array<{ code: string; name: string | null; density: number | null; value?: number | null; geojson: string }>;
    if (rows.length === 0) return Buffer.alloc(0);
    const fc: FeatureCollection = {
      type: "FeatureCollection",
      features: rows.map((r) => {
        // Omit null props, don't encode them: MVT can't hold null, and a missing property already
        // reads back as null from `["get", …]` in a style expression.
        const properties: Record<string, unknown> = { code: r.code, name: r.name ?? r.code };
        if (r.density !== null && r.density !== undefined) properties.density = r.density;
        if (metric && r.value !== null && r.value !== undefined) properties.value = r.value;
        return { type: "Feature" as const, geometry: JSON.parse(r.geojson) as Geometry, properties };
      }),
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

  /**
   * The colour breaks for a layer's density choropleth — four quantiles cutting five bands.
   *
   * Quantiles rather than equal-width bands, because address density is violently skewed:
   * across Australia's 547 LGAs the 20th percentile is 0.4 addresses/km², the 80th is 242.9,
   * and the maximum is 9,611. Five equal-width bands over that range would paint about
   * ninety-nine percent of the country a single colour and tell the reader nothing.
   *
   * Computed nationally, not per viewport, so a colour means the same density wherever the
   * map is panned. Regions with no measured area are excluded rather than counted as zero.
   */
  async densityScale(layer: string): Promise<{
    kind: string;
    regions: number;
    min: number | null;
    max: number | null;
    breaks: number[];
  }> {
    this.tileSource(layer); // validates the layer, throws BAD_TILE_LAYER otherwise

    const [row] = (await this.prisma.$queryRawUnsafe(
      `WITH d AS (
         SELECT address_count / NULLIF(area_km2, 0) AS v
           FROM geo.region_address_count
          WHERE kind = $1 AND area_km2 > 0
       )
       SELECT count(*)::int AS regions,
              min(v) AS min,
              max(v) AS max,
              percentile_cont(ARRAY[0.2, 0.4, 0.6, 0.8]) WITHIN GROUP (ORDER BY v) AS breaks
         FROM d`,
      layer,
    )) as Array<{ regions: number; min: number | null; max: number | null; breaks: number[] | null }>;

    return {
      kind: layer,
      regions: row?.regions ?? 0,
      min: row?.min ?? null,
      max: row?.max ?? null,
      // No areas measured yet (geo:density unrun) → no breaks, and the client paints
      // every region as no-data rather than inventing a scale.
      breaks: row?.breaks ?? [],
    };
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
    // the SELECT only. Mesh blocks now carry a name (trigram-indexed), so every
    // level searches code OR name.
    const params: unknown[] = [term];
    const clauses = [`(${codeCol} ILIKE $1 OR name ILIKE $1)`];
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
    const { table, codeCol } = this.areaTable(layer);
    const lim = Math.min(Math.max(1, opts.limit ?? 20), 100);
    const off = Math.max(0, opts.offset ?? 0);
    const params: unknown[] = [];
    const clauses: string[] = [];
    const q = (opts.q ?? "").trim();
    // Alias-qualified throughout. The row query joins geo.region_address_count, which also
    // has a `code`, so an unqualified `code` — including the one inside AREA_TABLE's
    // `COALESCE(name, code)` nameExpr — is ambiguous and Postgres rejects the statement.
    // That made /geo/areas 500 for every sa1..sa4 browse; `mb` escaped it only because its
    // code column is `mb_code`.
    const nameSel = `COALESCE(d.name, d.${codeCol})`;
    if (q) {
      // Plain columns only, same trigram-index reasoning as searchAreas.
      params.push(`%${q}%`);
      clauses.push(`(d.${codeCol} ILIKE $${params.length} OR d.name ILIKE $${params.length})`);
    }
    if (opts.state && /^[1-9]$/.test(opts.state)) {
      params.push(`${opts.state}%`);
      clauses.push(`d.${codeCol} LIKE $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRawUnsafe(
        `SELECT d.${codeCol} AS code, ${nameSel} AS name,
                COALESCE(rac.address_count, 0)::int AS "addressCount"
         FROM ${table} d
         LEFT JOIN geo.region_address_count rac ON rac.kind = '${layer}' AND rac.code = d.${codeCol}
         ${where}
         ORDER BY d.${codeCol}
         LIMIT ${lim} OFFSET ${off}`,
        ...params,
      ) as Promise<Array<{ code: string; name: string | null; addressCount: number }>>,
      this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS total FROM ${table} d ${where}`,
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

  /** Total address count across a set of statistical areas. Addresses map to meshblocks
   *  (geo.address_region.mb_code, indexed); geo.meshblock carries each ASGS level's code, so SA
   *  counts route address → meshblock → sa<n>_code — the SA columns on address_region itself
   *  aren't populated. `mb` is counted directly. Powers the pre-cut "Selected areas" estimate. */
  async areaAddressCount(
    areas: Array<{ level: string; code: string }>,
  ): Promise<{ addresses: number; byArea: Record<string, number> }> {
    // Group codes by level; only mb / sa1–sa4 (the AREA_REGION_COL keys) are counted.
    const byLevel = new Map<AreaLevel, string[]>();
    for (const a of areas) {
      const level = a.level as AreaLevel;
      if (!a.code || !AREA_REGION_COL[level]) continue; // unknown level → skip (never interpolate an unvalidated column)
      const list = byLevel.get(level);
      if (list) list.push(a.code);
      else byLevel.set(level, [a.code]);
    }
    let total = 0;
    const byArea: Record<string, number> = {}; // keyed "<level>:<code>", so callers can label each row
    for (const [level, codes] of byLevel) {
      const col = AREA_REGION_COL[level]; // validated → a fixed column name (mb_code / sa1_code / …)
      const params: string[] = [];
      const ph = codes.map((c) => { params.push(c); return `$${params.length}`; }).join(",");
      // GROUP BY the level's code to get each area's own count as well as the sum. mb:
      // address_region carries mb_code directly. sa1–sa4: the meshblock carries the level
      // code, so join address_region → meshblock (mb_code indexed) and group by it.
      const sql =
        level === "mb"
          ? `SELECT ${col} AS code, COUNT(*)::bigint AS n FROM geo.address_region WHERE ${col} IN (${ph}) GROUP BY ${col}`
          : `SELECT m.${col} AS code, COUNT(*)::bigint AS n FROM geo.address_region a
               JOIN geo.meshblock m ON a.mb_code = m.mb_code
               WHERE m.${col} IN (${ph}) GROUP BY m.${col}`;
      const rows = (await this.prisma.$queryRawUnsafe(sql, ...params)) as Array<{ code: string; n: bigint | number }>;
      for (const r of rows) {
        const n = Number(r.n ?? 0);
        byArea[`${level}:${r.code}`] = n;
        total += n;
      }
    }
    return { addresses: total, byArea };
  }

  /**
   * Addresses inside an arbitrary boundary (a campaign's saved extent). Level-independent
   * and exact: count the addresses in every meshblock whose centroid falls inside the
   * boundary (each meshblock is tiny, so centroid-in is a clean "inside" test and never
   * double-counts). Summing whole intersecting SA areas would over-count at coarse levels;
   * this does not. Null boundary → 0.
   */
  async boundaryAddressCount(boundary: unknown): Promise<{ addresses: number }> {
    if (boundary == null) return { addresses: 0 };
    const geojson = JSON.stringify(boundary);
    const rows = (await this.prisma.$queryRawUnsafe(
      `WITH b AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS g)
       SELECT COUNT(*)::bigint AS n FROM geo.address_region ar
       WHERE ar.mb_code IN (
         SELECT m.mb_code FROM geo.meshblock m, b
         WHERE m.geom && b.g AND ST_Contains(b.g, ST_Centroid(m.geom))
       )`,
      geojson,
    )) as Array<{ n: bigint | number }>;
    return { addresses: Number(rows[0]?.n ?? 0) };
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
    // Single-table meta query, so column refs are unambiguous without an alias.
    // codeCol differs for mb (mb_code) vs sa1..sa4 (code); COALESCE falls back to it.
    const nameSel = `COALESCE(name, ${codeCol})`;
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
   * Resolve each boundary source to its human name for display — so a bounded campaign can
   * say WHAT it's cut from ("Melbourne · Federal electorate", "Fitzroy · SA2") rather than a
   * bare code. Divisions/areas are looked up by code in their layer table via {@link TILE_SOURCE};
   * a drawn polygon has no name. Input order is preserved.
   *
   * One query per distinct layer, not per source: a "3 divisions + 2 SA2s" boundary costs two
   * round-trips. Identifiers come only from the constant TILE_SOURCE map (never user input) and
   * codes bind as positional params, so the built-in IN-list carries no injection surface.
   */
  async describeSources(sources: BoundarySource[]): Promise<DescribedSource[]> {
    // TILE_SOURCE key for a source: an area's `layer` is already a key; a division's `type`
    // maps straight through except `ste`, whose geometry table is `state`.
    const keyOf = (s: BoundarySource): string | null =>
      s.kind === "area" ? s.layer : s.kind === "division" ? (s.type === "ste" ? "state" : s.type) : null;

    // Batch the codes to look up per layer key.
    const codesByKey = new Map<string, Set<string>>();
    for (const s of sources) {
      if (s.kind === "polygon") continue;
      const k = keyOf(s);
      if (!k || !TILE_SOURCE[k]) continue;
      if (!codesByKey.has(k)) codesByKey.set(k, new Set());
      codesByKey.get(k)!.add(s.code);
    }

    // `${key}:${code}` → resolved name. One IN-list query per layer.
    const names = new Map<string, string>();
    for (const [k, set] of codesByKey) {
      const { table, codeCol, nameExpr } = TILE_SOURCE[k];
      const codes = [...set];
      const placeholders = codes.map((_, i) => `$${i + 1}`).join(", ");
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT ${codeCol} AS code, ${nameExpr} AS name FROM ${table} WHERE ${codeCol} IN (${placeholders})`,
        ...codes,
      )) as Array<{ code: string; name: string | null }>;
      for (const r of rows) names.set(`${k}:${r.code}`, r.name ?? r.code);
    }

    return sources.map((s) => {
      if (s.kind === "polygon") return { kind: "polygon", key: "polygon", name: null };
      const k = keyOf(s) ?? (s.kind === "division" ? s.type : s.layer);
      const code = s.code;
      return { kind: s.kind, key: k, code, name: names.get(`${k}:${code}`) ?? code };
    });
  }

  /**
   * Union a mix of geographic sources — ASGS areas (mb/sa1-4), whole divisions
   * (ced/sed/lga), and free-drawn polygons — into one MultiPolygon. This one query
   * builds BOTH a campaign boundary and a turf cut. Drawn polygons are ST_MakeValid'd;
   * ST_CollectionExtract(…, 3) keeps polygons only. Returns null if nothing resolved.
   */
  async unionSources(sources: BoundarySource[], gnafPids: string[] = []): Promise<unknown | null> {
    // One CTE branch + one jsonb param per layer, generated from UNION_SOURCES so the
    // param numbering stays in lockstep with the branches no matter how many layers exist.
    const params: string[] = [];
    const branches: string[] = [];
    for (const src of UNION_SOURCES) {
      const codes = sources
        .filter((s) =>
          src.kind === "area"
            ? s.kind === "area" && s.layer === src.key
            : s.kind === "division" && s.type === src.key,
        )
        .map((s) => (s as { code: string }).code);
      params.push(JSON.stringify(codes));
      branches.push(
        `SELECT geom FROM ${src.table} WHERE ${src.codeCol} IN (SELECT jsonb_array_elements_text($${params.length}::jsonb))`,
      );
    }

    params.push(
      JSON.stringify(
        sources
          .filter((s): s is Extract<BoundarySource, { kind: "polygon" }> => s.kind === "polygon")
          .map((s) => s.geometry),
      ),
    );
    branches.push(
      `SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(je.value::text), 4326))
         FROM jsonb_array_elements($${params.length}::jsonb) AS je(value)`,
    );

    // Individually-picked G-NAF doors join the union as ~55 m buffers (0.0005°),
    // so an address-stacked turf gets a real boundary that encloses them.
    params.push(JSON.stringify(gnafPids ?? []));
    branches.push(
      `SELECT ST_Buffer(geom, 0.0005) FROM geo.gnaf_address
         WHERE gnaf_pid IN (SELECT jsonb_array_elements_text($${params.length}::jsonb))`,
    );

    const rows = (await this.prisma.$queryRawUnsafe(
      `WITH parts AS (
         ${branches.join("\n         UNION ALL ")}
       )
       SELECT ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_Union(geom), 3))) AS geojson FROM parts`,
      ...params,
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

  /**
   * The chamber catalogue: every level × jurisdiction × chamber, INCLUDING the ones that
   * do not exist. Queensland abolished its Legislative Council in 1922, the ACT and NT are
   * unicameral, local councils have no upper house, and the ACT has no local government at
   * all — a geometry table cannot say any of that, so the explorer reads it from here
   * rather than rendering a confusing empty tab.
   */
  async listChambers() {
    return this.prisma.$queryRawUnsafe(
      `SELECT key, jurisdiction, level, chamber, name, "exists",
              electorate_layer AS "electorateLayer", sub_electorate_layer AS "subElectorateLayer",
              member_count AS "memberCount", note
       FROM geo.chamber ORDER BY level, jurisdiction, chamber`,
    );
  }

  /** The state-wide chamber electorates (the Senate + the NSW/SA/WA Legislative Councils),
   *  whose boundary is the jurisdiction itself. The divisions twin for chambers that have
   *  no sub-state boundaries, so they carry no address_region column. */
  async listChamberElectorates() {
    return this.prisma.$queryRawUnsafe(
      `SELECT ce.code, ce.name, ce.state, ce.chamber_key AS "chamberKey",
              ce.member_count AS "memberCount",
              COALESCE(rac.address_count, 0)::int AS "addressCount"
       FROM geo.chamber_electorate ce
       LEFT JOIN geo.region_address_count rac ON rac.kind = 'chamber_electorate' AND rac.code = ce.code
       ORDER BY ce.name`,
    );
  }

  /** One state-wide chamber electorate. contactCount joins on the SAME SA4-derived state
   *  code stateDetail uses (Other Territories via their SA3), matched against the
   *  electorate's `state_codes` — the Senate's ACT contest absorbs Jervis Bay and Norfolk
   *  Is., and its NT contest absorbs Christmas Is. and Cocos. Shape mirrors divisionDetail. */
  async chamberElectorateDetail(tenantId: string, code: string) {
    const meta = (await this.prisma.$queryRawUnsafe(
      `SELECT code, name, state, chamber_key AS "chamberKey", member_count AS "memberCount",
              ST_AsGeoJSON(geom) AS geojson
       FROM geo.chamber_electorate WHERE code = $1`,
      code,
    )) as Array<Record<string, unknown>>;
    if (meta.length === 0) {
      throw new ApiHttpException("CHAMBER_ELECTORATE_NOT_FOUND", "Chamber electorate not found");
    }
    const m = meta[0];
    const counts = (await this.prisma.$queryRawUnsafe(
      `SELECT
         COALESCE((SELECT address_count FROM geo.region_address_count
                    WHERE kind = 'chamber_electorate' AND code = $1), 0)::int AS "addressCount",
         (SELECT COUNT(DISTINCT c."gnafPid")
            FROM "Contact" c
            JOIN geo.address_region ar ON ar.gnaf_pid = c."gnafPid"
            WHERE (CASE WHEN left(ar.sa4_code, 1) = '9' THEN ar.sa3_code ELSE left(ar.sa4_code, 1) END)
                  = ANY (SELECT unnest(state_codes) FROM geo.chamber_electorate WHERE code = $1)
              AND c."tenantId" = $2)::int AS "contactCount"`,
      code,
      tenantId,
    )) as Array<{ addressCount: number; contactCount: number }>;
    const addressCount = counts[0]?.addressCount ?? 0;
    const contactCount = counts[0]?.contactCount ?? 0;
    return {
      code: String(m.code),
      name: String(m.name),
      state: m.state == null ? null : String(m.state),
      chamberKey: String(m.chamberKey),
      memberCount: m.memberCount == null ? null : Number(m.memberCount),
      geometry: m.geojson ? JSON.parse(String(m.geojson)) : null,
      addressCount,
      contactCount,
      withoutContacts: Math.max(0, addressCount - contactCount),
    };
  }

  // ── First Nations (ABS Indigenous Structure) — reference-only ────────────────
  // A self-contained family, deliberately not routed through table()/DIVISION_TABLE, so
  // these levels can never be unioned into a campaign boundary or cut into a turf.

  /**
   * Paged browse over one Indigenous level's national set. ILOC is 1,120 rows, so it pages
   * (unlike listDivisions, which returns whole layers). Mirrors browseAreas: the page reads
   * on the PK index, the COUNT skips the address-count join.
   */
  async listFirstNations(level: string, opts: { q?: string; state?: string; limit?: number; offset?: number }) {
    const { table } = this.fnTable(level);
    const lim = Math.min(Math.max(1, opts.limit ?? 20), 100);
    const off = Math.max(0, opts.offset ?? 0);
    const params: unknown[] = [];
    const clauses: string[] = [];
    const q = (opts.q ?? "").trim();
    // Every column reference is alias-qualified: the row query joins
    // geo.region_address_count, which also has a `code`, so a bare `code` is ambiguous and
    // Postgres rejects the statement (this shipped as a 500 on `?state=` and `?q=`).
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(d.code ILIKE $${params.length} OR d.name ILIKE $${params.length})`);
    }
    // Codes are state-digit-prefixed at every level, so the state filter is a prefix match.
    if (opts.state && /^[1-9]$/.test(opts.state)) {
      params.push(`${opts.state}%`);
      clauses.push(`d.code LIKE $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRawUnsafe(
        `SELECT d.code, COALESCE(d.name, d.code) AS name, d.state, ${fnSlug("d.name")} AS slug,
                COALESCE(rac.address_count, 0)::int AS "addressCount"
         FROM ${table} d
         LEFT JOIN geo.region_address_count rac ON rac.kind = '${level}' AND rac.code = d.code
         ${where}
         ORDER BY d.name
         LIMIT ${lim} OFFSET ${off}`,
        ...params,
      ) as Promise<Array<{ code: string; name: string; state: string | null; slug: string; addressCount: number }>>,
      this.prisma.$queryRawUnsafe(
        // Aliased `d` so the shared `where` (which qualifies with `d.`) is valid here too.
        `SELECT COUNT(*)::int AS total FROM ${table} d ${where}`,
        ...params,
      ) as Promise<Array<{ total: number }>>,
    ]);
    return {
      rows: rows.map((r) => ({
        level,
        code: r.code,
        name: r.name,
        state: r.state,
        slug: r.slug,
        addressCount: r.addressCount,
      })),
      total: counts[0]?.total ?? 0,
    };
  }

  /** One Indigenous Region/Area/Location: boundary + org address/contact coverage.
   *  Same return shape as divisionDetail, minus anything turf-related.
   *
   *  `key` is either the ABS code ('107') or the name slug ('sydney-wollongong'). The admin
   *  URLs carry the slug; older /data/first-nations/ireg/107 links still resolve. Counts key
   *  off the RESOLVED code, never the raw input. */
  async firstNationsDetail(tenantId: string, level: string, key: string) {
    const { table, regionCol } = this.fnTable(level);
    // No join here, so bare identifiers are unambiguous.
    const meta = (await this.prisma.$queryRawUnsafe(
      `SELECT code, COALESCE(name, code) AS name, state, ${fnSlug("name")} AS slug, ST_AsGeoJSON(geom) AS geojson
       FROM ${table} WHERE code = $1 OR ${fnSlug("name")} = $1`,
      key,
    )) as Array<Record<string, unknown>>;
    if (meta.length === 0) {
      throw new ApiHttpException("FIRST_NATIONS_NOT_FOUND", "Indigenous region, area or location not found");
    }
    const m = meta[0];
    const code = String(m.code);
    // addressCount from the precomputed summary; contactCount live because it is
    // tenant-scoped. Both read the SAME per-address column, so they can never disagree —
    // publishing one without the other is what made the chamber layers overstate
    // withoutContacts, and `geo:first-nations` publishes both in one transaction.
    const counts = (await this.prisma.$queryRawUnsafe(
      `SELECT
         COALESCE((SELECT address_count FROM geo.region_address_count WHERE kind = $3 AND code = $1), 0)::int AS "addressCount",
         (SELECT COUNT(DISTINCT c."gnafPid")
            FROM "Contact" c
            JOIN geo.address_region ar ON ar.gnaf_pid = c."gnafPid"
            WHERE ar.${regionCol} = $1 AND c."tenantId" = $2)::int AS "contactCount"`,
      code,
      tenantId,
      level,
    )) as Array<{ addressCount: number; contactCount: number }>;
    const addressCount = counts[0]?.addressCount ?? 0;
    const contactCount = counts[0]?.contactCount ?? 0;
    return {
      level,
      code,
      name: String(m.name),
      state: m.state == null ? null : String(m.state),
      slug: String(m.slug),
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
              ar.sed_lower_code AS "sedLowerCode",
              sedl.name         AS "sedLowerName",
              ar.sed_upper_code AS "sedUpperCode",
              sedu.name         AS "sedUpperName",
              ar.ward_code AS "wardCode",
              w.name       AS "wardName",
              ar.sa1_code AS "sa1Code",
              ar.sa2_code AS "sa2Code",
              ar.sa3_code AS "sa3Code",
              ar.sa4_code AS "sa4Code",
              ar.lga_code AS "lgaCode",
              (c."gnafPid" IS NOT NULL) AS "hasContact",
              c.id AS "contactId"
       FROM geo.gnaf_address a
       LEFT JOIN geo.address_region ar ON ar.gnaf_pid = a.gnaf_pid
       LEFT JOIN geo.ced ced ON ced.code = ar.ced_code
       LEFT JOIN geo.sed sed ON sed.code = ar.sed_code
       LEFT JOIN geo.sed_lower sedl ON sedl.code = ar.sed_lower_code
       LEFT JOIN geo.sed_upper sedu ON sedu.code = ar.sed_upper_code
       LEFT JOIN geo.ward w ON w.code = ar.ward_code
       LEFT JOIN "Contact" c ON c."gnafPid" = a.gnaf_pid AND c."tenantId" = $1
       ORDER BY a.geom <-> ST_SetSRID(ST_MakePoint($3, $2), 4326)
       LIMIT ${limit}`,
      tenantId,
      opts.lat,
      opts.lng,
    );
  }

  /**
   * Everything about one address (the info popover + the address detail page): the full
   * G-NAF row, its named containing regions (reusing regionParents), the linked contact id
   * (null when none), and the nearest polling place. Demographics are a separate call
   * (`/demographics/regions/:level/:code`) keyed on the returned SA codes. Throws when the
   * gnaf_pid is unknown.
   */
  async addressDetail(tenantId: string, gnafPid: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT a.gnaf_pid AS "gnafPid", a.address_label AS address, a.lat, a.lng, a.state,
              a.street, a.locality, a.postcode,
              a.building_name AS "buildingName", a.flat_number AS "flatNumber",
              a.level_number AS "levelNumber", a.number_first AS "numberFirst",
              a.number_last AS "numberLast", a.street_name AS "streetName",
              a.street_type AS "streetType",
              ar.sa1_code AS "sa1Code", ar.sa2_code AS "sa2Code",
              ar.sa3_code AS "sa3Code", ar.sa4_code AS "sa4Code", ar.lga_code AS "lgaCode",
              c.id AS "contactId"
       FROM geo.gnaf_address a
       LEFT JOIN geo.address_region ar ON ar.gnaf_pid = a.gnaf_pid
       LEFT JOIN "Contact" c ON c."gnafPid" = a.gnaf_pid AND c."tenantId" = $2
       WHERE a.gnaf_pid = $1
       LIMIT 1`,
      gnafPid,
      tenantId,
    );
    const row = rows[0];
    if (!row) throw new ApiHttpException("ADDRESS_NOT_FOUND", "Address not found");
    const lat = row.lat != null ? Number(row.lat) : null;
    const lng = row.lng != null ? Number(row.lng) : null;
    const [regions, nearestPolling] = await Promise.all([
      this.regionParents("address", gnafPid),
      lat != null && lng != null ? this.nearestPollingPlace(lat, lng) : Promise.resolve(null),
    ]);
    return { ...row, regions, nearestPolling };
  }

  /** The closest polling booth to a point (KNN on geo.polling_place), for the address page. */
  private async nearestPollingPlace(lat: number, lng: number) {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, name, premises, address, suburb, state, postcode,
              division_name AS "divisionName", place_type AS "placeType", jurisdiction, lat, lng,
              ROUND((geom::geography <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography)::numeric) AS "distanceM"
       FROM geo.polling_place
       WHERE geom IS NOT NULL
       ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)
       LIMIT 1`,
      lat,
      lng,
    );
    return rows[0] ?? null;
  }

  // ── Polling places (booths) — federal (AEC) + state/territory (The Tally Room) ──

  /** Filter clauses shared by the browse + points queries (jurisdiction/state).
   *  Columns are qualified to the `p` alias — the browse query joins geo.ced/geo.sed,
   *  which also carry `state`/`name`, so an unqualified ref would be ambiguous. Every
   *  caller therefore aliases geo.polling_place as `p`. */
  private pollingFilters(opts: { jurisdiction?: string; state?: string }) {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (opts.jurisdiction && opts.jurisdiction !== "all") {
      params.push(opts.jurisdiction.toLowerCase());
      clauses.push(`p.jurisdiction = $${params.length}`);
    }
    if (opts.state) {
      params.push(opts.state.toUpperCase());
      clauses.push(`p.state = $${params.length}`);
    }
    return { params, clauses };
  }

  /** Paged national booth list — the divisions/areas-table equivalent for polling
   *  places. Filters by jurisdiction (federal|nsw|…), state abbreviation and a free
   *  text match over name/premises/suburb/division. Returns one page + total. */
  async browsePollingPlaces(opts: {
    jurisdiction?: string;
    state?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const lim = Math.min(Math.max(1, opts.limit ?? 20), 100);
    const off = Math.max(0, opts.offset ?? 0);
    const { params, clauses } = this.pollingFilters(opts);
    const q = (opts.q ?? "").trim();
    if (q) {
      params.push(`%${q}%`);
      const p = `$${params.length}`;
      clauses.push(`(p.name ILIKE ${p} OR p.premises ILIKE ${p} OR p.suburb ILIKE ${p} OR p.division_name ILIKE ${p})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRawUnsafe(
        `SELECT p.id, p.jurisdiction, p.name, p.premises, p.address, p.suburb, p.state, p.postcode,
                p.division_name AS "divisionName", p.place_type AS "placeType", p.lat, p.lng,
                p.ced_code AS "cedCode", ced.name AS "cedName",
                p.sed_code AS "sedCode", sed.name AS "sedName"
         FROM geo.polling_place p
         LEFT JOIN geo.ced ced ON ced.code = p.ced_code
         LEFT JOIN geo.sed sed ON sed.code = p.sed_code
         ${where}
         ORDER BY p.name NULLS LAST, p.id
         LIMIT ${lim} OFFSET ${off}`,
        ...params,
      ),
      this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS total FROM geo.polling_place p ${where}`,
        ...params,
      ) as Promise<Array<{ total: number }>>,
    ]);
    return { rows, total: counts[0]?.total ?? 0 };
  }

  /** Minimal booth points for the map layer (clustered client-side). Capped so an
   *  unfiltered national request (~17k) stays a single, cacheable payload. */
  async pollingPlacePoints(opts: { jurisdiction?: string; state?: string; limit?: number }) {
    const lim = Math.min(Math.max(1, opts.limit ?? 20000), 20000);
    const { params, clauses } = this.pollingFilters(opts);
    clauses.push("p.geom IS NOT NULL");
    return this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.lat, p.lng, p.jurisdiction, p.name
       FROM geo.polling_place p WHERE ${clauses.join(" AND ")}
       ORDER BY p.id LIMIT ${lim}`,
      ...params,
    );
  }

  /** One booth: every field + the federal division + state electorate it sits in. */
  async pollingPlaceDetail(id: string) {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.jurisdiction, p.source_id AS "sourceId", p.name, p.premises, p.address,
              p.suburb, p.state, p.postcode, p.division_name AS "divisionName",
              p.place_type AS "placeType", p.lat, p.lng,
              p.ced_code AS "cedCode", ced.name AS "cedName",
              p.sed_code AS "sedCode", sed.name AS "sedName"
       FROM geo.polling_place p
       LEFT JOIN geo.ced ced ON ced.code = p.ced_code
       LEFT JOIN geo.sed sed ON sed.code = p.sed_code
       WHERE p.id = $1`,
      id,
    )) as Array<Record<string, unknown>>;
    if (rows.length === 0) throw new ApiHttpException("POLLING_PLACE_NOT_FOUND", "Polling place not found");
    return rows[0];
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
    if (Object.prototype.hasOwnProperty.call(DIVISION_TABLE, kind)) {
      const table = DIVISION_TABLE[kind as DivisionType];
      const r = await this.q(`SELECT name FROM ${table} WHERE code = $1`, code);
      return r.length ? { kind, code, name: r[0].name as string, addressCount: await this.countOf(kind, code) } : null;
    }
    // First Nations levels are NOT in DIVISION_TABLE, so without this branch they would
    // fall through to areaTable() below and throw BAD_AREA_LEVEL.
    if (isFnLevel(kind)) {
      const { table } = FN_TABLE[kind];
      const r = await this.q(`SELECT COALESCE(name, code) AS name FROM ${table} WHERE code = $1`, code);
      return r.length ? { kind, code, name: r[0].name as string, addressCount: await this.countOf(kind, code) } : null;
    }
    // ASGS area kinds. codeCol differs for mb (mb_code) vs sa1..sa4 (code); the
    // name backfill fills both, COALESCE falls back to the code for unnamed rows.
    const { table, codeCol } = this.areaTable(kind);
    const nameSel = `COALESCE(name, ${codeCol})`;
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
      case "sed_upper":
      case "lga": {
        const r = await this.q(`SELECT state FROM ${DIVISION_TABLE[kind]} WHERE code = $1`, code);
        const name = r[0]?.state as string | undefined;
        if (!name) return [];
        const st = await this.q(`SELECT code, name FROM geo.state WHERE name = $1`, name);
        return st.length ? compact([ref("state", st[0].code, st[0].name)]) : [];
      }
      case "sed_lower": {
        // The upper-house parent exists ONLY where the two chambers nest. A Victorian
        // Legislative Council region is exactly 11 Assembly districts, so it is a genuine
        // parent. Tasmania's House of Assembly and Legislative Council divisions CROSS-CUT
        // each other (which is why ABS ships intersection cells), so `parent_upper_code` is
        // NULL there and the breadcrumb must go straight to the state. Encoded as data —
        // never branch on the state name here.
        const r = await this.q(
          `SELECT l.state, l.parent_upper_code AS pu, u.name AS pun
             FROM geo.sed_lower l
             LEFT JOIN geo.sed_upper u ON u.code = l.parent_upper_code
            WHERE l.code = $1`,
          code,
        );
        const row = r[0];
        const name = row?.state as string | undefined;
        if (!name) return [];
        const st = await this.q(`SELECT code, name FROM geo.state WHERE name = $1`, name);
        return compact([
          st.length ? ref("state", st[0].code, st[0].name) : null,
          ref("sed_upper", row?.pu, row?.pun),
        ]);
      }
      case "ward": {
        // A ward sits inside its council, which sits inside the state.
        const r = await this.q(
          `SELECT w.state, w.lga_code AS lga, l.name AS lgan
             FROM geo.ward w LEFT JOIN geo.lga l ON l.code = w.lga_code
            WHERE w.code = $1`,
          code,
        );
        const row = r[0];
        const name = row?.state as string | undefined;
        if (!name) return [];
        const st = await this.q(`SELECT code, name FROM geo.state WHERE name = $1`, name);
        return compact([
          st.length ? ref("state", st[0].code, st[0].name) : null,
          ref("lga", row?.lga, row?.lgan),
        ]);
      }
      // ── First Nations: ILOC ⊂ IARE ⊂ IREG ⊂ state ────────────────────────────
      // The state parent is resolved BY NAME against geo.state, and is simply omitted when
      // it does not resolve. That is the correct behaviour, not a workaround: Indigenous
      // Regions 901 (Christmas - Cocos), 902 (Jervis Bay) and 903 (Norfolk Island) carry
      // state = 'Other Territories', which geo.state does not have — 20260707140000 split
      // it into codes 90101-90104, and region 901 spans two of them, so it genuinely has no
      // single state parent. `compact()` drops the null.
      case "ireg": {
        const r = await this.q(`SELECT state FROM geo.ireg WHERE code = $1`, code);
        const name = r[0]?.state as string | undefined;
        if (!name) return [];
        const st = await this.q(`SELECT code, name FROM geo.state WHERE name = $1`, name);
        return st.length ? compact([ref("state", st[0].code, st[0].name)]) : [];
      }
      case "iare": {
        const r = await this.q(
          `SELECT a.state, a.ireg_code AS ireg, r.name AS iregn
             FROM geo.iare a LEFT JOIN geo.ireg r ON r.code = a.ireg_code
            WHERE a.code = $1`,
          code,
        );
        const row = r[0];
        const name = row?.state as string | undefined;
        if (!name) return [];
        const st = await this.q(`SELECT code, name FROM geo.state WHERE name = $1`, name);
        return compact([
          st.length ? ref("state", st[0].code, st[0].name) : null,
          ref("ireg", row?.ireg, row?.iregn),
        ]);
      }
      case "iloc": {
        const r = await this.q(
          `SELECT l.state, l.ireg_code AS ireg, r.name AS iregn, l.iare_code AS iare, a.name AS iaren
             FROM geo.iloc l
             LEFT JOIN geo.ireg r ON r.code = l.ireg_code
             LEFT JOIN geo.iare a ON a.code = l.iare_code
            WHERE l.code = $1`,
          code,
        );
        const row = r[0];
        const name = row?.state as string | undefined;
        if (!name) return [];
        const st = await this.q(`SELECT code, name FROM geo.state WHERE name = $1`, name);
        return compact([
          st.length ? ref("state", st[0].code, st[0].name) : null,
          ref("ireg", row?.ireg, row?.iregn),
          ref("iare", row?.iare, row?.iaren),
        ]);
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
                  ar.ced_code, ced.name cedn, ar.sed_code, sed.name sedn, ar.lga_code, l.name lgan,
                  ar.sed_lower_code, sedl.name sedln, ar.sed_upper_code, sedu.name sedun,
                  ar.ward_code, w.name wardn,
                  ar.ireg_code, ireg.name iregn, ar.iare_code, iare.name iaren,
                  ar.iloc_code, iloc.name ilocn
           FROM geo.address_region ar
           LEFT JOIN geo.sa1 s1 ON s1.code = ar.sa1_code
           LEFT JOIN geo.sa2 s2 ON s2.code = ar.sa2_code
           LEFT JOIN geo.sa3 s3 ON s3.code = ar.sa3_code
           LEFT JOIN geo.sa4 s4 ON s4.code = ar.sa4_code
           LEFT JOIN geo.ced ced ON ced.code = ar.ced_code
           LEFT JOIN geo.sed sed ON sed.code = ar.sed_code
           LEFT JOIN geo.sed_lower sedl ON sedl.code = ar.sed_lower_code
           LEFT JOIN geo.sed_upper sedu ON sedu.code = ar.sed_upper_code
           LEFT JOIN geo.lga l ON l.code = ar.lga_code
           LEFT JOIN geo.ward w ON w.code = ar.ward_code
           LEFT JOIN geo.ireg ireg ON ireg.code = ar.ireg_code
           LEFT JOIN geo.iare iare ON iare.code = ar.iare_code
           LEFT JOIN geo.iloc iloc ON iloc.code = ar.iloc_code
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
          ref("sed_lower", row.sed_lower_code, row.sedln),
          ref("sed_upper", row.sed_upper_code, row.sedun),
          ref("lga", row.lga_code, row.lgan),
          ref("ward", row.ward_code, row.wardn),
          ref("ireg", row.ireg_code, row.iregn),
          ref("iare", row.iare_code, row.iaren),
          ref("iloc", row.iloc_code, row.ilocn),
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

    const divGroup = async (divKind: DivisionType, label: string) => {
      const rows = await this.q(
        `SELECT d.code, d.name, COALESCE(rac.address_count, 0)::int AS "addressCount"
         FROM ${DIVISION_TABLE[divKind]} d LEFT JOIN geo.region_address_count rac ON rac.kind = '${divKind}' AND rac.code = d.code
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

    /** First Nations levels nested under their parent (Areas under a Region, Locations under
     *  an Area). Separate from divGroup/nestedGroup, which index DIVISION_TABLE. */
    const fnGroup = async (childKind: FirstNationsLevel, whereExpr: string, label: string, param: unknown = code) => {
      const { table } = FN_TABLE[childKind];
      const rows = await this.q(
        `SELECT d.code, COALESCE(d.name, d.code) AS name, COALESCE(rac.address_count, 0)::int AS "addressCount"
         FROM ${table} d
         LEFT JOIN geo.region_address_count rac ON rac.kind = '${childKind}' AND rac.code = d.code
         WHERE ${whereExpr} ORDER BY d.code LIMIT ${CHILD_ROW_CAP}`,
        param,
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

    /** Divisions nested under a parent division (VIC Assembly districts under their
     *  Legislative Council region; wards under their council). Emits nothing when the
     *  relationship does not hold — Tasmania's chambers cross-cut, so a TAS Legislative
     *  Council division has no child districts, only addresses. */
    const nestedGroup = async (childKind: DivisionType, whereExpr: string, label: string) => {
      const rows = await this.q(
        `SELECT d.code, d.name, COALESCE(rac.address_count, 0)::int AS "addressCount"
         FROM ${DIVISION_TABLE[childKind]} d
         LEFT JOIN geo.region_address_count rac ON rac.kind = '${childKind}' AND rac.code = d.code
         WHERE ${whereExpr} ORDER BY d.name LIMIT ${CHILD_ROW_CAP}`,
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
        await divGroup("ced", "Federal – House of Representatives");
        await divGroup("sed_lower", "State – lower house");
        await divGroup("sed_upper", "State – upper house");
        await divGroup("lga", "Local government areas (LGA)");
        await divGroup("ward", "Council wards");
        // Matched by NAME, so the three 'Other Territories' regions appear under no state —
        // consistent with regionParents omitting their state parent.
        await fnGroup("ireg", `d.state = $1`, "First Nations regions", region.name);
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
      case "sed_lower":
        await addressGroup("sed_lower_code");
        break;
      case "sed_upper":
        // Victoria's regions contain their 11 Assembly districts; Tasmania's Legislative
        // Council divisions contain no lower-house division at all (the chambers cross-cut),
        // so nestedGroup emits nothing there and only the addresses show.
        await nestedGroup("sed_lower", `d.parent_upper_code = $1`, "Nested lower-house districts");
        await addressGroup("sed_upper_code");
        break;
      case "lga":
        await nestedGroup("ward", `d.lga_code = $1`, "Wards");
        await addressGroup("lga_code");
        break;
      case "ward":
        await addressGroup("ward_code");
        break;
      case "ireg":
        await fnGroup("iare", `d.ireg_code = $1`, "Indigenous Areas");
        await addressGroup("ireg_code");
        break;
      case "iare":
        await fnGroup("iloc", `d.iare_code = $1`, "Indigenous Locations");
        await addressGroup("iare_code");
        break;
      case "iloc":
        await addressGroup("iloc_code");
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

  /** Loaded elections (geo.election) newest first — the targeting panel's booth-metric picker. */
  async listElections(): Promise<Array<{ id: string; jurisdiction: string; name: string; heldOn: string | null }>> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT e.id, e.jurisdiction, e.name, e.held_on::text AS held_on
         FROM geo.election e ORDER BY e.held_on DESC NULLS LAST`,
    )) as Array<{ id: string; jurisdiction: string; name: string; held_on: string | null }>;
    return rows.map((r) => ({ id: r.id, jurisdiction: r.jurisdiction, name: r.name, heldOn: r.held_on }));
  }

  /**
   * The 2023 Voice-to-Parliament referendum results (AEC), for the referendum explorer: the
   * national total, the eight state/territory rows and the 151 division rows. `geoCode` on each
   * row (a `state`/`ced` code) is what the choropleth joins to the boundary tiles. Turnout is
   * broken down by vote type so the crosstab charts can stack it.
   */
  async referendum(): Promise<{
    national: ReferendumRow | null;
    states: ReferendumRow[];
    divisions: ReferendumRow[];
  }> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT level, name, state_ab AS "stateAb",
              (CASE level WHEN 'state' THEN state_code WHEN 'division' THEN ced_code END) AS "geoCode",
              enrolment, ordinary_votes AS "ordinaryVotes", absent_votes AS "absentVotes",
              provisional_votes AS "provisionalVotes", prepoll_votes AS "prepollVotes",
              postal_votes AS "postalVotes", total_votes AS "totalVotes", turnout_pct AS "turnoutPct",
              yes_votes AS "yesVotes", no_votes AS "noVotes", informal_votes AS "informalVotes",
              formal_votes AS "formalVotes", yes_pct AS "yesPct", no_pct AS "noPct"
         FROM geo.referendum_result
        WHERE event_id = $1
        ORDER BY level, yes_pct DESC NULLS LAST, name`,
      REFERENDUM_EVENT,
    )) as Array<ReferendumRow & { level: string }>;
    const num = (r: ReferendumRow & { level: string }): ReferendumRow => ({
      name: r.name,
      stateAb: r.stateAb,
      geoCode: r.geoCode,
      enrolment: n(r.enrolment),
      ordinaryVotes: n(r.ordinaryVotes),
      absentVotes: n(r.absentVotes),
      provisionalVotes: n(r.provisionalVotes),
      prepollVotes: n(r.prepollVotes),
      postalVotes: n(r.postalVotes),
      totalVotes: n(r.totalVotes),
      turnoutPct: n(r.turnoutPct),
      yesVotes: n(r.yesVotes),
      noVotes: n(r.noVotes),
      informalVotes: n(r.informalVotes),
      formalVotes: n(r.formalVotes),
      yesPct: n(r.yesPct),
      noPct: n(r.noPct),
    });
    return {
      national: rows.filter((r) => r.level === "national").map(num)[0] ?? null,
      states: rows.filter((r) => r.level === "state").map(num),
      divisions: rows.filter((r) => r.level === "division").map(num),
    };
  }
}

const REFERENDUM_EVENT = "29581";

/** A referendum result row (national/state/division) as the API returns it. */
export type ReferendumRow = {
  name: string;
  stateAb: string | null;
  /** state or ced code — what the choropleth joins to the boundary tile. Null when unmatched. */
  geoCode: string | null;
  enrolment: number | null;
  ordinaryVotes: number | null;
  absentVotes: number | null;
  provisionalVotes: number | null;
  prepollVotes: number | null;
  postalVotes: number | null;
  totalVotes: number | null;
  turnoutPct: number | null;
  yesVotes: number | null;
  noVotes: number | null;
  informalVotes: number | null;
  formalVotes: number | null;
  yesPct: number | null;
  noPct: number | null;
};

/** Postgres returns numeric/bigint columns as strings or bigint; coerce to a JS number or null. */
function n(v: unknown): number | null {
  if (v == null) return null;
  const num = typeof v === "bigint" ? Number(v) : Number(v as number);
  return Number.isFinite(num) ? num : null;
}
