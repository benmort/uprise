import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import { GeoService } from "../../geo/geo.service";
import { CanvassingService } from "../../canvassing/canvassing.service";
import { orderByLocality, planTurfs, type PlannerBlock } from "../../canvassing/turf-cut-plan";

/** Rough centroid (mean of the first ring's vertices) of a GeoJSON Polygon/MultiPolygon — enough
 *  for the locality sort. GeoJSON coords are [lng, lat]. */
function centroidOf(geometry: unknown): { lat: number; lng: number } | undefined {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  const ring =
    g?.type === "Polygon"
      ? (g.coordinates as number[][][])?.[0]
      : g?.type === "MultiPolygon"
        ? (g.coordinates as number[][][][])?.[0]?.[0]
        : undefined;
  if (!ring?.length) return undefined;
  let lat = 0;
  let lng = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

/**
 * Auto-cut turf from mesh blocks across a tenant's campaigns, sized to a target address range.
 * For each campaign it: (optionally) deletes existing turfs, enumerates the mesh blocks in the
 * campaign boundary, counts each block's boundary-clipped G-NAF addresses, greedily groups them
 * into turfs of [min,max] addresses (see turf-cut-plan.ts), and cuts each turf with an auto-name.
 *
 * DRY-RUN BY DEFAULT — prints the plan and writes nothing. Pass `--apply` to delete + create.
 *
 *   pnpm --filter api canvass:cut-turf            # dry-run, common-threads, 60–100
 *   pnpm --filter api canvass:cut-turf --apply    # actually cut (destructive: deletes existing turfs)
 *
 * Flags: --tenant=<slug> (default common-threads), --min=60, --max=100,
 *        --universe=hybrid|existing|none (default hybrid — loads cold G-NAF doors into each turf),
 *        --campaign=<name substring> (limit to matching campaigns), --status=ACTIVE (default; "all" for any).
 * Needs prod DATABASE_URL (+ BLOB not required here). Idempotent only in that --apply always clears first.
 */
function arg(name: string, dflt?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const apply = has("apply");
  const tenantSlug = arg("tenant", "common-threads")!;
  const min = Number(arg("min", "60"));
  const max = Number(arg("max", "100"));
  const universe = (arg("universe", "hybrid") as "hybrid" | "existing" | "none");
  const campaignFilter = arg("campaign")?.toLowerCase();
  const statusFilter = (arg("status", "ACTIVE") as string).toUpperCase();
  const limit = Number(arg("limit", "0")); // >0 caps turfs cut per campaign (validation runs)
  const minCoverage = Number(arg("min-coverage", "0.6")); // include a mesh block only if >this fraction is inside

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  const geo = app.get(GeoService);
  const canvassing = app.get(CanvassingService);
  const log = (...a: unknown[]) => console.log(...a); // eslint-disable-line no-console

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new Error(`No tenant with slug "${tenantSlug}"`);

    const campaigns = await prisma.canvassCampaign.findMany({
      where: { tenantId: tenant.id, ...(statusFilter === "ALL" ? {} : { status: statusFilter as never }) },
      select: { id: true, name: true, boundary: true },
      orderBy: { name: "asc" },
    });
    const targets = campaigns.filter((c) => !campaignFilter || c.name.toLowerCase().includes(campaignFilter));

    log(`${apply ? "APPLY" : "DRY-RUN"} · tenant=${tenantSlug} · ${targets.length} campaign(s) · target ${min}–${max} addresses/turf · MBs >${Math.round(minCoverage * 100)}% inside · universe=${universe}\n`);

    const totals = { turfs: 0, addresses: 0, outOfRange: 0, deleted: 0, failed: 0 };
    for (const c of targets) {
      if (!c.boundary) {
        log(`• ${c.name}: no boundary — skipped`);
        continue;
      }
      // Mesh blocks in the boundary + their boundary-clipped address counts.
      const fc = await geo.areasInBoundary("mb", c.boundary);
      const codes = fc.features.map((f) => ({ level: "mb", code: String(f.properties.code) }));
      const counts = codes.length ? await geo.areaAddressCount(codes) : { addresses: 0, byArea: {} };
      // Only mesh blocks that are mostly (>minCoverage) inside the electorate — drop the slivers.
      const kept = fc.features.filter(
        (f) => (typeof f.properties.coverage === "number" ? f.properties.coverage : 1) > minCoverage,
      );
      const blocks: PlannerBlock[] = kept.map((f) => {
        const code = String(f.properties.code);
        const whole = counts.byArea[`mb:${code}`] ?? 0;
        const coverage = typeof f.properties.coverage === "number" ? f.properties.coverage : 1;
        const c = centroidOf(f.geometry);
        return {
          code,
          name: (f.properties.name as string) ?? code,
          addresses: Math.round(whole * coverage),
          lat: c?.lat,
          lng: c?.lng,
        };
      });

      // Locality-order the blocks so each packed turf is a compact, adjacent cluster.
      const plans = planTurfs(orderByLocality(blocks), { min, max });
      const addrTotal = plans.reduce((n, p) => n + p.addresses, 0);
      const oor = plans.filter((p) => p.outOfRange);
      totals.turfs += plans.length;
      totals.addresses += addrTotal;
      totals.outOfRange += oor.length;

      log(`• ${c.name}: ${kept.length}/${fc.features.length} mesh blocks kept, ~${addrTotal.toLocaleString()} addresses → ${plans.length} turf(s)` +
        (oor.length ? `  (${oor.length} out of ${min}–${max}: ${oor.map((p) => p.addresses).join(", ")})` : ""));

      if (!apply) {
        for (const p of plans.slice(0, 3)) log(`    e.g. "${p.name}" — ${p.blockCount} MB, ${p.addresses} addr`);
        continue;
      }

      // Destructive from here: clear existing turfs, then cut the plan.
      const existing = await canvassing.listTurfs(tenant.id, c.id);
      for (const t of existing) {
        await canvassing.deleteTurf(tenant.id, (t as { id: string }).id);
        totals.deleted++;
      }
      const toCut = limit > 0 ? plans.slice(0, limit) : plans;
      let cut = 0;
      let failed = 0;
      for (const p of toCut) {
        try {
          const turf = await canvassing.createTurfFromAreas(tenant.id, {
            name: p.name,
            campaignId: c.id,
            areas: p.codes.map((code) => ({ layer: "mb" as const, code })),
            universe,
          });
          await canvassing.rebucketTurf(tenant.id, (turf as { id: string }).id);
          cut++;
        } catch (error) {
          failed++;
          if (failed <= 5) log(`    ! "${p.name}": ${(error as Error).message}`);
        }
        if ((cut + failed) % 25 === 0) log(`    … ${cut + failed}/${toCut.length} (${failed} failed)`);
      }
      totals.failed += failed;
      log(`    ✓ ${c.name}: cleared ${existing.length}, cut ${cut}${failed ? `, ${failed} FAILED` : ""}`);
    }

    log(`\n${apply ? "done" : "dry-run"} — ${totals.turfs} turf(s), ~${totals.addresses.toLocaleString()} addresses` +
      (totals.outOfRange ? `, ${totals.outOfRange} outside ${min}–${max}` : "") +
      (apply ? `, ${totals.deleted} old turf(s) deleted` : ""));
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("canvass:cut-turf failed:", error); // eslint-disable-line no-console
    process.exit(1);
  });
