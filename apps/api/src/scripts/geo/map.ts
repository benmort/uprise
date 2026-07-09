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

    // First Nations (ABS Indigenous Structure). ONE spatial join: geo.iloc carries its
    // iare_code and ireg_code denormalised from the ABS row, so attributing an address to
    // its Indigenous Location attributes all three levels. Skipped when the layer is not
    // loaded (`geo:load-first-nations` fetches it from the ABS FeatureServer).
    const [{ ilocs }] = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS ilocs FROM geo.iloc`,
    )) as Array<{ ilocs: number }>;
    if (ilocs > 0) {
      log("Spatial join → First Nations (ILOC → IARE → IREG)…");
      await spatialJoin(
        "First Nations",
        `UPDATE geo.address_region ar
            SET iloc_code = p.code, iare_code = p.iare_code, ireg_code = p.ireg_code
           FROM (SELECT a.gnaf_pid, l.code, l.iare_code, l.ireg_code
                   FROM geo.iloc l JOIN geo.gnaf_address a ON ST_Contains(l.geom, a.geom)) p
          WHERE p.gnaf_pid = ar.gnaf_pid`,
      );
    } else {
      log("  – geo.iloc is empty (run geo:load-first-nations) — skipping the First Nations join");
    }

    // ── Chamber-pure state layers, derived from geo.sed ─────────────────────
    // Same SQL as 20260709120000_geo_chambers_wards — repeated here so a full re-ingest
    // (which reloads geo.sed from a newer ABS release) refreshes the derived layers too.
    // ABS encodes the upper-house division in the parenthetical of the name for exactly
    // the two states with distinct upper-house boundaries, so a dissolve is all it takes:
    //   Victoria  "Albert Park (Southern Metropolitan)"  → district (Legislative Council region)
    //   Tasmania  "Bass (Launceston)"                    → HoA division (Legislative Council division)
    // Gated on state NAME, never on the presence of parentheses: "Unclassified (OT)" is
    // parenthesised too. Tasmania's raw rows are HoA × LC intersection cells, so BOTH of
    // its chambers need a dissolve; Victoria's rows are already districts.
    log("Rebuilding chamber layers (sed_lower / sed_upper / crosswalk)…");
    await prisma.$executeRawUnsafe(`DELETE FROM geo.sed_upper`);
    await prisma.$executeRawUnsafe(`DELETE FROM geo.sed_lower`);
    await prisma.$executeRawUnsafe(`DELETE FROM geo.sed_chamber_xwalk`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.sed_upper (code, name, state, geom)
       SELECT '2-LC-' || upper(regexp_replace(region, '[^A-Za-z0-9]+', '-', 'g')),
              region, 'Victoria', ST_Multi(ST_Union(geom))
       FROM (SELECT substring(name from '\\(([^)]*)\\)$') AS region, geom
               FROM geo.sed WHERE state = 'Victoria') v
       GROUP BY region`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.sed_upper (code, name, state, geom)
       SELECT '6-LC-' || upper(regexp_replace(lc, '[^A-Za-z0-9]+', '-', 'g')),
              lc, 'Tasmania', ST_Multi(ST_Union(geom))
       FROM (SELECT substring(name from '\\(([^)]*)\\)$') AS lc, geom
               FROM geo.sed WHERE state = 'Tasmania') t
       GROUP BY lc`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.sed_lower (code, name, state, parent_upper_code, geom)
       SELECT code, btrim(split_part(name, ' (', 1)), 'Victoria',
              '2-LC-' || upper(regexp_replace(substring(name from '\\(([^)]*)\\)$'), '[^A-Za-z0-9]+', '-', 'g')),
              geom
       FROM geo.sed WHERE state = 'Victoria'`,
    );
    // parent_upper_code stays NULL for Tasmania: its chambers cross-cut, so a Legislative
    // Council division does not contain House of Assembly divisions.
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.sed_lower (code, name, state, parent_upper_code, geom)
       SELECT '6-HA-' || upper(regexp_replace(div, '[^A-Za-z0-9]+', '-', 'g')),
              div, 'Tasmania', NULL, ST_Multi(ST_Union(geom))
       FROM (SELECT btrim(split_part(name, ' (', 1)) AS div, geom
               FROM geo.sed WHERE state = 'Tasmania') t
       GROUP BY div`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.sed_lower (code, name, state, parent_upper_code, geom)
       SELECT code, name, state, NULL, geom FROM geo.sed
       WHERE state IN ('New South Wales', 'Queensland', 'South Australia',
                       'Western Australia', 'Australian Capital Territory', 'Northern Territory')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.sed_chamber_xwalk (sed_code, sed_lower_code, sed_upper_code)
       SELECT s.code,
              CASE WHEN s.state = 'Tasmania'
                   THEN '6-HA-' || upper(regexp_replace(btrim(split_part(s.name, ' (', 1)), '[^A-Za-z0-9]+', '-', 'g'))
                   ELSE s.code END,
              CASE WHEN s.state = 'Victoria'
                   THEN '2-LC-' || upper(regexp_replace(substring(s.name from '\\(([^)]*)\\)$'), '[^A-Za-z0-9]+', '-', 'g'))
                   WHEN s.state = 'Tasmania'
                   THEN '6-LC-' || upper(regexp_replace(substring(s.name from '\\(([^)]*)\\)$'), '[^A-Za-z0-9]+', '-', 'g'))
                   ELSE NULL END
       FROM geo.sed s WHERE s.state <> 'Other Territories'`,
    );
    log("  ✓ sed_lower / sed_upper / sed_chamber_xwalk");

    // Per-address chamber attribution is a ≤433-row crosswalk join, not a spatial one —
    // every ABS sed row maps deterministically to its lower and upper cell by name.
    log("Chamber crosswalk → per-address sed_lower/sed_upper…");
    await spatialJoin(
      "sed_lower/sed_upper",
      `UPDATE geo.address_region ar
          SET sed_lower_code = x.sed_lower_code, sed_upper_code = x.sed_upper_code
         FROM geo.sed_chamber_xwalk x
        WHERE x.sed_code = ar.sed_code`,
    );

    // Wards exist only where a council is divided, and there is no national dataset — so
    // geo.ward may legitimately be empty. Skip rather than run a pointless 16.9M-row join.
    const [{ wards }] = (await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS wards FROM geo.ward`,
    )) as Array<{ wards: number }>;
    if (wards > 0) {
      log("Spatial join → council ward…");
      await spatialJoin(
        "ward",
        `UPDATE geo.address_region ar SET ward_code = p.code
         FROM (SELECT a.gnaf_pid, w.code FROM geo.ward w JOIN geo.gnaf_address a ON ST_Contains(w.geom, a.geom)) p
         WHERE p.gnaf_pid = ar.gnaf_pid`,
      );
    } else {
      log("  – geo.ward is empty (no ward shapefiles loaded) — skipping the ward join");
    }

    // Precompute national address counts per region (geo.region_address_count) —
    // the summary the API reads instead of aggregating 16.9M address_region rows
    // per request. One index-only GROUP BY per kind; counts are as fresh as this
    // ETL run (dataset_meta.last_ingested).
    log("Refreshing region address counts…");
    await prisma.$executeRawUnsafe(`TRUNCATE geo.region_address_count`);
    for (const [kind, col] of [
      ["ced", "ced_code"],
      ["sed", "sed_code"],
      ["sed_lower", "sed_lower_code"],
      ["sed_upper", "sed_upper_code"],
      ["lga", "lga_code"],
      ["ward", "ward_code"],
      ["ireg", "ireg_code"],
      ["iare", "iare_code"],
      ["iloc", "iloc_code"],
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
    // The state-wide chambers (Senate, NSW/SA/WA Legislative Councils) have no
    // address_region column — they key off the same SA4-derived state code the `state`
    // kind uses, so an OT address counts toward the ACT or NT Senate contest, not its own.
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.region_address_count (kind, code, address_count, updated_at)
       SELECT 'chamber_electorate', ce.code, count(*), now()
         FROM geo.address_region ar
         JOIN geo.chamber_electorate ce
           ON (CASE WHEN left(ar.sa4_code, 1) = '9' THEN ar.sa3_code ELSE left(ar.sa4_code, 1) END) = ANY (ce.state_codes)
        WHERE ar.sa4_code IS NOT NULL
        GROUP BY ce.code`,
    );
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

    // The state-wide chamber electorates borrow geo.state's geometry, so they must be
    // refreshed AFTER it. `state_codes` is a static catalogue fact (the Senate's ACT
    // contest absorbs Jervis Bay and Norfolk Is.; its NT contest absorbs Christmas Is.
    // and Cocos), so only the geometry is re-derived here.
    await prisma.$executeRawUnsafe(
      `UPDATE geo.chamber_electorate ce SET geom = sub.geom
         FROM (SELECT ce2.code AS code, ST_Multi(ST_Union(s.geom)) AS geom
                 FROM geo.chamber_electorate ce2
                 JOIN geo.state s ON s.code = ANY (ce2.state_codes)
                GROUP BY ce2.code) sub
        WHERE sub.code = ce.code`,
    );
    log("  ✓ geo.chamber_electorate (Senate + state-wide legislative councils)");

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
      ["sed_lower", "geo.sed_lower"],
      ["sed_upper", "geo.sed_upper"],
      ["chamber_electorate", "geo.chamber_electorate"],
      ["ireg", "geo.ireg"],
      ["iare", "geo.iare"],
      ["iloc", "geo.iloc"],
      ["lga", "geo.lga"],
    ] as const) {
      await prisma.$executeRawUnsafe(
        `UPDATE geo.dataset_meta SET row_count = (SELECT count(*) FROM ${table}),
           status = 'loaded', last_ingested = now(), updated_at = now() WHERE key = $1`,
        key,
      );
    }
    // Wards are the one layer that can legitimately be absent: no national dataset, and
    // many councils are undivided. Report 'pending' rather than a false 'loaded'.
    await prisma.$executeRawUnsafe(
      `UPDATE geo.dataset_meta
          SET row_count = (SELECT count(*) FROM geo.ward),
              status = CASE WHEN (SELECT count(*) FROM geo.ward) > 0 THEN 'loaded' ELSE 'pending' END,
              last_ingested = CASE WHEN (SELECT count(*) FROM geo.ward) > 0 THEN now() ELSE last_ingested END,
              updated_at = now()
        WHERE key = 'ward'`,
    );

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
