import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Give every SA1 and mesh block a place-like NAME — they ship from the ABS unnamed and
 * render as bare numeric codes otherwise.
 *   npm --prefix apps/api run geo:names
 *
 * Run after `prisma migrate deploy` applies 20260710130000_geo_area_names (adds
 * geo.meshblock.name + its trigram index) and the ASGS layers are loaded.
 *
 * WHY THIS SHAPE. There is no street/suburb/locality data in the DB (G-NAF's address_label is
 * only "number · postcode"), so the finest NAMED anchor is the SA2 suburb (geo.sa2.name). Names
 * are derived purely from the geometry + the ASGS name hierarchy:
 *   SA1  = "{SA2 suburb} {compass word}"      e.g. "Fitzroy North", "Coolum Beach South-West"
 *   MB   = "{SA1 name} · {compass abbrev}"     e.g. "Fitzroy North · SE"
 * Compass = the child centroid's bearing from its parent's centroid (8 sectors + Central for
 * coincident centroids). A trailing ordinal is added ONLY when >1 sibling shares a sector; a
 * parent with a single child gives the child the parent's name unqualified.
 *
 * Idempotent: recomputes and overwrites deterministically (stable ORDER BY tiebreaks on code).
 * Pass A (SA1, ~62k) is one UPDATE; Pass B (mesh blocks, ~368k) is batched by state digit to
 * bound work_mem over 368k MultiPolygon centroids.
 */

// 0=N clockwise. ST_Azimuth ERRORS on coincident points, so the CASE guards with ST_Distance=0
// before ever calling it (Postgres CASE is short-circuit per row).
const SECTOR_SQL = (labels: string[]) =>
  `(ARRAY[${labels.map((l) => `'${l}'`).join(",")}])[(floor((degrees(ST_Azimuth(pc, cc)) + 22.5) / 45)::int % 8) + 1]`;
const WORDS = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];
const ABBR = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const prisma = app.get(PrismaService);
  const log = (m: string) => console.log(m); // eslint-disable-line no-console
  const HOUR_MS = 60 * 60 * 1000;

  try {
    const [{ named }] = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS named FROM geo.sa2 WHERE name IS NOT NULL`,
    )) as Array<{ named: number }>;
    if (named === 0) {
      log("geo.sa2 has no names — load the ASGS boundaries first. Nothing to do.");
      return;
    }

    // ── Pass A: SA1 = suburb + compass word ─────────────────────────────────────
    log("Naming SA1s from their SA2 suburb + compass sector…");
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL work_mem = '512MB'`);
        await tx.$executeRawUnsafe(
          `WITH s2 AS (SELECT code, name, ST_Centroid(geom) AS c FROM geo.sa2),
                base AS (
                  SELECT s.code AS sa1_code, s.sa2_code, p.name AS suburb, p.c AS pc, ST_Centroid(s.geom) AS cc
                  FROM geo.sa1 s JOIN s2 p ON p.code = s.sa2_code),
                sect AS (
                  SELECT sa1_code, sa2_code, suburb, cc,
                         count(*) OVER (PARTITION BY sa2_code) AS sib,
                         CASE WHEN ST_Distance(cc, pc) = 0 THEN 'Central' ELSE ${SECTOR_SQL(WORDS)} END AS compass
                  FROM base),
                numbered AS (
                  SELECT sa1_code, suburb, sib, compass,
                         row_number() OVER (PARTITION BY sa2_code, compass ORDER BY ST_Y(cc) DESC, ST_X(cc), sa1_code) AS rn,
                         count(*)     OVER (PARTITION BY sa2_code, compass) AS cnt
                  FROM sect)
           UPDATE geo.sa1 s SET name = CASE
                    WHEN n.sib = 1 THEN n.suburb
                    WHEN n.cnt = 1 THEN n.suburb || ' ' || n.compass
                    ELSE n.suburb || ' ' || n.compass || ' ' || n.rn
                  END
           FROM numbered n WHERE n.sa1_code = s.code`,
        );
      },
      { timeout: HOUR_MS, maxWait: 10_000 },
    );
    const [a] = (await prisma.$queryRawUnsafe(
      `SELECT count(name)::int AS n FROM geo.sa1`,
    )) as Array<{ n: number }>;
    log(`  ✓ ${a.n.toLocaleString()} SA1s named`);

    // ── Pass B: mesh block = SA1 name + compass abbrev, batched by state digit ───
    const states = (await prisma.$queryRawUnsafe(
      `SELECT DISTINCT left(sa4_code, 1) AS d FROM geo.meshblock WHERE sa4_code IS NOT NULL ORDER BY d`,
    )) as Array<{ d: string }>;
    log(`Naming mesh blocks within each SA1 across ${states.length} state(s)…`);
    for (const { d } of states) {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL work_mem = '512MB'`);
          await tx.$executeRawUnsafe(
            `WITH s1 AS (SELECT code, name, ST_Centroid(geom) AS c FROM geo.sa1 WHERE left(code, 1) = $1),
                  base AS (
                    SELECT m.mb_code, m.sa1_code, s.name AS sa1name, s.c AS pc, ST_Centroid(m.geom) AS cc
                    FROM geo.meshblock m JOIN s1 s ON s.code = m.sa1_code
                    WHERE left(m.sa4_code, 1) = $1),
                  sect AS (
                    SELECT mb_code, sa1_code, sa1name, cc,
                           count(*) OVER (PARTITION BY sa1_code) AS sib,
                           CASE WHEN ST_Distance(cc, pc) = 0 THEN 'C' ELSE ${SECTOR_SQL(ABBR)} END AS compass
                    FROM base),
                  numbered AS (
                    SELECT mb_code, sa1name, sib, compass,
                           row_number() OVER (PARTITION BY sa1_code, compass ORDER BY ST_Y(cc) DESC, ST_X(cc), mb_code) AS rn,
                           count(*)     OVER (PARTITION BY sa1_code, compass) AS cnt
                    FROM sect)
             UPDATE geo.meshblock m SET name = CASE
                      WHEN n.sib = 1 THEN n.sa1name
                      WHEN n.cnt = 1 THEN n.sa1name || ' · ' || n.compass
                      ELSE n.sa1name || ' · ' || n.compass || ' ' || n.rn
                    END
             FROM numbered n WHERE n.mb_code = m.mb_code`,
            d,
          );
        },
        { timeout: HOUR_MS, maxWait: 10_000 },
      );
      const [b] = (await prisma.$queryRawUnsafe(
        `SELECT count(name)::int AS n FROM geo.meshblock WHERE left(sa4_code,1) = $1`,
        d,
      )) as Array<{ n: number }>;
      log(`  ✓ state ${d}: ${b.n.toLocaleString()} mesh blocks named`);
    }

    const [tot] = (await prisma.$queryRawUnsafe(
      `SELECT count(name)::int AS n FROM geo.meshblock`,
    )) as Array<{ n: number }>;
    log(`  ✓ ${tot.n.toLocaleString()} mesh blocks named in total`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("geo:names failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
