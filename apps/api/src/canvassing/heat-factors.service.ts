import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { RawHeatRow } from "./heat-score";

/**
 * Factor extraction for the targeting heat map — data access ONLY (no maths; the
 * pure scorer owns every formula). One SQL pass over the boundary: member meshblocks
 * by point-on-surface containment → boundary-clipped doors, plus reference joins
 * (area, ABS indicator, poll via sa1_electorate, booth metrics, referendum fallback)
 * and the tenant CTE (contacts → gnafPid → address_region → meshblock → SA1, with
 * latest-disposition and knock-decay laterals).
 *
 * Address→SA1 always routes via geo.meshblock.mb_code — address_region.sa1_code is
 * not reliably populated (see geo.service areaAddressCount).
 */

/** geoKind → sa1_electorate column, allowlisted — NEVER interpolate caller input. */
const ELECTORATE_COLUMN: Record<string, string> = {
  ced: "ced_code",
  sed: "sed_code",
  sed_lower: "sed_lower_code",
  sed_upper: "sed_upper_code",
};

export interface HeatFactorParams {
  tenantId: string;
  /** Campaign boundary as a GeoJSON (Multi)Polygon. */
  boundary: unknown;
  /** ABS indicator key for the fit lens (e.g. "seifa_irsd_decile"). */
  fitIndicator: string;
  /** ABS indicator key for the community lens (e.g. "cald_lote_share"). */
  communityIndicator: string;
  /** Resolved poll reference (questionId already looked up from questionCode), or null. */
  poll: { pollId: string; questionId: string; responseLabel: string; geoKind: string } | null;
  /** Election whose booth metrics apply, or null to skip the booth signal. */
  electionId: string | null;
  /** AEC party codes the campaign counts as aligned (fp_share sum), or empty. */
  alignedPartyCodes: string[];
}

@Injectable()
export class HeatFactorsService {
  constructor(private readonly prisma: PrismaService) {}

  async extract(params: HeatFactorParams): Promise<RawHeatRow[]> {
    const geoColumn = params.poll ? ELECTORATE_COLUMN[params.poll.geoKind] : null;
    if (params.poll && !geoColumn) {
      throw new Error(`Unsupported poll geoKind: ${params.poll.geoKind}`);
    }

    const rows = (await this.prisma.$queryRawUnsafe(
      `
WITH b AS (
  SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS g
),
mbs AS (
  -- Member meshblocks: point-on-surface containment so a sliver SA1 doesn't import
  -- its whole door count; GIST-assisted via the bbox pre-filter.
  SELECT mb.mb_code, mb.sa1_code
  FROM geo.meshblock mb, b
  WHERE mb.geom && b.g AND ST_Contains(b.g, ST_PointOnSurface(mb.geom))
),
doors AS (
  SELECT mbs.sa1_code,
         COALESCE(SUM(rac.address_count), 0)::int AS doors,
         COUNT(*) FILTER (WHERE rac.address_count > 0)::int AS occupied_mbs
  FROM mbs
  LEFT JOIN geo.region_address_count rac ON rac.kind = 'mb' AND rac.code = mbs.mb_code
  GROUP BY mbs.sa1_code
),
cover AS (
  SELECT s.code AS sa1_code,
         CASE WHEN ST_Area(s.geom) > 0
              THEN LEAST(1, ST_Area(ST_Intersection(s.geom, b.g)) / ST_Area(s.geom))
              ELSE 0 END AS coverage_fraction
  FROM geo.sa1 s, b
  WHERE s.code IN (SELECT d.sa1_code FROM doors d)
),
area AS (
  SELECT rac.code AS sa1_code, rac.area_km2
  FROM geo.region_address_count rac
  WHERE rac.kind = 'sa1'
),
fit AS (
  SELECT av.code AS sa1_code, av.value AS fit_value
  FROM geo.abs_value av
  WHERE av.level = 'sa1' AND av.indicator_key = $3
),
community AS (
  SELECT av.code AS sa1_code, av.value AS community_value
  FROM geo.abs_value av
  WHERE av.level = 'sa1' AND av.indicator_key = $10
),
elect AS (
  SELECT se.sa1_code, se.ced_code, se.majority_share,
         ${geoColumn ? `se.${geoColumn}` : "NULL::text"} AS poll_geo_code
  FROM geo.sa1_electorate se
),
poll AS (
  SELECT e.sa1_code,
         MAX(pe.percent)::float AS poll_percent,
         BOOL_OR(pe."isNet") AS poll_is_net
  FROM elect e
  JOIN insights."PollEstimate" pe
    ON $4::text IS NOT NULL
   AND pe."pollId" = $4
   AND pe."questionId" = $5
   AND pe."responseLabel" = $6
   AND pe."geoKind" = $7
   AND pe."geoCode" = e.poll_geo_code
   AND pe.reportable
   AND pe.percent IS NOT NULL
  GROUP BY e.sa1_code
),
booth AS (
  SELECT sem.sa1_code,
         MAX(sem.value) FILTER (WHERE sem.metric_key = 'competitiveness01') AS competitiveness,
         MAX(sem.attributed_votes) FILTER (WHERE sem.metric_key = 'competitiveness01') AS attributed_votes,
         SUM(sem.value) FILTER (WHERE sem.metric_key = ANY($9::text[])) AS aligned_fp_share,
         MAX(sem.value) FILTER (WHERE sem.metric_key = 'informality01') AS informality_share
  FROM geo.sa1_election_metric sem
  WHERE $8::text IS NOT NULL AND sem.election_id = $8
  GROUP BY sem.sa1_code
),
referendum AS (
  SELECT e.sa1_code, rr.yes_pct
  FROM elect e
  JOIN LATERAL (
    SELECT r.yes_pct FROM geo.referendum_result r
    WHERE r.level = 'division' AND r.ced_code = e.ced_code AND r.yes_pct IS NOT NULL
    ORDER BY r.updated_at DESC LIMIT 1
  ) rr ON true
),
tenant AS (
  SELECT mb.sa1_code,
         COUNT(DISTINCT c.id)::int AS contacts,
         COUNT(DISTINCT c.id) FILTER (
           WHERE ld."supportLevel" IN ('STRONG_SUPPORT', 'LEAN_SUPPORT')
         )::int AS supporters,
         COUNT(DISTINCT c.id) FILTER (WHERE ld."supportLevel" IS NOT NULL)::int AS dispositioned,
         COALESCE(SUM(
           exp(-ln(2) * GREATEST(EXTRACT(epoch FROM (now() - dk.knocked_at)), 0) / 86400.0 / 30.0)
         ), 0)::float AS knock_decay
  FROM public."Contact" c
  JOIN geo.address_region ar ON ar.gnaf_pid = c."gnafPid"
  JOIN geo.meshblock mb ON mb.mb_code = ar.mb_code
  LEFT JOIN LATERAL (
    SELECT d."supportLevel"
    FROM canvass."Disposition" d
    WHERE d."contactId" = c.id AND d."supportLevel" IS NOT NULL
    ORDER BY d."createdAt" DESC LIMIT 1
  ) ld ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(k."clientCapturedAt", k."createdAt") AS knocked_at
    FROM canvass."DoorKnock" k
    WHERE k."contactId" = c.id
    ORDER BY 1 DESC LIMIT 1
  ) dk ON true
  WHERE c."tenantId" = $2 AND c."gnafPid" IS NOT NULL
    AND mb.sa1_code IN (SELECT d2.sa1_code FROM doors d2)
  GROUP BY mb.sa1_code
)
SELECT d.sa1_code                                    AS "sa1Code",
       d.doors                                       AS "doors",
       d.occupied_mbs                                AS "occupiedMbs",
       a.area_km2::float                             AS "areaKm2",
       f.fit_value::float                            AS "fitValue",
       p.poll_percent                                AS "pollPercent",
       COALESCE(p.poll_is_net, false)                AS "pollIsNet",
       e.majority_share::float                       AS "electorateMajorityShare",
       bo.competitiveness::float                     AS "competitiveness",
       bo.attributed_votes::int                      AS "attributedVotes",
       bo.aligned_fp_share::float                    AS "alignedFpShare",
       bo.informality_share::float                   AS "informalityShare",
       r.yes_pct::float                              AS "referendumYesPct",
       cm.community_value::float                     AS "communityValue",
       COALESCE(t.contacts, 0)                       AS "contacts",
       COALESCE(t.supporters, 0)                     AS "supporters",
       COALESCE(t.dispositioned, 0)                  AS "dispositioned",
       COALESCE(t.knock_decay, 0)                    AS "knockDecay",
       COALESCE(cv.coverage_fraction, 1)::float      AS "coverageFraction"
FROM doors d
LEFT JOIN cover cv     ON cv.sa1_code = d.sa1_code
LEFT JOIN area a       ON a.sa1_code = d.sa1_code
LEFT JOIN fit f        ON f.sa1_code = d.sa1_code
LEFT JOIN community cm ON cm.sa1_code = d.sa1_code
LEFT JOIN elect e      ON e.sa1_code = d.sa1_code
LEFT JOIN poll p       ON p.sa1_code = d.sa1_code
LEFT JOIN booth bo     ON bo.sa1_code = d.sa1_code
LEFT JOIN referendum r ON r.sa1_code = d.sa1_code
LEFT JOIN tenant t     ON t.sa1_code = d.sa1_code
ORDER BY d.sa1_code
`,
      JSON.stringify(params.boundary),
      params.tenantId,
      params.fitIndicator,
      params.poll?.pollId ?? null,
      params.poll?.questionId ?? null,
      params.poll?.responseLabel ?? null,
      params.poll?.geoKind ?? null,
      params.electionId,
      params.alignedPartyCodes.map((p) => `fp_share:${p}`),
      params.communityIndicator,
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      sa1Code: String(r.sa1Code),
      doors: Number(r.doors ?? 0),
      occupiedMbs: Number(r.occupiedMbs ?? 0),
      areaKm2: r.areaKm2 == null ? null : Number(r.areaKm2),
      fitValue: r.fitValue == null ? null : Number(r.fitValue),
      pollPercent: r.pollPercent == null ? null : Number(r.pollPercent),
      pollIsNet: Boolean(r.pollIsNet),
      electorateMajorityShare: r.electorateMajorityShare == null ? null : Number(r.electorateMajorityShare),
      competitiveness: r.competitiveness == null ? null : Number(r.competitiveness),
      attributedVotes: r.attributedVotes == null ? null : Number(r.attributedVotes),
      alignedFpShare: r.alignedFpShare == null ? null : Number(r.alignedFpShare),
      informalityShare: r.informalityShare == null ? null : Number(r.informalityShare),
      referendumYesPct: r.referendumYesPct == null ? null : Number(r.referendumYesPct),
      communityValue: r.communityValue == null ? null : Number(r.communityValue),
      contacts: Number(r.contacts ?? 0),
      supporters: Number(r.supporters ?? 0),
      dispositioned: Number(r.dispositioned ?? 0),
      knockDecay: Number(r.knockDecay ?? 0),
      coverageFraction: Number(r.coverageFraction ?? 1),
    }));
  }

  /** SA1 count inside a boundary — the preview cap check without full extraction. */
  async countSa1s(boundary: unknown): Promise<number> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `
WITH b AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS g)
SELECT COUNT(DISTINCT mb.sa1_code)::int AS n
FROM geo.meshblock mb, b
WHERE mb.geom && b.g AND ST_Contains(b.g, ST_PointOnSurface(mb.geom))
`,
      JSON.stringify(boundary),
    )) as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0);
  }
}
