import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Light up the chamber layers on a database that already has geo.address_region mapped.
 *   npm --prefix apps/api run geo:chambers
 *
 * The 20260709120000_geo_chambers_wards migration creates and populates the chamber-pure
 * geometry (geo.sed_lower / geo.sed_upper) but leaves the per-address columns NULL and
 * publishes no address counts for them — a 16.9M-row UPDATE has no business holding a write
 * lock for the length of a deploy. This script does that one step.
 *
 * It is cheap because chamber attribution is NOT a spatial join: every ABS sed row maps
 * deterministically to its lower and upper cell by name, so this is a hash join against a
 * 432-row crosswalk rather than 16.9M ST_Contains tests. Expect minutes, not hours — unlike
 * `geo:map`, which TRUNCATEs address_region and re-runs the CED/SED/LGA point-in-polygon
 * joins from scratch.
 *
 * Idempotent: the `IS DISTINCT FROM` guard makes a second run a near no-op, and the counts
 * are rebuilt from the columns. The columns and the counts are published in the SAME
 * transaction, so the layer is never half-live (addressCount populated while contactCount
 * still reads a NULL column, which would overstate "addresses without contacts").
 *
 * `geo:map` performs the same work as part of a full re-ingest; this is the fast path.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const prisma = app.get(PrismaService);
  const log = (m: string) => console.log(m); // eslint-disable-line no-console
  const HOUR_MS = 60 * 60 * 1000;

  try {
    const [{ mapped }] = (await prisma.$queryRawUnsafe(
      `SELECT count(sed_code)::int AS mapped FROM geo.address_region`,
    )) as Array<{ mapped: number }>;
    if (mapped === 0) {
      log("geo.address_region has no sed_code — run geo:map first. Nothing to do.");
      return;
    }
    log(`Backfilling chamber columns for ${mapped.toLocaleString()} mapped addresses…`);

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL work_mem = '512MB'`);
        await tx.$executeRawUnsafe(
          `UPDATE geo.address_region ar
              SET sed_lower_code = x.sed_lower_code, sed_upper_code = x.sed_upper_code
             FROM geo.sed_chamber_xwalk x
            WHERE x.sed_code = ar.sed_code
              AND (ar.sed_lower_code IS DISTINCT FROM x.sed_lower_code
                OR ar.sed_upper_code IS DISTINCT FROM x.sed_upper_code)`,
        );

        // Publish the counts in the SAME transaction as the columns they are derived from,
        // so a reader never sees a populated addressCount beside an empty contactCount.
        for (const [kind, col] of [
          ["sed_lower", "sed_lower_code"],
          ["sed_upper", "sed_upper_code"],
          ["ward", "ward_code"],
        ] as const) {
          await tx.$executeRawUnsafe(`DELETE FROM geo.region_address_count WHERE kind = '${kind}'`);
          await tx.$executeRawUnsafe(
            `INSERT INTO geo.region_address_count (kind, code, address_count, updated_at)
             SELECT '${kind}', ${col}, count(*), now() FROM geo.address_region
              WHERE ${col} IS NOT NULL GROUP BY ${col}`,
          );
        }
      },
      { timeout: HOUR_MS, maxWait: 10_000 },
    );

    const [counts] = (await prisma.$queryRawUnsafe(
      `SELECT count(sed_lower_code)::int AS lower, count(sed_upper_code)::int AS upper
       FROM geo.address_region`,
    )) as Array<{ lower: number; upper: number }>;
    log(`  ✓ ${counts.lower.toLocaleString()} addresses attributed to a lower-house seat`);
    log(`  ✓ ${counts.upper.toLocaleString()} attributed to an upper-house seat (Victoria + Tasmania only)`);
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("geo:chambers failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
