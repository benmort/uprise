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

    log("Spatial join → federal CED…");
    await prisma.$executeRawUnsafe(
      `UPDATE geo.address_region ar SET ced_code = d.code
       FROM geo.gnaf_address a, geo.ced d
       WHERE ar.gnaf_pid = a.gnaf_pid AND ST_Contains(d.geom, a.geom)`,
    );

    log("Spatial join → state SED…");
    await prisma.$executeRawUnsafe(
      `UPDATE geo.address_region ar SET sed_code = d.code
       FROM geo.gnaf_address a, geo.sed d
       WHERE ar.gnaf_pid = a.gnaf_pid AND ST_Contains(d.geom, a.geom)`,
    );

    // Refresh dataset_meta row counts.
    for (const [key, table] of [
      ["gnaf", "geo.gnaf_address"],
      ["asgs_mb", "geo.meshblock"],
      ["lga", "geo.lga"],
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
