import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

export type DivisionType = "ced" | "sed" | "lga";
const DIVISION_TABLE: Record<DivisionType, string> = { ced: "geo.ced", sed: "geo.sed", lga: "geo.lga" };
const REGION_COL: Record<DivisionType, string> = { ced: "ced_code", sed: "sed_code", lga: "lga_code" };

/** ASGS statistical-area levels selectable on the turf-cut map. */
export type AreaLevel = "mb" | "sa1" | "sa2" | "sa3";
const AREA_TABLE: Record<AreaLevel, { table: string; codeCol: string; nameExpr: string }> = {
  // Meshblocks have no name — fall back to the code as the label.
  mb: { table: "geo.meshblock", codeCol: "mb_code", nameExpr: "mb_code" },
  sa1: { table: "geo.sa1", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa2: { table: "geo.sa2", codeCol: "code", nameExpr: "COALESCE(name, code)" },
  sa3: { table: "geo.sa3", codeCol: "code", nameExpr: "COALESCE(name, code)" },
};
// geo.address_region column that maps an address to each ASGS level — the join key for
// area address counts (mirrors REGION_COL for divisions).
const AREA_REGION_COL: Record<AreaLevel, string> = {
  mb: "mb_code",
  sa1: "sa1_code",
  sa2: "sa2_code",
  sa3: "sa3_code",
};

/** A part of a campaign boundary or a turf cut: a whole division, an ASGS area, or a drawn polygon. */
export type BoundarySource =
  | { kind: "division"; type: DivisionType; code: string }
  | { kind: "area"; layer: AreaLevel; code: string }
  | { kind: "polygon"; geometry: unknown };

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
    if (layer !== "mb" && layer !== "sa1" && layer !== "sa2" && layer !== "sa3") {
      throw new ApiHttpException("BAD_AREA_LEVEL", "layer must be mb, sa1, sa2 or sa3");
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
    const limit = Math.min(Math.max(1, opts.limit ?? 800), 3000);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ${codeCol} AS code, ${nameExpr} AS name, ST_AsGeoJSON(geom) AS geojson
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

  /** Type-ahead over a level's name/code for the area search box. */
  async searchAreas(layer: string, q: string, limit?: number) {
    const { table, codeCol, nameExpr } = this.areaTable(layer);
    const term = `%${(q ?? "").trim()}%`;
    const lim = Math.min(Math.max(1, limit ?? 12), 50);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT ${codeCol} AS code, ${nameExpr} AS name
       FROM ${table}
       WHERE ${codeCol} ILIKE $1 OR ${nameExpr} ILIKE $1
       ORDER BY name
       LIMIT ${lim}`,
      term,
    )) as Array<{ code: string; name: string | null }>;
    return rows.map((r) => ({ level: layer, code: r.code, name: r.name ?? r.code }));
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
    // Meshblocks have no name column — fall back to the code as the label.
    const nameSel = layer === "mb" ? `a.${codeCol}` : "COALESCE(a.name, a.code)";
    const rows = (await this.prisma.$queryRawUnsafe(
      // COUNT(DISTINCT …): the Contact join fans out address rows whenever an
      // address has one (or more) contacts, so a plain COUNT over-counts.
      `SELECT a.${codeCol} AS code, ${nameSel} AS name, ST_AsGeoJSON(a.geom) AS geojson,
              COUNT(DISTINCT ar.gnaf_pid)::int AS "addressCount",
              COUNT(DISTINCT c."gnafPid")::int AS "contactCount",
              (COUNT(DISTINCT ar.gnaf_pid) - COUNT(DISTINCT c."gnafPid"))::int AS "withoutContacts"
       FROM ${table} a
       LEFT JOIN geo.address_region ar ON ar.${regionCol} = a.${codeCol}
       LEFT JOIN "Contact" c ON c."gnafPid" = ar.gnaf_pid AND c."tenantId" = $1
       WHERE a.${codeCol} = $2
       GROUP BY a.${codeCol}, a.geom`,
      tenantId,
      code,
    )) as Array<Record<string, unknown>>;
    if (rows.length === 0) throw new ApiHttpException("AREA_NOT_FOUND", "Area not found");
    const r = rows[0];
    return {
      code: r.code,
      name: r.name ?? r.code,
      level: layer,
      geometry: r.geojson ? JSON.parse(String(r.geojson)) : null,
      addressCount: r.addressCount,
      contactCount: r.contactCount,
      withoutContacts: r.withoutContacts,
    };
  }

  /**
   * Union a mix of geographic sources — ASGS areas (mb/sa1-3), whole divisions
   * (ced/sed/lga), and free-drawn polygons — into one MultiPolygon. This one query
   * builds BOTH a campaign boundary and a turf cut. Drawn polygons are ST_MakeValid'd;
   * ST_CollectionExtract(…, 3) keeps polygons only. Returns null if nothing resolved.
   */
  async unionSources(sources: BoundarySource[]): Promise<unknown | null> {
    const areaCodes = (layer: AreaLevel) =>
      JSON.stringify(
        sources
          .filter((s): s is Extract<BoundarySource, { kind: "area" }> => s.kind === "area" && s.layer === layer)
          .map((s) => s.code),
      );
    const divCodes = (type: DivisionType) =>
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
    const rows = (await this.prisma.$queryRawUnsafe(
      `WITH parts AS (
         SELECT geom FROM geo.meshblock WHERE mb_code IN (SELECT jsonb_array_elements_text($1::jsonb))
         UNION ALL SELECT geom FROM geo.sa1 WHERE code IN (SELECT jsonb_array_elements_text($2::jsonb))
         UNION ALL SELECT geom FROM geo.sa2 WHERE code IN (SELECT jsonb_array_elements_text($3::jsonb))
         UNION ALL SELECT geom FROM geo.sa3 WHERE code IN (SELECT jsonb_array_elements_text($4::jsonb))
         UNION ALL SELECT geom FROM geo.ced WHERE code IN (SELECT jsonb_array_elements_text($5::jsonb))
         UNION ALL SELECT geom FROM geo.sed WHERE code IN (SELECT jsonb_array_elements_text($6::jsonb))
         UNION ALL SELECT geom FROM geo.lga WHERE code IN (SELECT jsonb_array_elements_text($7::jsonb))
         UNION ALL
           SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(je.value::text), 4326))
           FROM jsonb_array_elements($8::jsonb) AS je(value)
       )
       SELECT ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_Union(geom), 3))) AS geojson FROM parts`,
      areaCodes("mb"),
      areaCodes("sa1"),
      areaCodes("sa2"),
      areaCodes("sa3"),
      divCodes("ced"),
      divCodes("sed"),
      divCodes("lga"),
      polygons,
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

  /** Divisions of a type with total address counts (from the precomputed summary if present). */
  async listDivisions(type: string) {
    const { table, col } = this.table(type);
    return this.prisma.$queryRawUnsafe(
      `SELECT d.code, d.name, d.state, COUNT(ar.gnaf_pid)::int AS "addressCount"
       FROM ${table} d
       LEFT JOIN geo.address_region ar ON ar.${col} = d.code
       GROUP BY d.code, d.name, d.state
       ORDER BY d.name`,
    );
  }

  /** One division: boundary GeoJSON + total/contact/without-contact counts for an org. */
  async divisionDetail(tenantId: string, type: string, code: string) {
    const { table, col } = this.table(type);
    const rows = (await this.prisma.$queryRawUnsafe(
      // COUNT(DISTINCT …): the Contact join fans out address rows whenever an
      // address has one (or more) contacts, so a plain COUNT over-counts.
      `SELECT d.code, d.name, d.state, ST_AsGeoJSON(d.geom) AS geojson,
              COUNT(DISTINCT ar.gnaf_pid)::int AS "addressCount",
              COUNT(DISTINCT c."gnafPid")::int AS "contactCount",
              (COUNT(DISTINCT ar.gnaf_pid) - COUNT(DISTINCT c."gnafPid"))::int AS "withoutContacts"
       FROM ${table} d
       LEFT JOIN geo.address_region ar ON ar.${col} = d.code
       LEFT JOIN "Contact" c ON c."gnafPid" = ar.gnaf_pid AND c."tenantId" = $1
       WHERE d.code = $2
       GROUP BY d.code, d.name, d.state, d.geom`,
      tenantId,
      code,
    )) as Array<Record<string, unknown>>;
    if (rows.length === 0) throw new ApiHttpException("DIVISION_NOT_FOUND", "Division not found");
    const r = rows[0];
    return {
      code: r.code,
      name: r.name,
      state: r.state,
      geometry: r.geojson ? JSON.parse(String(r.geojson)) : null,
      addressCount: r.addressCount,
      contactCount: r.contactCount,
      withoutContacts: r.withoutContacts,
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
    const limit = Math.min(Math.max(1, opts.limit ?? 500), 5000);
    const noContact = opts.withoutContacts
      ? `AND c."gnafPid" IS NULL`
      : "";
    const join = `LEFT JOIN "Contact" c ON c."gnafPid" = a.gnaf_pid AND c."tenantId" = $1`;

    if (opts.turfId) {
      // ST_Contains against the drawn turf polygon (GeoJSON stored on Turf.geometry).
      const turf = (await this.prisma.$queryRawUnsafe(
        `SELECT geometry FROM "Turf" WHERE id = $1 AND "tenantId" = $2`,
        opts.turfId,
        tenantId,
      )) as Array<{ geometry: unknown }>;
      if (turf.length === 0) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
      const geojson = JSON.stringify(turf[0].geometry);
      return this.prisma.$queryRawUnsafe(
        `SELECT a.gnaf_pid AS "gnafPid", a.address_label AS address, a.lat, a.lng
         FROM geo.gnaf_address a
         ${join}
         WHERE ST_Contains(ST_GeomFromGeoJSON($2), a.geom) ${noContact}
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
}
