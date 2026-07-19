import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Modal electorate attribution per SA1 → geo.sa1_electorate.
 *   npm --prefix apps/api run geo:sa1-electorate
 *
 * For every SA1, the modal ced/sed/sed_lower/sed_upper code by address count, routed via
 * geo.address_region ar JOIN geo.meshblock mb ON mb.mb_code = ar.mb_code (address_region's
 * own sa1_code is unreliable – always derive the SA1 from the mesh block). majority_share is
 * the MINIMUM across the four kinds of the modal code's address share, so < 0.9 means the
 * SA1 genuinely straddles some electorate boundary. Run after geo:map (which rebuilds
 * address_region); idempotent – one INSERT … ON CONFLICT upsert per run.
 *
 * The whole computation is one SQL statement (two passes over the ~17M-row join: one to find
 * the modes, one to count agreement), run in its own transaction with SET LOCAL work_mem so
 * the larger memory reliably applies on the same connection (mirrors map.ts).
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  const log = (m: string) => console.log(m); // eslint-disable-line no-console
  try {
    const HOUR_MS = 60 * 60 * 1000;
    log("Attributing SA1s to electorates (modal code by address count)…");
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL work_mem = '512MB'`);
        // ONE pass over the ~17M-row join (pre-aggregated to meshblock level, ~500k rows);
        // modal codes + shares then come from the tiny aggregate. The obvious
        // mode() WITHIN GROUP over the raw join sorts 17M rows repeatedly and ran for
        // 50+ minutes; this shape finishes in a couple of minutes at national scale.
        await tx.$executeRawUnsafe(
          `INSERT INTO geo.sa1_electorate
             (sa1_code, ced_code, sed_code, sed_lower_code, sed_upper_code, address_count, majority_share, updated_at)
           WITH mb_counts AS MATERIALIZED (
             SELECT ar.mb_code, ar.ced_code, ar.sed_code, ar.sed_lower_code, ar.sed_upper_code, COUNT(*)::int AS n
               FROM geo.address_region ar
              WHERE ar.mb_code IS NOT NULL
              GROUP BY 1, 2, 3, 4, 5
           ),
           base AS MATERIALIZED (
             SELECT mb.sa1_code, c.ced_code, c.sed_code, c.sed_lower_code, c.sed_upper_code, c.n
               FROM mb_counts c
               JOIN geo.meshblock mb ON mb.mb_code = c.mb_code
              WHERE mb.sa1_code IS NOT NULL
           ),
           tot AS (SELECT sa1_code, SUM(n)::int AS address_count FROM base GROUP BY 1),
           -- Modal code per kind: the code holding the most addresses. Shares are taken over
           -- the addresses that HAVE that attribution (NULLs don't dilute the vote of the
           -- attributed majority); a kind with no attributions drops out of LEAST(), and an
           -- SA1 with none anywhere coalesces to 1 (no evidence of a split).
           ced AS (
             SELECT DISTINCT ON (sa1_code) sa1_code, ced_code AS code,
                    SUM(n)::float AS m, SUM(SUM(n)) OVER (PARTITION BY sa1_code)::float AS t
               FROM base WHERE ced_code IS NOT NULL
              GROUP BY sa1_code, ced_code ORDER BY sa1_code, SUM(n) DESC
           ),
           sed AS (
             SELECT DISTINCT ON (sa1_code) sa1_code, sed_code AS code,
                    SUM(n)::float AS m, SUM(SUM(n)) OVER (PARTITION BY sa1_code)::float AS t
               FROM base WHERE sed_code IS NOT NULL
              GROUP BY sa1_code, sed_code ORDER BY sa1_code, SUM(n) DESC
           ),
           sedl AS (
             SELECT DISTINCT ON (sa1_code) sa1_code, sed_lower_code AS code,
                    SUM(n)::float AS m, SUM(SUM(n)) OVER (PARTITION BY sa1_code)::float AS t
               FROM base WHERE sed_lower_code IS NOT NULL
              GROUP BY sa1_code, sed_lower_code ORDER BY sa1_code, SUM(n) DESC
           ),
           sedu AS (
             SELECT DISTINCT ON (sa1_code) sa1_code, sed_upper_code AS code,
                    SUM(n)::float AS m, SUM(SUM(n)) OVER (PARTITION BY sa1_code)::float AS t
               FROM base WHERE sed_upper_code IS NOT NULL
              GROUP BY sa1_code, sed_upper_code ORDER BY sa1_code, SUM(n) DESC
           )
           SELECT t.sa1_code, ced.code, sed.code, sedl.code, sedu.code,
                  t.address_count,
                  COALESCE(LEAST(ced.m / NULLIF(ced.t, 0),
                                 sed.m / NULLIF(sed.t, 0),
                                 sedl.m / NULLIF(sedl.t, 0),
                                 sedu.m / NULLIF(sedu.t, 0)), 1) AS majority_share,
                  now()
             FROM tot t
             LEFT JOIN ced  USING (sa1_code)
             LEFT JOIN sed  USING (sa1_code)
             LEFT JOIN sedl USING (sa1_code)
             LEFT JOIN sedu USING (sa1_code)
           ON CONFLICT (sa1_code) DO UPDATE SET
             ced_code=EXCLUDED.ced_code, sed_code=EXCLUDED.sed_code,
             sed_lower_code=EXCLUDED.sed_lower_code, sed_upper_code=EXCLUDED.sed_upper_code,
             address_count=EXCLUDED.address_count, majority_share=EXCLUDED.majority_share,
             updated_at=now()`,
        );
      },
      { timeout: HOUR_MS, maxWait: 10_000 },
    );

    const [stats] = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE majority_share < 0.9)::int AS split,
              round(avg(majority_share)::numeric, 4) AS avg_share
         FROM geo.sa1_electorate`,
    )) as Array<{ total: number; split: number; avg_share: string }>;
    log(`  ✓ ${stats.total.toLocaleString()} SA1s attributed (avg majority share ${stats.avg_share}; ${stats.split} split < 0.9)`);

    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
       VALUES ('sa1_electorate','SA1 electorate attribution','(derived from geo.address_region × geo.meshblock)',NULL,$1,$2,'loaded',now())
       ON CONFLICT (key) DO UPDATE SET
         label=EXCLUDED.label, source_url=EXCLUDED.source_url, licence=EXCLUDED.licence,
         row_count=EXCLUDED.row_count, status='loaded', last_ingested=now(), updated_at=now()`,
      "Derived – G-NAF + ABS ASGS (CC BY 4.0)", stats.total,
    );
    log("  ✓ geo.dataset_meta updated (sa1_electorate)");
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("geo:sa1-electorate failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
