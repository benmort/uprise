import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Build geo.address_region from already-loaded geo.gnaf_address + boundaries
 * (run after geo:load — see README). Idempotent: rebuilds the mapping each run.
 *   npm --prefix apps/api run geo:map
 *
 * - mesh block from G-NAF (geo.gnaf_address.mb_code)
 * - SA1–SA4 + LGA from the mesh-block codes (deterministic nesting)
 * - federal CED + state SED via GIST-indexed ST_Contains (latest electoral boundaries)
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const prisma = app.get(PrismaService);
  try {
    const log = (m: string) => console.log(m); // eslint-disable-line no-console

    log("Rebuilding geo.address_region from mesh blocks…");
    await prisma.$executeRawUnsafe(`TRUNCATE geo.address_region`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.address_region (gnaf_pid, mb_code, sa1_code, sa2_code, sa3_code, sa4_code, lga_code)
       SELECT a.gnaf_pid, a.mb_code, m.sa1_code, m.sa2_code, m.sa3_code, m.sa4_code, m.lga_code
       FROM geo.gnaf_address a
       LEFT JOIN geo.meshblock m ON m.mb_code = a.mb_code`,
    );

    // Federal + state only (LGA mapping intentionally dropped). The point-in-polygon
    // runs as a GIST-driven JOIN subquery (per-polygon index scan over the points),
    // then updates address_region by primary key — far cheaper at national scale than
    // a 3-table UPDATE…FROM, which the planner tends to turn into a giant cross join.
    // Each UPDATE runs in its own transaction with SET LOCAL work_mem so the larger
    // work_mem reliably applies on the SAME connection (a plain SET would be lost if a
    // pooler hands the next statement a different backend), auto-resets on commit, and
    // each join still commits independently (no one giant 30-min atomic write).
    const HOUR_MS = 60 * 60 * 1000;
    const spatialJoin = (label: string, sql: string) =>
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL work_mem = '512MB'`);
          await tx.$executeRawUnsafe(sql);
        },
        { timeout: HOUR_MS, maxWait: 10_000 },
      ).then(() => log(`  ✓ ${label}`));

    log("Spatial join → federal CED…");
    await spatialJoin(
      "CED",
      `UPDATE geo.address_region ar SET ced_code = p.code
       FROM (SELECT a.gnaf_pid, d.code FROM geo.ced d JOIN geo.gnaf_address a ON ST_Contains(d.geom, a.geom)) p
       WHERE p.gnaf_pid = ar.gnaf_pid`,
    );

    log("Spatial join → state SED…");
    await spatialJoin(
      "SED",
      `UPDATE geo.address_region ar SET sed_code = p.code
       FROM (SELECT a.gnaf_pid, d.code FROM geo.sed d JOIN geo.gnaf_address a ON ST_Contains(d.geom, a.geom)) p
       WHERE p.gnaf_pid = ar.gnaf_pid`,
    );

    log("Spatial join → local LGA…");
    await spatialJoin(
      "LGA",
      `UPDATE geo.address_region ar SET lga_code = p.code
       FROM (SELECT a.gnaf_pid, d.code FROM geo.lga d JOIN geo.gnaf_address a ON ST_Contains(d.geom, a.geom)) p
       WHERE p.gnaf_pid = ar.gnaf_pid`,
    );

    // Precompute national address counts per region (geo.region_address_count) —
    // the summary the API reads instead of aggregating 16.9M address_region rows
    // per request. One index-only GROUP BY per kind; counts are as fresh as this
    // ETL run (dataset_meta.last_ingested).
    log("Refreshing region address counts…");
    await prisma.$executeRawUnsafe(`TRUNCATE geo.region_address_count`);
    for (const [kind, col] of [
      ["ced", "ced_code"],
      ["sed", "sed_code"],
      ["lga", "lga_code"],
      ["mb", "mb_code"],
      ["sa1", "sa1_code"],
      ["sa2", "sa2_code"],
      ["sa3", "sa3_code"],
      ["sa4", "sa4_code"],
      // State/Territory: leading SA4 digit for the eight states + NT/ACT, but the
      // SA3 code for Other Territories (digit 9) so Christmas Is./Cocos/Jervis Bay/
      // Norfolk Is. count separately (mirrors the geo.state split below).
      ["state", "CASE WHEN left(sa4_code, 1) = '9' THEN sa3_code ELSE left(sa4_code, 1) END"],
    ] as const) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO geo.region_address_count (kind, code, address_count, updated_at)
         SELECT '${kind}', ${col}, COUNT(*), now() FROM geo.address_region
         WHERE ${col} IS NOT NULL GROUP BY ${col}`,
      );
    }
    log("  ✓ region_address_count");

    // Rebuild the derived State/Territory boundary layer — the explorer's States
    // kind reads this. The eight states + NT/ACT are a union of SA4s per leading
    // digit; Other Territories (digit 9) are ONE ASGS SA4 (901) but distinct SA3s
    // (Christmas Is., Cocos (Keeling), Jervis Bay, Norfolk Is.), so split them into
    // their own state rows (code = SA3 code) rather than lumping them as one.
    await prisma.$executeRawUnsafe(`DELETE FROM geo.state`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.state (code, name, geom)
       SELECT s.d,
         CASE s.d
           WHEN '1' THEN 'New South Wales' WHEN '2' THEN 'Victoria' WHEN '3' THEN 'Queensland'
           WHEN '4' THEN 'South Australia' WHEN '5' THEN 'Western Australia' WHEN '6' THEN 'Tasmania'
           WHEN '7' THEN 'Northern Territory' WHEN '8' THEN 'Australian Capital Territory'
           ELSE 'State ' || s.d
         END,
         ST_Multi(ST_Union(s.geom))
       FROM (SELECT left(code, 1) AS d, geom FROM geo.sa4 WHERE left(code, 1) <> '9') s GROUP BY s.d`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.state (code, name, geom)
       SELECT code, COALESCE(name, code), ST_Multi(ST_Union(geom))
       FROM geo.sa3 WHERE left(code, 1) = '9' GROUP BY code, name`,
    );
    log("  ✓ geo.state (states + split Other Territories)");

    // Register the derived State/Territory layer as a dataset so it shows on
    // /data/datasets alongside the divisions/areas/addresses layers.
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
       VALUES ('state','States & territories','(derived from ASGS SA4)','May 2026','CC BY 4.0',(SELECT count(*) FROM geo.state),'loaded',now())
       ON CONFLICT (key) DO UPDATE SET
         label=EXCLUDED.label, source_url=EXCLUDED.source_url, release_date=EXCLUDED.release_date,
         licence=EXCLUDED.licence, row_count=EXCLUDED.row_count, status='loaded',
         last_ingested=now(), updated_at=now()`,
    );

    // G-NAF carries its full provenance here (geo:load-boundaries owns the boundary
    // layers' provenance); this also clears the seed's stale "(demo)" label/release.
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
       VALUES ('gnaf','G-NAF addresses',$1,'May 2026',$2,(SELECT count(*) FROM geo.gnaf_address),'loaded',now())
       ON CONFLICT (key) DO UPDATE SET
         label=EXCLUDED.label, source_url=EXCLUDED.source_url, release_date=EXCLUDED.release_date,
         licence=EXCLUDED.licence, row_count=EXCLUDED.row_count, status='loaded',
         last_ingested=now(), updated_at=now()`,
      "https://data.gov.au/data/dataset/19432f89-dc3a-4ef3-b943-5326ef1dbecc",
      "CC BY 4.0",
    );

    // Re-affirm row counts for the loaded boundary layers (labels/provenance already
    // set by geo:load-boundaries); includes SA1–SA4 so /settings/data shows real counts.
    for (const [key, table] of [
      ["asgs_mb", "geo.meshblock"],
      ["sa1", "geo.sa1"],
      ["sa2", "geo.sa2"],
      ["sa3", "geo.sa3"],
      ["sa4", "geo.sa4"],
      ["ced", "geo.ced"],
      ["sed", "geo.sed"],
      ["lga", "geo.lga"],
    ] as const) {
      await prisma.$executeRawUnsafe(
        `UPDATE geo.dataset_meta SET row_count = (SELECT count(*) FROM ${table}),
           status = 'loaded', last_ingested = now(), updated_at = now() WHERE key = $1`,
        key,
      );
    }

    const [{ count }] = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS count FROM geo.address_region`,
    )) as Array<{ count: number }>;
    log(`Done: geo.address_region has ${count.toLocaleString()} rows.`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("geo:map failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
