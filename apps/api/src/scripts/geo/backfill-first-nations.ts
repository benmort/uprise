import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Attribute every address to its Indigenous geography, and publish the address counts.
 *   npm --prefix apps/api run geo:first-nations
 *
 * Run after `prisma migrate deploy` applies 20260710120000_geo_first_nations and
 * `geo:load-first-nations` has loaded the polygons. `geo:map` performs the same work as part
 * of a full re-ingest; this is the fast path for a database whose address_region is already
 * mapped (geo:map TRUNCATEs it and redoes every spatial join from scratch — hours).
 *
 * ONE spatial join, three levels. geo.iloc carries `iare_code` and `ireg_code` denormalised
 * straight from the ABS row, so a single address → ILOC ST_Contains attributes all three.
 *
 * THE COLUMNS AND THE COUNTS PUBLISH IN THE SAME TRANSACTION. This is not incidental. The
 * chambers migration published region_address_count while leaving the per-address columns
 * NULL, and the layer lied: divisionDetail reads addressCount from the summary and
 * contactCount from the column, so a Melbourne seat reported contactCount = 0 and overstated
 * "addresses without contacts" by every contact the org actually had there. A reader must
 * never see one without the other.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn", "log"] });
  const prisma = app.get(PrismaService);
  const log = (m: string) => console.log(m); // eslint-disable-line no-console
  const HOUR_MS = 60 * 60 * 1000;

  try {
    const [{ locs }] = (await prisma.$queryRawUnsafe(`SELECT count(*)::int AS locs FROM geo.iloc`)) as Array<{
      locs: number;
    }>;
    if (locs === 0) {
      log("geo.iloc is empty — run geo:load-first-nations first. Nothing to do.");
      return;
    }
    const [{ addrs }] = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS addrs FROM geo.gnaf_address`,
    )) as Array<{ addrs: number }>;
    log(`Attributing ${addrs.toLocaleString()} addresses against ${locs.toLocaleString()} Indigenous Locations…`);

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL work_mem = '512MB'`);
        // GIST-driven join subquery, then a PK update — the planner-friendly shape map.ts
        // uses for CED/SED/LGA, rather than a multi-table UPDATE…FROM.
        await tx.$executeRawUnsafe(
          `UPDATE geo.address_region ar
              SET iloc_code = p.code, iare_code = p.iare_code, ireg_code = p.ireg_code
             FROM (SELECT a.gnaf_pid, l.code, l.iare_code, l.ireg_code
                     FROM geo.iloc l
                     JOIN geo.gnaf_address a ON ST_Contains(l.geom, a.geom)) p
            WHERE p.gnaf_pid = ar.gnaf_pid`,
        );

        for (const [kind, col] of [
          ["ireg", "ireg_code"],
          ["iare", "iare_code"],
          ["iloc", "iloc_code"],
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

    const [c] = (await prisma.$queryRawUnsafe(
      `SELECT count(iloc_code)::int AS attributed FROM geo.address_region`,
    )) as Array<{ attributed: number }>;
    log(`  ✓ ${c.attributed.toLocaleString()} addresses attributed to an Indigenous Location`);
    log("  ✓ region_address_count published for ireg / iare / iloc");
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("geo:first-nations failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
