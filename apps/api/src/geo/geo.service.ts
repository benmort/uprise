import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

export type DivisionType = "ced" | "sed" | "lga";
const DIVISION_TABLE: Record<DivisionType, string> = { ced: "geo.ced", sed: "geo.sed", lga: "geo.lga" };
const REGION_COL: Record<DivisionType, string> = { ced: "ced_code", sed: "sed_code", lga: "lga_code" };

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  private table(type: string): { table: string; col: string; type: DivisionType } {
    if (type !== "ced" && type !== "sed" && type !== "lga") {
      throw new ApiHttpException("BAD_DIVISION_TYPE", "type must be ced, sed or lga");
    }
    return { table: DIVISION_TABLE[type], col: REGION_COL[type], type };
  }

  /** Dataset provenance + row counts for /settings/data. */
  async status() {
    return this.prisma.$queryRawUnsafe(
      `SELECT key, label, source_url AS "sourceUrl", release_date AS "releaseDate", licence,
              row_count AS "rowCount", status, last_ingested AS "lastIngested"
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
  async divisionDetail(organizationId: string, type: string, code: string) {
    const { table, col } = this.table(type);
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT d.code, d.name, d.state, ST_AsGeoJSON(d.geom) AS geojson,
              COUNT(ar.gnaf_pid)::int AS "addressCount",
              COUNT(c."gnafPid")::int AS "contactCount",
              (COUNT(ar.gnaf_pid) - COUNT(c."gnafPid"))::int AS "withoutContacts"
       FROM ${table} d
       LEFT JOIN geo.address_region ar ON ar.${col} = d.code
       LEFT JOIN "Contact" c ON c."gnafPid" = ar.gnaf_pid AND c."organizationId" = $1
       WHERE d.code = $2
       GROUP BY d.code, d.name, d.state, d.geom`,
      organizationId,
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
    organizationId: string,
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
    const join = `LEFT JOIN "Contact" c ON c."gnafPid" = a.gnaf_pid AND c."organizationId" = $1`;

    if (opts.turfId) {
      // ST_Contains against the drawn turf polygon (GeoJSON stored on Turf.geometry).
      const turf = (await this.prisma.$queryRawUnsafe(
        `SELECT geometry FROM "Turf" WHERE id = $1 AND "organizationId" = $2`,
        opts.turfId,
        organizationId,
      )) as Array<{ geometry: unknown }>;
      if (turf.length === 0) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
      const geojson = JSON.stringify(turf[0].geometry);
      return this.prisma.$queryRawUnsafe(
        `SELECT a.gnaf_pid AS "gnafPid", a.address_label AS address, a.lat, a.lng
         FROM geo.gnaf_address a
         ${join}
         WHERE ST_Contains(ST_GeomFromGeoJSON($2), a.geom) ${noContact}
         LIMIT ${limit}`,
        organizationId,
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
      organizationId,
      opts.divisionCode,
    );
  }
}
