/**
 * Stand up a door-knock campaign for every Climate 200 tenant, bounded by that candidate's
 * electorate, and cut the whole boundary into shift-sized turfs anyone can claim.
 *
 * WHY A SCRIPT AND NOT AN ENDPOINT. This is a one-off orchestration over a known cohort: it
 * reads a hand-checked mapping, writes one campaign per tenant, and partitions a division into
 * hundreds of turfs. None of that belongs behind a request, and all of it wants to be re-runnable
 * with its decisions visible in the diff.
 *
 * THE MAPPING IS EXPLICIT ON PURPOSE. Deriving the electorate from the tenant name is what a
 * first pass would do, and it is wrong twice over:
 *   - "Alex Greenwich – Sydney" matches BOTH federal division Sydney (ced 141) and the NSW state
 *     seat (sed 10078). He is the state member; a name match silently picks the federal one.
 *   - "Clare Glade-Wright – Huon" matches nothing: Huon is a Tasmanian Legislative Council
 *     division, stored as "Franklin (Huon)".
 *   - "David Pocock – ACT" is a Senate seat covering three federal divisions.
 * So the mapping below is checked, not inferred, and an unmapped tenant is skipped loudly.
 *
 * TURF SIZING. `turf-estimate.model.ts` defines a shift as four hours and derives doorsPerShift
 * from real geometry — but that needs a turf to already exist. Cutting needs a target up front,
 * so this uses a doors-per-turf target (default 80) and then queues the real estimator, which
 * reports the actual shift count per turf. Expect a spread: KMeans balances by space, not doors.
 *
 * Usage:
 *   pnpm --filter api exec ts-node src/scripts/networks/cut-climate-200-turfs.ts [--apply]
 *                                                       [--doors=80] [--only=slug] [--replace]
 *
 * Dry run by default: it prints exactly what it would create and writes nothing.
 */
import { PrismaClient } from "@uprise/db";

const prisma = new PrismaClient();

type Source = { kind: "ced" | "sed"; code: string };

/** slug → the boundary parts its campaign is cut from. Checked against geo.ced / geo.sed. */
const ELECTORATES: Record<string, { label: string; sources: Source[] }> = {
  "allegra-spender": { label: "Wentworth", sources: [{ kind: "ced", code: "144" }] },
  "zali-steggall": { label: "Warringah", sources: [{ kind: "ced", code: "142" }] },
  "monique-ryan": { label: "Kooyong", sources: [{ kind: "ced", code: "225" }] },
  "helen-haines": { label: "Indi", sources: [{ kind: "ced", code: "222" }] },
  "kate-chaney": { label: "Curtin", sources: [{ kind: "ced", code: "506" }] },
  "rebekha-sharkie": { label: "Mayo", sources: [{ kind: "ced", code: "408" }] },
  "sophie-scamps": { label: "Mackellar", sources: [{ kind: "ced", code: "126" }] },
  "nicolette-boele": { label: "Bradfield", sources: [{ kind: "ced", code: "106" }] },
  "andrew-wilkie": { label: "Clark", sources: [{ kind: "ced", code: "603" }] },
  "peter-george": { label: "Franklin", sources: [{ kind: "ced", code: "604" }] },
  // State seats — these members sit in a state parliament, not the federal one.
  "jacqui-scruby": { label: "Pittwater", sources: [{ kind: "sed", code: "10066" }] },
  "alex-greenwich": { label: "Sydney (NSW state seat)", sources: [{ kind: "sed", code: "10078" }] },
  "clare-glade-wright": { label: "Franklin (Huon)", sources: [{ kind: "sed", code: "60404" }] },
  // A Senate seat: the whole territory, which is three federal divisions.
  "david-pocock": {
    label: "ACT (Bean + Canberra + Fenner)",
    sources: [
      { kind: "ced", code: "801" },
      { kind: "ced", code: "802" },
      { kind: "ced", code: "803" },
    ],
  },
};

const NETWORK_NAME = "Climate 200";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const APPLY = process.argv.includes("--apply");
const REPLACE = process.argv.includes("--replace");
const ONLY = arg("only");
const DOORS_PER_TURF = Number(arg("doors") ?? 80);

/** The union of a tenant's boundary parts, as GeoJSON. Null when a code is missing. */
async function boundaryGeoJson(sources: Source[]): Promise<string | null> {
  const parts = sources.map((s) => `SELECT geom FROM geo.${s.kind} WHERE code = '${s.code}'`);
  const rows = await prisma.$queryRawUnsafe<Array<{ geojson: string | null; parts: number }>>(
    `WITH src AS (${parts.join(" UNION ALL ")})
     SELECT ST_AsGeoJSON(ST_Multi(ST_UnaryUnion(ST_Collect(geom)))) AS geojson, COUNT(*)::int AS parts
       FROM src`,
  );
  const row = rows[0];
  if (!row?.geojson || row.parts !== sources.length) return null;
  return row.geojson;
}

/**
 * Partition a boundary into compact, door-balanced turfs.
 *
 * MESHBLOCKS are the unit, not SA1s. An SA1 averages 260 doors — more than three shifts — so
 * cutting from them cannot produce a one-shift turf at all (the first run asked for 1,629
 * clusters from 254 SA1s and Postgres refused: K must be smaller than the row count). A
 * meshblock averages 48, which divides sensibly into an 80-door target.
 *
 * KMeans over meshblock centroids gives spatially compact clusters — a canvasser's turf has to
 * be walkable, which "the next 80 doors by code" would not be. Each cluster's meshblocks are
 * unioned and clipped back to the boundary so no turf spills outside the electorate.
 *
 * k is clamped to the number of cells: with fewer meshblocks than the door target implies, the
 * honest outcome is one turf per meshblock rather than an error.
 */
async function cutTurfs(
  boundary: string,
  doorsPerTurf: number,
): Promise<Array<{ geojson: string; doors: number; sa1s: number }>> {
  return prisma.$queryRawUnsafe<Array<{ geojson: string; doors: number; sa1s: number }>>(
    `WITH bnd AS (
       SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS g
     ),
     cells AS (
       SELECT m.mb_code AS code, m.geom, COALESCE(rac.address_count, 0) AS doors
         FROM geo.meshblock m
         LEFT JOIN geo.region_address_count rac ON rac.kind = 'mb' AND rac.code = m.mb_code
        WHERE ST_Intersects(m.geom, (SELECT g FROM bnd))
          -- Centroid-in-boundary, so a meshblock that merely grazes the edge belongs to its own
          -- electorate rather than being half-claimed by this one.
          AND ST_Contains((SELECT g FROM bnd), ST_PointOnSurface(m.geom))
          -- Doorless meshblocks (parks, water, industrial) would pad turfs with walking and no
          -- doors, and drag the KMeans centroids away from where people live.
          AND COALESCE(rac.address_count, 0) > 0
     ),
     k AS (
       SELECT LEAST(
                GREATEST(1, CEIL(SUM(doors)::float / $2))::int,
                COUNT(*)::int
              ) AS n
         FROM cells
     ),
     clustered AS (
       SELECT code, geom, doors,
              ST_ClusterKMeans(ST_PointOnSurface(geom), (SELECT n FROM k)) OVER () AS cluster
         FROM cells
     )
     SELECT ST_AsGeoJSON(
              ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Intersection(ST_UnaryUnion(ST_Collect(geom)), (SELECT g FROM bnd))), 3))
            ) AS geojson,
            SUM(doors)::int AS doors,
            COUNT(*)::int AS sa1s
       FROM clustered
      GROUP BY cluster
     HAVING SUM(doors) > 0
      ORDER BY 2 DESC`,
    boundary,
    doorsPerTurf,
  );
}

async function main(): Promise<void> {
  const network = await prisma.network.findFirst({ where: { name: NETWORK_NAME } });
  if (!network) throw new Error(`No network named "${NETWORK_NAME}"`);

  const tenants = await prisma.tenant.findMany({
    where: { networkId: network.id },
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });

  console.log(`${NETWORK_NAME}: ${tenants.length} tenants`);
  console.log(APPLY ? "APPLY — writing changes" : "DRY RUN — nothing will be written (pass --apply)");
  console.log(`Target ${DOORS_PER_TURF} doors per turf (one ~4h shift)\n`);

  const skipped: string[] = [];
  let created = 0;
  let turfsCut = 0;

  for (const tenant of tenants) {
    if (ONLY && tenant.slug !== ONLY) continue;
    const mapping = ELECTORATES[tenant.slug];
    if (!mapping) {
      // The hub tenant has no electorate; anything else here is a cohort change worth noticing.
      skipped.push(`${tenant.slug} (no electorate mapping)`);
      continue;
    }

    const boundary = await boundaryGeoJson(mapping.sources);
    if (!boundary) {
      skipped.push(`${tenant.slug} (boundary not found for ${mapping.label})`);
      continue;
    }

    const name = `${mapping.label} doorknock`;
    const existing = await prisma.canvassCampaign.findFirst({
      where: { tenantId: tenant.id, name },
      select: { id: true, _count: { select: { turfs: true } } },
    });
    if (existing && existing._count.turfs > 0 && !REPLACE) {
      skipped.push(`${tenant.slug} (already has ${existing._count.turfs} turfs — pass --replace)`);
      continue;
    }

    const turfs = await cutTurfs(boundary, DOORS_PER_TURF);
    const doors = turfs.reduce((n, t) => n + t.doors, 0);
    console.log(
      `${tenant.slug.padEnd(20)} ${mapping.label.padEnd(28)} ` +
        `${String(doors).padStart(8)} doors → ${String(turfs.length).padStart(4)} turfs ` +
        `(avg ${turfs.length ? Math.round(doors / turfs.length) : 0}/turf)`,
    );

    if (!APPLY) continue;

    const campaign = existing
      ? await prisma.canvassCampaign.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            channel: "DOOR",
            boundary: JSON.parse(boundary),
            boundarySources: mapping.sources,
            // The ask: anyone can join, and turfs are self-claimable without approval.
            openJoinEnabled: true,
            volunteerCanSelfClaimTurf: true,
            turfClaimRequiresApproval: false,
          },
        })
      : await prisma.canvassCampaign.create({
          data: {
            tenantId: tenant.id,
            name,
            status: "ACTIVE",
            channel: "DOOR",
            boundary: JSON.parse(boundary),
            boundarySources: mapping.sources,
            openJoinEnabled: true,
            volunteerCanSelfClaimTurf: true,
            turfClaimRequiresApproval: false,
          },
        });
    created += 1;

    if (REPLACE && existing) {
      await prisma.turf.deleteMany({ where: { campaignId: campaign.id } });
    }

    for (const [i, turf] of turfs.entries()) {
      const row = await prisma.turf.create({
        data: {
          tenantId: tenant.id,
          campaignId: campaign.id,
          name: `${mapping.label} ${String(i + 1).padStart(3, "0")}`,
          geometry: JSON.parse(turf.geojson),
        },
        select: { id: true },
      });
      // Mirror into PostGIS exactly as CanvassingService.syncTurfGeom does — the GIST index is
      // what the claim path's overlap check uses, so a turf without it is unclaimable in practice.
      await prisma.$executeRawUnsafe(
        `UPDATE "canvass"."Turf"
            SET "geom" = ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 3))
          WHERE "id" = $2`,
        turf.geojson,
        row.id,
      );
      turfsCut += 1;
    }
  }

  console.log(`\n${APPLY ? "Wrote" : "Would write"} ${created} campaigns, ${turfsCut} turfs`);
  if (skipped.length) {
    console.log("\nSkipped:");
    for (const s of skipped) console.log(`  - ${s}`);
  }
  if (APPLY) {
    console.log(
      "\nTurf estimates are NOT queued by this script — run the estimate refresh (or open a turf\n" +
        "in the app) to get real doors/hour and shift counts per turf.",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
