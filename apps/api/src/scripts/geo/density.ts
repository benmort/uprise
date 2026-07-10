import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import { TILE_SOURCE } from "../../geo/geo.service";

/**
 * Publish the area of every region, so address density is a division.
 *   npm --prefix apps/api run geo:density
 *
 * Run after `prisma migrate deploy` applies 20260711120000_geo_region_area. Idempotent and
 * re-runnable: it only rewrites a row whose area actually changed, so a second run is a
 * no-op. Re-run after `geo:load-boundaries` (new or corrected geometry), never otherwise —
 * an area does not change because addresses did.
 *
 * Deliberately NOT part of `geo:map`. Area depends on geometry alone; `geo:map` TRUNCATEs
 * `geo.address_region` and redoes every spatial join from scratch (hours). Coupling the two
 * would mean a boundary correction could not be published without a full re-ingest. This
 * takes seconds: `ST_Area(geom::geography)` over all 61,811 SA1 polygons measures ~2.5s.
 *
 * DENSITY DEGRADES SYMMETRICALLY. Readers compute
 *   density = address_count / NULLIF(area_km2, 0)
 * so a region with no area yields NULL — "no data" — rather than zero or some other number
 * the address count contradicts. `address_count` remains meaningful on its own. This is the
 * chambers lesson: never publish half of a derived figure. The summary at the end names
 * every kind that has counts but no area, so a partial run is visible rather than silent.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const log = (m: string) => console.log(m); // eslint-disable-line no-console

  try {
    // The kinds actually carrying counts — no point measuring a layer nobody reads.
    const present = (await prisma.$queryRawUnsafe(
      `SELECT DISTINCT kind FROM geo.region_address_count ORDER BY kind`,
    )) as Array<{ kind: string }>;

    if (present.length === 0) {
      log("geo.region_address_count is empty — run geo:map first.");
      return;
    }

    log(`Measuring ${present.length} region kinds…`);
    for (const { kind } of present) {
      const src = TILE_SOURCE[kind];
      if (!src) {
        // A kind with counts but no geometry table. Nothing to measure; density stays NULL.
        log(`  · ${kind.padEnd(19)} no geometry table — density will read as no-data`);
        continue;
      }

      const started = Date.now();
      // `geom IS NOT NULL` excludes the geometry-less pseudo-rows the ABS ships (the
      // per-jurisdiction "No usual address" / "Migratory" entries) — they would otherwise
      // take an area of 0 and a density of infinity.
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE geo.region_address_count rac
            SET area_km2 = a.km2, updated_at = now()
           FROM (SELECT ${src.codeCol} AS code, ST_Area(geom::geography) / 1e6 AS km2
                   FROM ${src.table}
                  WHERE geom IS NOT NULL) a
          WHERE rac.kind = $1
            AND rac.code = a.code
            AND rac.area_km2 IS DISTINCT FROM a.km2`,
        kind,
      );
      log(`  ✓ ${kind.padEnd(19)} ${String(updated).padStart(7)} rows  ${Date.now() - started}ms`);
    }

    // Parity check, printed rather than asserted: a kind with counts but no area is not an
    // error (a layer may legitimately lack geometry), but it must never be a surprise.
    const summary = (await prisma.$queryRawUnsafe(
      `SELECT kind,
              count(*)::int                                        AS regions,
              count(area_km2)::int                                 AS with_area,
              round(min(address_count / NULLIF(area_km2, 0))::numeric, 1) AS min_density,
              round(max(address_count / NULLIF(area_km2, 0))::numeric, 0) AS max_density
         FROM geo.region_address_count
        GROUP BY kind ORDER BY kind`,
    )) as Array<{
      kind: string;
      regions: number;
      with_area: number;
      min_density: string | null;
      max_density: string | null;
    }>;

    log("\nkind                 regions  with area   density/km² (min → max)");
    for (const r of summary) {
      const gap = r.regions - r.with_area;
      const range =
        r.min_density === null ? "—" : `${r.min_density} → ${r.max_density}`;
      log(
        `  ${r.kind.padEnd(19)} ${String(r.regions).padStart(6)} ${String(r.with_area).padStart(10)}` +
          `   ${range}${gap > 0 ? `   (${gap} without area → no-data)` : ""}`,
      );
    }
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err); // eslint-disable-line no-console
  process.exit(1);
});
