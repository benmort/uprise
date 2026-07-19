import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import { parseArgs } from "./election-parse";

/**
 * Precomputed per-SA1 election metrics → geo.sa1_election_metric.
 *   npm --prefix apps/api run geo:sa1-election-metrics -- --election federal-2025
 *
 * Two attribution paths, chosen by whether the AEC votes-by-SA1 crosswalk is loaded:
 *   a) ATTENDANCE-WEIGHTED – each SA1's metric is the vote-weighted mean of its booths'
 *      values (weights = geo.sa1_booth_vote mark-off counts). attributed_votes records the
 *      evidence base (< ~30 is flagged low-confidence downstream).
 *   b) IDW FALLBACK – no mark-off data: the k=4 nearest ordinary (election-day) booths in
 *      the SA1's own electorate (geo.sa1_electorate), from ST_PointOnSurface(geo.sa1.geom),
 *      weighted 1/(d+50)² with d in metres via geography cast. attributed_votes stays NULL.
 *
 * Metrics (tall, per metric_key):
 *   'competitiveness01'     – per booth 1 − min(|tcp_winner_share − 0.5|, 0.25)/0.25
 *                             (peaks at a 50/50 TCP booth), then weighted per SA1
 *   'fp_share:<party_code>' – weighted booth-level first-preference share, one row per
 *                             party holding ≥ 1% of the election's national FP vote
 *
 * Everything is INSERT … SELECT with CTEs (no per-row JS); delete-and-reinsert per election
 * in ONE transaction with SET LOCAL work_mem (mirrors map.ts), so readers never see a
 * half-written election. Run after geo:load-election + geo:sa1-electorate.
 */
const log = (m: string) => console.log(m); // eslint-disable-line no-console

const USAGE = `geo:sa1-election-metrics – precompute per-SA1 metrics for one loaded election

Usage: npm --prefix apps/api run geo:sa1-election-metrics -- [--election <id>] [--help]
  --election  geo.election id (default federal-2025); geo:load-election must have run first`;

/** Booth-level TCP competitiveness: winner share folded into a 50/50-peaked 0–1 score. */
const BOOTH_COMP_CTE = `
  booth_comp AS (
    SELECT polling_place_id,
           1 - LEAST(ABS(MAX(votes)::float / NULLIF(SUM(votes), 0) - 0.5), 0.25) / 0.25 AS comp01
      FROM geo.booth_result
     WHERE election_id = $1 AND kind = 'tcp'
     GROUP BY polling_place_id
    HAVING SUM(votes) > 0
  )`;

/** Booth-level FP share per bounded party (a party absent from a booth scores 0 there,
 *  rather than dropping the booth from that party's weighted mean). */
const BOOTH_FP_SHARE_CTES = `
  fp AS (
    SELECT polling_place_id, party_code, SUM(votes) AS votes
      FROM geo.booth_result
     WHERE election_id = $1 AND kind = 'fp'
     GROUP BY polling_place_id, party_code
  ),
  tot AS (
    SELECT polling_place_id, SUM(votes) AS total FROM fp GROUP BY polling_place_id HAVING SUM(votes) > 0
  ),
  parties AS (
    SELECT party_code FROM fp GROUP BY party_code
    HAVING SUM(votes)::float >= 0.01 * (SELECT SUM(votes) FROM fp)
  ),
  share AS (
    SELECT t.polling_place_id, p.party_code, COALESCE(f.votes, 0)::float / t.total AS share
      FROM tot t
     CROSS JOIN parties p
      LEFT JOIN fp f ON f.polling_place_id = t.polling_place_id AND f.party_code = p.party_code
  )`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { log(USAGE); return; }
  const electionId = args.election;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    const elections = (await prisma.$queryRawUnsafe(
      `SELECT id, jurisdiction FROM geo.election WHERE id = $1`, electionId,
    )) as Array<{ id: string; jurisdiction: string }>;
    if (elections.length === 0) throw new Error(`Election '${electionId}' not in geo.election – run geo:load-election first`);
    // Same-electorate restriction for the IDW fallback: federal booths/SA1s key off the
    // CED, state elections off the SED. Chosen from two literals, never interpolated input.
    const electCol = elections[0].jurisdiction === "federal" ? "ced_code" : "sed_code";

    const [{ markoff }] = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS markoff FROM geo.sa1_booth_vote WHERE election_id = $1`, electionId,
    )) as Array<{ markoff: number }>;
    const path = markoff > 0 ? "attendance-weighted (votes-by-SA1)" : "IDW k-NN fallback (no votes-by-SA1 rows)";
    log(`Rebuilding geo.sa1_election_metric for ${electionId} – ${path}…`);

    const HOUR_MS = 60 * 60 * 1000;
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL work_mem = '512MB'`);
        await tx.$executeRawUnsafe(`DELETE FROM geo.sa1_election_metric WHERE election_id = $1`, electionId);

        if (markoff > 0) {
          // ── a) Attendance-weighted: weight = the SA1's mark-off votes at each booth. ──
          await tx.$executeRawUnsafe(
            `INSERT INTO geo.sa1_election_metric (sa1_code, election_id, metric_key, value, booth_n, attributed_votes)
             WITH ${BOOTH_COMP_CTE}
             SELECT v.sa1_code, $1, 'competitiveness01',
                    SUM(v.votes * bc.comp01)::float / SUM(v.votes),
                    COUNT(*)::int,
                    SUM(v.votes)::int
               FROM geo.sa1_booth_vote v
               JOIN booth_comp bc ON bc.polling_place_id = v.polling_place_id
              WHERE v.election_id = $1 AND v.votes > 0
              GROUP BY v.sa1_code`,
            electionId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO geo.sa1_election_metric (sa1_code, election_id, metric_key, value, booth_n, attributed_votes)
             WITH ${BOOTH_FP_SHARE_CTES}
             SELECT v.sa1_code, $1, 'fp_share:' || s.party_code,
                    SUM(v.votes * s.share)::float / SUM(v.votes),
                    COUNT(*)::int,
                    SUM(v.votes)::int
               FROM geo.sa1_booth_vote v
               JOIN share s ON s.polling_place_id = v.polling_place_id
              WHERE v.election_id = $1 AND v.votes > 0
              GROUP BY v.sa1_code, s.party_code`,
            electionId,
          );
          // Informality: informal / (informal + formal) per booth, attendance-smeared.
          // Booths with fp results but no informal row count as 0 informal (COALESCE),
          // not missing — an absent pseudo-candidate row means none were recorded.
          await tx.$executeRawUnsafe(
            `INSERT INTO geo.sa1_election_metric (sa1_code, election_id, metric_key, value, booth_n, attributed_votes)
             WITH formal AS (
               SELECT br.polling_place_id, SUM(br.votes)::float AS formal_votes
                 FROM geo.booth_result br
                WHERE br.election_id = $1 AND br.kind = 'fp'
                GROUP BY br.polling_place_id
             ),
             inf AS (
               SELECT br.polling_place_id, SUM(br.votes)::float AS informal_votes
                 FROM geo.booth_result br
                WHERE br.election_id = $1 AND br.kind = 'informal'
                GROUP BY br.polling_place_id
             ),
             booth_inf AS (
               SELECT f.polling_place_id,
                      COALESCE(i.informal_votes, 0) / NULLIF(f.formal_votes + COALESCE(i.informal_votes, 0), 0) AS inf01
                 FROM formal f
                 LEFT JOIN inf i ON i.polling_place_id = f.polling_place_id
             )
             SELECT v.sa1_code, $1, 'informality01',
                    SUM(v.votes * bi.inf01)::float / SUM(v.votes),
                    COUNT(*)::int,
                    SUM(v.votes)::int
               FROM geo.sa1_booth_vote v
               JOIN booth_inf bi ON bi.polling_place_id = v.polling_place_id
              WHERE v.election_id = $1 AND v.votes > 0 AND bi.inf01 IS NOT NULL
              GROUP BY v.sa1_code`,
            electionId,
          );
        } else {
          // ── b) IDW fallback: k=4 nearest ordinary booths, same electorate, 1/(d+50)². ──
          // Materialised once (ON COMMIT DROP) so the KNN join runs a single time for both
          // metric families. Booths must be election-day (no pre-poll/PPVC/postal), carry
          // geometry, sit in the SA1's electorate, and have results for this election.
          // Created empty then filled with INSERT … SELECT: bind parameters are not allowed
          // inside CREATE TABLE AS (a utility statement) on the extended protocol.
          await tx.$executeRawUnsafe(
            `CREATE TEMP TABLE _sa1_knn (sa1_code TEXT, polling_place_id TEXT, w DOUBLE PRECISION) ON COMMIT DROP`,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO _sa1_knn (sa1_code, polling_place_id, w)
             SELECT c.sa1_code, b.id AS polling_place_id,
                    1.0 / POWER(ST_Distance(c.pt::geography, b.geom::geography) + 50, 2) AS w
               FROM (
                 SELECT e.sa1_code, e.${electCol} AS elect_code, ST_PointOnSurface(s.geom) AS pt
                   FROM geo.sa1_electorate e
                   JOIN geo.sa1 s ON s.code = e.sa1_code
                  WHERE s.geom IS NOT NULL AND e.${electCol} IS NOT NULL
               ) c
              CROSS JOIN LATERAL (
                 SELECT p.id, p.geom
                   FROM geo.polling_place p
                  WHERE p.jurisdiction = $2
                    AND p.geom IS NOT NULL
                    AND p.${electCol} = c.elect_code
                    AND (p.place_type IS NULL
                         OR (p.place_type NOT ILIKE '%pre%'
                             AND p.place_type NOT ILIKE '%postal%'
                             AND upper(p.place_type) <> 'PPVC'))
                    AND EXISTS (SELECT 1 FROM geo.booth_result br
                                 WHERE br.election_id = $1 AND br.polling_place_id = p.id)
                  ORDER BY p.geom <-> c.pt
                  LIMIT 4
               ) b`,
            electionId, elections[0].jurisdiction,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO geo.sa1_election_metric (sa1_code, election_id, metric_key, value, booth_n, attributed_votes)
             WITH ${BOOTH_COMP_CTE}
             SELECT k.sa1_code, $1, 'competitiveness01',
                    SUM(k.w * bc.comp01) / NULLIF(SUM(k.w), 0),
                    COUNT(*)::int,
                    NULL
               FROM _sa1_knn k
               JOIN booth_comp bc ON bc.polling_place_id = k.polling_place_id
              GROUP BY k.sa1_code`,
            electionId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO geo.sa1_election_metric (sa1_code, election_id, metric_key, value, booth_n, attributed_votes)
             WITH ${BOOTH_FP_SHARE_CTES}
             SELECT k.sa1_code, $1, 'fp_share:' || s.party_code,
                    SUM(k.w * s.share) / NULLIF(SUM(k.w), 0),
                    COUNT(*)::int,
                    NULL
               FROM _sa1_knn k
               JOIN share s ON s.polling_place_id = k.polling_place_id
              GROUP BY k.sa1_code, s.party_code`,
            electionId,
          );
        }
      },
      { timeout: HOUR_MS, maxWait: 10_000 },
    );

    const [stats] = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS rows,
              count(DISTINCT sa1_code)::int AS sa1s,
              count(DISTINCT metric_key)::int AS keys,
              count(*) FILTER (WHERE attributed_votes IS NOT NULL AND attributed_votes < 30)::int AS low_conf
         FROM geo.sa1_election_metric WHERE election_id = $1`, electionId,
    )) as Array<{ rows: number; sa1s: number; keys: number; low_conf: number }>;
    log(`  ✓ ${stats.rows.toLocaleString()} metric rows (${stats.sa1s.toLocaleString()} SA1s × ${stats.keys} keys; ${stats.low_conf} low-confidence < 30 votes)`);

    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
       VALUES ('sa1_election_metrics','SA1 election metrics','(derived from geo.booth_result + geo.sa1_booth_vote)',NULL,$1,
               (SELECT count(*) FROM geo.sa1_election_metric),'loaded',now())
       ON CONFLICT (key) DO UPDATE SET
         label=EXCLUDED.label, source_url=EXCLUDED.source_url, licence=EXCLUDED.licence,
         row_count=EXCLUDED.row_count, status='loaded', last_ingested=now(), updated_at=now()`,
      "Derived – AEC © Commonwealth of Australia (CC BY 4.0)",
    );
    log("  ✓ geo.dataset_meta updated (sa1_election_metrics)");
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("geo:sa1-election-metrics failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
