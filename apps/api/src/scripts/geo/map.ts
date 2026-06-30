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

    // Refresh dataset_meta. LGA is dropped — clear its provenance row so
    // /settings/data doesn't show a stale "loaded" LGA entry.
    await prisma.$executeRawUnsafe(`DELETE FROM geo.dataset_meta WHERE key = 'lga'`);

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
