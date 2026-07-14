import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

/**
 * ABS demographics read API — Census 2021 (GCP) + SEIFA 2021 indicators, keyed to ASGS geography,
 * stored raw in `geo.abs_indicator` (catalogue) + `geo.abs_value` (level × code × indicator). Read
 * with `$queryRaw` like the rest of the geo data layer; the boundary geometry + vector tiles stay
 * in GeoService (this module only owns the attribute values). The map joins these values to geo
 * tiles by region `code` — client `["match"]` at SA2+ (rows returned here), value-baked-on-tile at
 * SA1/meshblock (see GeoService.tile's `metric` join), so `choropleth()` omits `rows` for the big
 * levels and the client paints the tile's `value` property instead.
 */

export type AbsLevel = "mb" | "sa1" | "sa2" | "sa3" | "sa4";

const LEVEL_TABLE: Record<AbsLevel, { table: string; codeCol: string }> = {
  mb: { table: "geo.meshblock", codeCol: "mb_code" },
  sa1: { table: "geo.sa1", codeCol: "code" },
  sa2: { table: "geo.sa2", codeCol: "code" },
  sa3: { table: "geo.sa3", codeCol: "code" },
  sa4: { table: "geo.sa4", codeCol: "code" },
};

// Levels small enough to bind client-side via a `["match", code, …]` expression. SA2 ≈ 2,600,
// SA3 ≈ 358, SA4 ≈ 108. SA1 (≈ 60k) + meshblock (≈ 360k) are painted from a value baked onto the
// tile instead, so `choropleth()` returns no rows for them (the break scale is enough).
const CLIENT_JOIN_LEVELS = new Set<AbsLevel>(["sa2", "sa3", "sa4"]);

export type IndicatorMeta = {
  key: string;
  name: string;
  category: string;
  unit: string;
  format: string | null;
  description: string | null;
  source: string | null;
  polarity: string;
  levels: string[];
  sort: number;
};

@Injectable()
export class DemographicsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertLevel(level: string): AbsLevel {
    if (!(level in LEVEL_TABLE)) {
      throw new ApiHttpException("BAD_LEVEL", `level must be one of ${Object.keys(LEVEL_TABLE).join(", ")}`);
    }
    return level as AbsLevel;
  }

  /** The full indicator catalogue, ordered for the category→indicator picker. */
  async listIndicators(): Promise<IndicatorMeta[]> {
    return (await this.prisma.$queryRawUnsafe(
      `SELECT key, name, category, unit, format, description, source, polarity, levels, sort
         FROM geo.abs_indicator
        ORDER BY category, sort, name`,
    )) as IndicatorMeta[];
  }

  /**
   * Choropleth payload for one indicator at one level: the national quantile breaks (five bands,
   * so a colour means the same value wherever the map is panned) plus — only for the client-join
   * levels — the `{code, value}` rows to paint by `["match"]`. SA1/meshblock omit rows; the client
   * reads the value baked onto the tile.
   */
  async choropleth(levelRaw: string, indicatorKey: string) {
    const level = this.assertLevel(levelRaw);
    const [indicator] = (await this.prisma.$queryRawUnsafe(
      `SELECT key, name, unit, format, polarity FROM geo.abs_indicator WHERE key = $1`,
      indicatorKey,
    )) as Array<{ key: string; name: string; unit: string; format: string | null; polarity: string }>;
    if (!indicator) throw new ApiHttpException("INDICATOR_NOT_FOUND", "Indicator not found");

    const [scale] = (await this.prisma.$queryRawUnsafe(
      `WITH d AS (
         SELECT value AS v FROM geo.abs_value
          WHERE indicator_key = $1 AND level = $2 AND value IS NOT NULL
       )
       SELECT count(*)::int AS regions, min(v) AS min, max(v) AS max,
              percentile_cont(ARRAY[0.2, 0.4, 0.6, 0.8]) WITHIN GROUP (ORDER BY v) AS breaks
         FROM d`,
      indicatorKey,
      level,
    )) as Array<{ regions: number; min: number | null; max: number | null; breaks: number[] | null }>;

    const rows = CLIENT_JOIN_LEVELS.has(level)
      ? ((await this.prisma.$queryRawUnsafe(
          `SELECT code, value FROM geo.abs_value
            WHERE indicator_key = $1 AND level = $2 AND value IS NOT NULL`,
          indicatorKey,
          level,
        )) as Array<{ code: string; value: number }>)
      : undefined;

    return {
      indicator,
      level,
      regions: scale?.regions ?? 0,
      min: scale?.min ?? null,
      max: scale?.max ?? null,
      // No values loaded → no breaks, and the client paints every region as no-data.
      breaks: scale?.breaks ?? [],
      ...(rows ? { rows } : {}),
    };
  }

  /** Every indicator for one region, grouped for the detail panel. Works at any level. */
  async regionProfile(levelRaw: string, code: string) {
    const level = this.assertLevel(levelRaw);
    const { table, codeCol } = LEVEL_TABLE[level];
    const [meta] = (await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(name, ${codeCol}) AS name FROM ${table} WHERE ${codeCol} = $1`,
      code,
    )) as Array<{ name: string | null }>;

    const values = (await this.prisma.$queryRawUnsafe(
      `SELECT i.key, i.name, i.category, i.unit, i.format, i.polarity, v.value
         FROM geo.abs_value v
         JOIN geo.abs_indicator i ON i.key = v.indicator_key
        WHERE v.level = $1 AND v.code = $2
        ORDER BY i.category, i.sort, i.name`,
      level,
      code,
    )) as Array<{
      key: string;
      name: string;
      category: string;
      unit: string;
      format: string | null;
      polarity: string;
      value: number | null;
    }>;

    return { level, code, name: meta?.name ?? code, values };
  }

  /** Dataset summary for the Datasets page — indicator + level coverage and last ingest. */
  async status() {
    const [row] = (await this.prisma.$queryRawUnsafe(
      `SELECT
         (SELECT count(*)::int FROM geo.abs_indicator) AS indicators,
         (SELECT count(*)::int FROM geo.abs_value)     AS values,
         (SELECT array_agg(DISTINCT level ORDER BY level) FROM geo.abs_value) AS levels,
         (SELECT max(last_ingested) FROM geo.dataset_meta
           WHERE key LIKE 'abs\\_%' ESCAPE '\\' OR key = 'seifa_2021') AS "lastIngested"`,
    )) as Array<{ indicators: number; values: number; levels: string[] | null; lastIngested: Date | null }>;
    return {
      indicators: row?.indicators ?? 0,
      values: row?.values ?? 0,
      levels: row?.levels ?? [],
      lastIngested: row?.lastIngested ?? null,
    };
  }
}
