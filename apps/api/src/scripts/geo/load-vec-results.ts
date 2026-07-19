import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import {
  VEC_2022,
  districtFromSedName,
  slugify,
  primaryXlsUrl,
  tcpHtmlUrl,
  parsePrimarySheet,
  parseTcpHtml,
  type Cell,
  type VecVoteRow,
} from "./vec-parse";

/**
 * VEC 2022 state-election loader → geo.election + geo.polling_place + geo.booth_result.
 * State-level booth competitiveness + informality for Vic 2026 targeting, replacing federal
 * proxies. Districts are enumerated from geo.sed (the 88 Victorian districts, codes '2…');
 * per district the loader stages (downloading if absent, gitignored under data/geo/vec/2022):
 *   <slug>.xls       – 'Results by Voting Centre' (first preferences + informal, BIFF .xls)
 *   <slug>-2cp.html  – the two-candidate-preferred-by-voting-centre page (HTML table)
 * Parsing lives in ./vec-parse.ts (unit-tested); this file is I/O + DB only.
 *
 *   DATABASE_URL=… npm --prefix apps/api run geo:load-vec -- [--dir data/geo/vec/2022]
 *
 * Voting centres are resolved to geo.polling_place by (district, centre name) against the
 * already-loaded Tally Room 2022 booth master (jurisdiction 'vic', which carries coordinates
 * + sed tags) – VEC result files have no booth ids or addresses. Unmatched centres get new
 * rows id 'vic:<district>--<centre>' with sed_code but no geometry; they keep their
 * booth_result rows but can't contribute to the IDW SA1 metrics, and are logged.
 * Narracan's 2022 poll was superseded by the Jan 2023 supplementary election – its results
 * (published under the same report name) are loaded as part of 'vic-2022'.
 *
 * There is no votes-by-SA1 mark-off file for VEC elections, so geo.sa1_booth_vote stays
 * empty and geo:sa1-election-metrics takes its IDW k-NN fallback path (sed-restricted).
 *
 * Licence: © State of Victoria (Victorian Electoral Commission).
 */
const ROOT = resolve(__dirname, "../../../../..");
const BATCH = 1000;
const log = (m: string) => console.log(m); // eslint-disable-line no-console
const warn = (m: string) => console.warn(m); // eslint-disable-line no-console

const USAGE = `geo:load-vec – load VEC 2022 booth results (fp/tcp/informal) for vic-2022

Usage: npm --prefix apps/api run geo:load-vec -- [--dir <path>] [--help]
  --dir  directory for the staged VEC files, relative to the repo root
         (default ${VEC_2022.defaultDir}; missing files are downloaded into it)

Run geo:load-polling-places (Tally Room vic booth master) and geo:load-boundaries (geo.sed)
first – centres are matched to existing 'vic:*' booths by district + name.`;

type District = { name: string; sedCode: string; slug: string };

function parseArgs(argv: string[]): { dir: string | null; help: boolean } {
  const out = { dir: null as string | null, help: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline: string | null = null;
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--dir") {
      const v = inline ?? argv[++i];
      if (v === undefined) throw new Error("--dir requires a value");
      out.dir = v;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

/** Download to path unless already staged. Returns false (and warns) on failure. */
async function stage(url: string, path: string, label: string): Promise<boolean> {
  if (existsSync(path)) return true;
  try {
    const res = await fetch(url);
    if (!res.ok) { warn(`  ⚠ ${label}: HTTP ${res.status} for ${url}`); return false; }
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch (e) {
    warn(`  ⚠ ${label}: download failed (${(e as Error).message})`);
    return false;
  }
}

function readXlsRows(path: string): Cell[][] {
  // Lazy-load SheetJS as load-polling-places.ts does; it reads BIFF .xls natively.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: "" });
}

/** Resolve every distinct (district, centre) to a geo.polling_place id: exact
 *  (division, name) match first, then a statewide-unique name, else a new geometry-less
 *  row (id 'vic:<district>--<centre>', sed-tagged so electorate joins still work). */
async function resolveCentres(
  prisma: PrismaService,
  rows: VecVoteRow[],
  districts: Map<string, District>,
): Promise<{ ids: Map<string, string>; created: string[]; nameMatched: string[] }> {
  const existing = (await prisma.$queryRawUnsafe(
    `SELECT id, lower(division_name) AS division, lower(name) AS name
       FROM geo.polling_place WHERE jurisdiction = $1 AND name IS NOT NULL`,
    VEC_2022.jurisdiction,
  )) as Array<{ id: string; division: string | null; name: string }>;
  const byDivisionName = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const p of existing) {
    if (p.division) byDivisionName.set(`${p.division}|${p.name}`, p.id);
    byName.set(p.name, [...(byName.get(p.name) ?? []), p.id]);
  }

  const ids = new Map<string, string>();
  const created: string[] = [];
  const nameMatched: string[] = [];
  const newRows: Array<{ id: string; district: District; centre: string }> = [];
  for (const r of rows) {
    const key = `${r.district}|${r.centre}`;
    if (ids.has(key)) continue;
    const exact = byDivisionName.get(key.toLowerCase());
    if (exact) { ids.set(key, exact); continue; }
    const sameName = byName.get(r.centre.toLowerCase());
    if (sameName && sameName.length === 1) {
      ids.set(key, sameName[0]);
      nameMatched.push(key);
      continue;
    }
    const district = districts.get(r.district);
    if (!district) continue; // parse guarantees district ∈ catalogue; defensive only
    const id = `${VEC_2022.jurisdiction}:${district.slug}--${slugify(r.centre)}`;
    ids.set(key, id);
    created.push(key);
    newRows.push({ id, district, centre: r.centre });
  }

  for (let i = 0; i < newRows.length; i += BATCH) {
    const slice = newRows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = slice.map((r) => {
      params.push(r.id, VEC_2022.jurisdiction, r.centre, "VIC", r.district.name, r.district.sedCode);
      const b = params.length;
      return `($${b - 5},$${b - 4},$${b - 3},$${b - 2},$${b - 1},$${b})`;
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.polling_place (id, jurisdiction, name, state, division_name, sed_code)
       VALUES ${tuples.join(",")}
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, division_name=EXCLUDED.division_name, sed_code=EXCLUDED.sed_code`,
      ...params,
    );
  }
  return { ids, created, nameMatched };
}

/** Replace one kind's rows in one transaction (mirrors load-election-results.ts), so a
 *  re-run against corrected VEC files can't leave stale candidates behind. */
async function replaceBoothResults(
  prisma: PrismaService,
  kind: string,
  rows: VecVoteRow[],
  ids: Map<string, string>,
): Promise<number> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const pp = ids.get(`${r.district}|${r.centre}`);
    if (!pp) continue;
    const id = `${VEC_2022.id}:${pp}:${r.kind}:${r.partyCode}${r.candidate ? `:${slugify(r.candidate)}` : ""}`;
    const cur = byId.get(id);
    // Two same-party candidate columns can only collide on 'fp' (already aggregated) or a
    // duplicate parse – sum defensively rather than silently keeping the last.
    if (cur) cur.votes = (cur.votes as number) + r.votes;
    else byId.set(id, {
      id, election_id: VEC_2022.id, polling_place_id: pp, kind: r.kind,
      party_code: r.partyCode, candidate: r.candidate, votes: r.votes,
    });
  }
  const dbRows = [...byId.values()];
  const COLS = ["id", "election_id", "polling_place_id", "kind", "party_code", "candidate", "votes"];
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM geo.booth_result WHERE election_id = $1 AND kind = $2`, VEC_2022.id, kind);
      for (let i = 0; i < dbRows.length; i += BATCH) {
        const slice = dbRows.slice(i, i + BATCH);
        const params: unknown[] = [];
        const tuples = slice.map((r) => {
          const ph = COLS.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; });
          return `(${ph.join(",")})`;
        });
        await tx.$executeRawUnsafe(
          `INSERT INTO geo.booth_result (${COLS.join(",")}) VALUES ${tuples.join(",")}
           ON CONFLICT (id) DO UPDATE SET
             election_id=EXCLUDED.election_id, polling_place_id=EXCLUDED.polling_place_id,
             kind=EXCLUDED.kind, party_code=EXCLUDED.party_code, candidate=EXCLUDED.candidate,
             votes=EXCLUDED.votes, updated_at=now()`,
          ...params,
        );
      }
    },
    { timeout: 10 * 60 * 1000, maxWait: 10_000 },
  );
  return dbRows.length;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { log(USAGE); return; }
  const dir = resolve(ROOT, args.dir ?? VEC_2022.defaultDir);
  mkdirSync(dir, { recursive: true });

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    // The 88 Victorian lower-house districts (ASGS state prefix 2 = Vic).
    const sed = (await prisma.$queryRawUnsafe(
      `SELECT code, name FROM geo.sed WHERE code LIKE '2%' ORDER BY name`,
    )) as Array<{ code: string; name: string }>;
    if (sed.length === 0) throw new Error("geo.sed has no Victorian districts – run geo:load-boundaries first");
    const districts = new Map<string, District>();
    for (const s of sed) {
      const name = districtFromSedName(s.name);
      districts.set(name, { name, sedCode: s.code, slug: slugify(name) });
    }
    log(`${districts.size} Victorian districts from geo.sed`);

    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.election (id, jurisdiction, name, held_on, source, updated_at)
       VALUES ($1,$2,$3,$4::date,$5,now())
       ON CONFLICT (id) DO UPDATE SET
         jurisdiction=EXCLUDED.jurisdiction, name=EXCLUDED.name, held_on=EXCLUDED.held_on,
         source=EXCLUDED.source, updated_at=now()`,
      VEC_2022.id, VEC_2022.jurisdiction, VEC_2022.name, VEC_2022.heldOn, VEC_2022.source,
    );
    log(`  ✓ geo.election upserted (${VEC_2022.id} – ${VEC_2022.name})`);

    // ── Stage + parse per district ──
    const fp: VecVoteRow[] = [];
    const informal: VecVoteRow[] = [];
    const tcp: VecVoteRow[] = [];
    const missing: string[] = [];
    let bannerInformal = 0;
    for (const d of districts.values()) {
      const xlsPath = resolve(dir, `${d.slug}.xls`);
      const htmlPath = resolve(dir, `${d.slug}-2cp.html`);
      const haveXls = await stage(primaryXlsUrl(d.name), xlsPath, `${d.name} primary`);
      const haveHtml = await stage(tcpHtmlUrl(d.name), htmlPath, `${d.name} 2CP`);
      if (!haveXls && !haveHtml) { missing.push(d.name); continue; }
      if (haveXls) {
        const parsed = parsePrimarySheet(readXlsRows(xlsPath));
        if (parsed.district.toLowerCase() !== d.name.toLowerCase()) {
          warn(`  ⚠ ${d.slug}.xls says '${parsed.district}', expected '${d.name}' – keeping the catalogue name`);
        }
        for (const r of parsed.fp) fp.push({ ...r, district: d.name });
        for (const r of parsed.informal) informal.push({ ...r, district: d.name });
        bannerInformal += parsed.banner.informal ?? 0;
      } else missing.push(`${d.name} (primary)`);
      if (haveHtml) {
        for (const r of parseTcpHtml(readFileSync(htmlPath, "utf8"), d.name)) tcp.push(r);
      } else missing.push(`${d.name} (2CP)`);
    }
    log(`  · parsed fp=${fp.length} informal=${informal.length} tcp=${tcp.length} rows across ${districts.size} districts${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);

    // ── Resolve voting centres to geo.polling_place ──
    const all = [...fp, ...informal, ...tcp];
    const { ids, created, nameMatched } = await resolveCentres(prisma, all, districts);
    const distinct = new Set(all.map((r) => `${r.district}|${r.centre}`)).size;
    log(`  ✓ ${distinct} voting centres resolved – ${distinct - created.length} matched existing vic booths (${nameMatched.length} by unique name), ${created.length} created without geometry`);
    if (created.length) warn(`  ⚠ un-geocodable (excluded from IDW metrics): ${created.join(", ")}`);

    // ── booth_result rows ──
    for (const [kind, rows] of [["fp", fp], ["informal", informal], ["tcp", tcp]] as const) {
      const n = await replaceBoothResults(prisma, kind, rows, ids);
      log(`  ✓ ${n} ${kind} rows → geo.booth_result`);
    }

    // ── Sanity: statewide TCP ≈ statewide FP (both election-day ordinary votes); the
    // ordinary informal total vs the district banners (banners include declaration
    // informals, so parsed ≤ banner). Logged, never fatal. ──
    const [{ fp_total, tcp_total, inf_total }] = (await prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(votes) FILTER (WHERE kind='fp'), 0)::bigint       AS fp_total,
              COALESCE(SUM(votes) FILTER (WHERE kind='tcp'), 0)::bigint      AS tcp_total,
              COALESCE(SUM(votes) FILTER (WHERE kind='informal'), 0)::bigint AS inf_total
         FROM geo.booth_result WHERE election_id = $1`, VEC_2022.id,
    )) as Array<{ fp_total: bigint; tcp_total: bigint; inf_total: bigint }>;
    const fpN = Number(fp_total), tcpN = Number(tcp_total);
    if (fpN > 0 && tcpN > 0) {
      const gap = Math.abs(tcpN - fpN) / fpN;
      const line = `  · sanity: fp=${fpN.toLocaleString()} tcp=${tcpN.toLocaleString()} (gap ${(gap * 100).toFixed(2)}%) informal=${Number(inf_total).toLocaleString()} (banner ≥ ${bannerInformal.toLocaleString()} incl. declaration)`;
      if (gap > 0.015) warn(`${line} – exceeds 1.5%; check the staged files`);
      else log(line);
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
       VALUES ($1,$2,$3,$4,$5,(SELECT count(*) FROM geo.booth_result WHERE election_id = '${VEC_2022.id}'),'loaded',now())
       ON CONFLICT (key) DO UPDATE SET
         label=EXCLUDED.label, source_url=EXCLUDED.source_url, release_date=EXCLUDED.release_date,
         licence=EXCLUDED.licence, row_count=EXCLUDED.row_count, status='loaded',
         last_ingested=now(), updated_at=now()`,
      "vec_2022_results", "VEC 2022 state-election results (booth level)", VEC_2022.source,
      VEC_2022.name, "© State of Victoria (Victorian Electoral Commission)",
    );
    log("  ✓ geo.dataset_meta updated (vec_2022_results)");
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("geo:load-vec failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
