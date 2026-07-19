import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ELECTIONS,
  BOOTH_HEADER_RE,
  SA1_HEADER_RE,
  SA1_FILE_RE,
  fpFileName,
  tcpFileName,
  tppFileName,
  csvRecords,
  fpRows,
  informalRows,
  tcpRows,
  tppRows,
  sa1Rows,
  parseArgs,
  type BoothVoteRow,
  type ElectionDef,
  type Sa1VoteRow,
} from "./election-parse";

/**
 * AEC election-results loader → geo.election + geo.booth_result + geo.sa1_booth_vote.
 * Reads operator-staged AEC Tally Room CSVs (gitignored; default data/geo/aec/2025) and
 * loads booth-level first preferences ('fp'), two-candidate-preferred ('tcp'),
 * two-party-preferred ('tpp') and the votes-by-SA1 attendance crosswalk. Mirrors the other
 * geo loaders (load-referendum.ts, demographics/load-abs.ts): skip-if-missing per file,
 * idempotent per (election, kind), stamps geo.dataset_meta. Parsing + the election catalogue
 * live in ./election-parse.ts (unit-tested); this file is I/O only.
 *
 *   DATABASE_URL=… npm --prefix apps/api run geo:load-election -- --election federal-2025 --dir data/geo/aec/2025
 *
 * Booth ids are namespaced 'federal:<PollingPlaceID>' to match geo.polling_place.id, so run
 * geo:load-polling-places first – unmatched booth ids are counted and warned, not fatal.
 *
 * Licence: AEC © Commonwealth of Australia (CC BY 4.0).
 */
const ROOT = resolve(__dirname, "../../../../..");
const BATCH = 1000;
const log = (m: string) => console.log(m); // eslint-disable-line no-console

const USAGE = `geo:load-election – load AEC booth results + votes-by-SA1 for one election

Usage: npm --prefix apps/api run geo:load-election -- [--election <id>] [--dir <path>] [--help]
  --election  election id (default federal-2025; known: ${Object.keys(ELECTIONS).join(", ")})
  --dir       directory of staged AEC CSVs, relative to the repo root (default per election)

Expected files (any that are missing are skipped with a warning):
  HouseStateFirstPrefsByPollingPlaceDownload-<event>-<STATE>.csv  (one per state)
  HouseTcpByCandidateByPollingPlaceDownload-<event>.csv
  HouseTppByPollingPlaceDownload-<event>.csv
  *sa1*.csv                                                       (the AEC votes-by-SA1 file)`;

/** Namespaced ids: booth 'federal:<pp>', row '<election>:<booth>:<kind>:<party>[:<candidate>]'. */
function toDbRows(def: ElectionDef, rows: BoothVoteRow[]): Array<Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const pp = `${def.jurisdiction}:${r.pollingPlaceId}`;
    const id = `${def.id}:${pp}:${r.kind}:${r.partyCode}${r.candidateId ? `:${r.candidateId}` : ""}`;
    byId.set(id, {
      id, election_id: def.id, polling_place_id: pp, kind: r.kind,
      party_code: r.partyCode, candidate: r.candidate, votes: r.votes,
    });
  }
  return [...byId.values()];
}

/** Replace one kind's rows for the election: delete + batch insert in one transaction, so a
 *  re-run against a corrected AEC download can't leave stale candidates behind. */
async function replaceBoothResults(prisma: PrismaService, def: ElectionDef, kind: string, rows: BoothVoteRow[]): Promise<number> {
  const dbRows = toDbRows(def, rows);
  const COLS = ["id", "election_id", "polling_place_id", "kind", "party_code", "candidate", "votes"];
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM geo.booth_result WHERE election_id = $1 AND kind = $2`, def.id, kind);
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

async function replaceSa1Votes(prisma: PrismaService, def: ElectionDef, rows: Sa1VoteRow[]): Promise<number> {
  let untranslated = 0;
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM geo.sa1_booth_vote WHERE election_id = $1`, def.id);
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        const params: unknown[] = [];
        const tuples = slice.map((r) => {
          params.push(def.id, r.sa1Code, `${def.jurisdiction}:${r.pollingPlaceId}`, r.votes);
          const b = params.length;
          return `($${b - 3},$${b - 2},$${b - 1},$${b})`;
        });
        await tx.$executeRawUnsafe(
          `INSERT INTO geo.sa1_booth_vote (election_id, sa1_code, polling_place_id, votes) VALUES ${tuples.join(",")}
           ON CONFLICT (election_id, sa1_code, polling_place_id) DO UPDATE SET votes = EXCLUDED.votes`,
          ...params,
        );
      }
      // AEC SA1 ids are the ABS 7-digit short code (STE digit + last six of the 11-digit
      // SA1_CODE_2021, a bijection — verified 61,815↔61,815); every geo.* consumer keys on
      // the 11-digit code, so translate in place. Rows that don't map (retired/changed
      // SA1s) are dropped, counted, and reported rather than silently kept unjoinable.
      await tx.$executeRawUnsafe(
        `UPDATE geo.sa1_booth_vote v
         SET sa1_code = s.code
         FROM geo.sa1 s
         WHERE v.election_id = $1 AND length(v.sa1_code) = 7
           AND left(s.code, 1) || right(s.code, 6) = v.sa1_code`,
        def.id,
      );
      const dropped = (await tx.$queryRawUnsafe(
        `DELETE FROM geo.sa1_booth_vote WHERE election_id = $1 AND length(sa1_code) = 7 RETURNING 1`,
        def.id,
      )) as unknown[];
      untranslated = dropped.length;
    },
    { timeout: 10 * 60 * 1000, maxWait: 10_000 },
  );
  if (untranslated > 0) {
    log(`  ⚠ ${untranslated} votes-by-SA1 row(s) dropped — 7-digit id matched no 2021 SA1`);
  }
  return rows.length;
}

async function upsertMeta(prisma: PrismaService, def: ElectionDef, key: string, label: string, table: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
     VALUES ($1,$2,$3,$4,$5,(SELECT count(*) FROM ${table}),'loaded',now())
     ON CONFLICT (key) DO UPDATE SET
       label=EXCLUDED.label, source_url=EXCLUDED.source_url, release_date=EXCLUDED.release_date,
       licence=EXCLUDED.licence, row_count=EXCLUDED.row_count, status='loaded',
       last_ingested=now(), updated_at=now()`,
    key, label, def.source, def.name, "AEC © Commonwealth of Australia (CC BY 4.0)",
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { log(USAGE); return; }
  const def = ELECTIONS[args.election];
  if (!def) throw new Error(`Unknown election '${args.election}' (known: ${Object.keys(ELECTIONS).join(", ")})`);
  const dir = resolve(ROOT, args.dir ?? def.defaultDir);
  if (!existsSync(dir)) throw new Error(`Data directory not found: ${dir} – stage the AEC downloads first (see --help)`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.election (id, jurisdiction, name, held_on, source, updated_at)
       VALUES ($1,$2,$3,$4::date,$5,now())
       ON CONFLICT (id) DO UPDATE SET
         jurisdiction=EXCLUDED.jurisdiction, name=EXCLUDED.name, held_on=EXCLUDED.held_on,
         source=EXCLUDED.source, updated_at=now()`,
      def.id, def.jurisdiction, def.name, def.heldOn, def.source,
    );
    log(`  ✓ geo.election upserted (${def.id} – ${def.name})`);

    let loadedBooths = false;

    // ── First preferences: one file per state, aggregated per (booth, party) ──
    const fp: BoothVoteRow[] = [];
    const informal: BoothVoteRow[] = [];
    for (const state of def.states) {
      const file = fpFileName(def.eventId, state);
      const path = resolve(dir, file);
      if (!existsSync(path)) { log(`  – ${file} not staged; skipping ${state} first preferences`); continue; }
      const recs = csvRecords(readFileSync(path, "utf8"), BOOTH_HEADER_RE);
      const rows = fpRows(recs);
      for (const r of rows) fp.push(r); // not push(...rows): a state can be tens of thousands of rows
      for (const r of informalRows(recs)) informal.push(r);
      log(`  · ${state} fp: ${rows.length} booth×party rows`);
    }
    if (fp.length) {
      const n = await replaceBoothResults(prisma, def, "fp", fp);
      loadedBooths = true;
      log(`  ✓ ${n} fp rows → geo.booth_result`);
    }
    if (informal.length) {
      const n = await replaceBoothResults(prisma, def, "informal", informal);
      log(`  ✓ ${n} informal rows → geo.booth_result (informality-risk numerator)`);
    }

    // ── Two-candidate-preferred: one national file, two candidate rows per booth ──
    const tcpPath = resolve(dir, tcpFileName(def.eventId));
    if (!existsSync(tcpPath)) log(`  – ${tcpFileName(def.eventId)} not staged; skipping TCP`);
    else {
      const rows = tcpRows(csvRecords(readFileSync(tcpPath, "utf8"), BOOTH_HEADER_RE));
      const n = await replaceBoothResults(prisma, def, "tcp", rows);
      loadedBooths = true;
      log(`  ✓ ${n} tcp rows → geo.booth_result`);
    }

    // ── Two-party-preferred: one national file, split into COAL + ALP rows ──
    const tppPath = resolve(dir, tppFileName(def.eventId));
    if (!existsSync(tppPath)) log(`  – ${tppFileName(def.eventId)} not staged; skipping TPP`);
    else {
      const rows = tppRows(csvRecords(readFileSync(tppPath, "utf8"), BOOTH_HEADER_RE));
      const n = await replaceBoothResults(prisma, def, "tpp", rows);
      loadedBooths = true;
      log(`  ✓ ${n} tpp rows → geo.booth_result`);
    }

    // ── Votes by SA1: the attendance crosswalk (any staged CSV mentioning SA1) ──
    const sa1File = readdirSync(dir).find((f) => SA1_FILE_RE.test(f));
    let loadedSa1 = false;
    if (!sa1File) log("  – no votes-by-SA1 CSV staged (no *sa1*.csv in the data dir); skipping SA1 crosswalk");
    else {
      const rows = sa1Rows(csvRecords(readFileSync(resolve(dir, sa1File), "utf8"), SA1_HEADER_RE));
      const n = await replaceSa1Votes(prisma, def, rows);
      loadedSa1 = true;
      log(`  ✓ ${n} rows (${sa1File}) → geo.sa1_booth_vote`);
    }

    // ── Referential sanity: booth ids that don't resolve to geo.polling_place ──
    // Warn-only – dark/hospital teams and abolished booths legitimately miss the booth
    // master, and the SA1 smear only loses those booths' weights, not the whole run.
    for (const [label, sql] of [
      ["booth_result", `SELECT count(DISTINCT br.polling_place_id)::int AS n
                          FROM geo.booth_result br LEFT JOIN geo.polling_place p ON p.id = br.polling_place_id
                         WHERE br.election_id = $1 AND p.id IS NULL`],
      ["sa1_booth_vote", `SELECT count(DISTINCT v.polling_place_id)::int AS n
                            FROM geo.sa1_booth_vote v LEFT JOIN geo.polling_place p ON p.id = v.polling_place_id
                           WHERE v.election_id = $1 AND p.id IS NULL`],
    ] as const) {
      const [{ n }] = (await prisma.$queryRawUnsafe(sql, def.id)) as Array<{ n: number }>;
      if (n > 0) console.warn(`  ⚠ ${n} ${label} booth id(s) not in geo.polling_place (run geo:load-polling-places?)`); // eslint-disable-line no-console
    }

    // ── Sanity: national TCP ≈ national FP (both formal ordinary votes). Logged, never
    // fatal – declaration votes and maverick booths explain small gaps. ──
    const [{ fp_total, tcp_total }] = (await prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(votes) FILTER (WHERE kind='fp'), 0)::bigint  AS fp_total,
              COALESCE(SUM(votes) FILTER (WHERE kind='tcp'), 0)::bigint AS tcp_total
         FROM geo.booth_result WHERE election_id = $1`, def.id,
    )) as Array<{ fp_total: bigint; tcp_total: bigint }>;
    const fpN = Number(fp_total), tcpN = Number(tcp_total);
    if (fpN > 0 && tcpN > 0) {
      const gap = Math.abs(tcpN - fpN) / fpN;
      const line = `  · sanity: fp=${fpN.toLocaleString()} tcp=${tcpN.toLocaleString()} (gap ${(gap * 100).toFixed(2)}%)`;
      if (gap > 0.015) console.warn(`${line} – exceeds 1.5%; check the staged files`); // eslint-disable-line no-console
      else log(line);
    }

    if (loadedBooths) await upsertMeta(prisma, def, "election_results", "Election results (booth level)", "geo.booth_result");
    if (loadedSa1) await upsertMeta(prisma, def, "sa1_booth_votes", "Votes by SA1 (booth attendance)", "geo.sa1_booth_vote");
    if (loadedBooths || loadedSa1) log("  ✓ geo.dataset_meta updated (election_results / sa1_booth_votes)");
    else log("Nothing loaded – no staged files found. See --help for the expected filenames.");
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("geo:load-election failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
