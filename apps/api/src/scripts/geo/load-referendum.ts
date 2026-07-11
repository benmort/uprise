import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { AppModule } from "../../app.module";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * AEC 2023 Voice-to-Parliament referendum loader (event 29581) → geo.referendum_result.
 * Loads three levels into one table:
 *   • turnout / votes-counted by division (151) + state (8), from the two AEC "VotesCounted" CSVs
 *     (dropped into data/geo/referendum/, gitignored);
 *   • the official Yes/No outcome — national + per-state from the national results HTML page, and
 *     per-division from the 151 per-division results pages (there is NO Yes/No-by-division CSV;
 *     the AEC PollingPlaceResults CSVs are ordinary-votes-only, so they'd give a wrong headline).
 * Each fetched HTML page is cached under data/geo/referendum/ so re-runs — and the prod run —
 * don't re-hit the AEC and produce identical rows. Divisions are matched to geo.ced by name
 * (149/151; Higgins + North Sydney were abolished post-2023 and stay ced_code = NULL).
 *   npm --prefix apps/api run geo:load-referendum
 *
 * Licence: AEC © Commonwealth of Australia (CC BY 4.0).
 */
const ROOT = resolve(__dirname, "../../../../..");
const DATA_DIR = resolve(ROOT, "data/geo/referendum");
const DIV_CSV = resolve(DATA_DIR, "votes-counted-by-division.csv");
const STATE_CSV = resolve(DATA_DIR, "votes-counted-by-state.csv");

const EVENT = "29581";
const TITLE = "2023 Voice to Parliament referendum";
const BASE = "https://results.aec.gov.au/29581/Website";
const NATIONAL_URL = `${BASE}/ReferendumNationalResults-29581.htm`;
const divUrl = (id: string) => `${BASE}/ReferendumDivisionResults-29581-${id}.htm`;
const UA = "uprise-civic/1.0 (https://uprise.org.au; referendum reference data; contact@upriselabs.org)";

// ── helpers ───────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toInt = (s: string | null): number | null =>
  s == null || s.trim() === "" ? null : Number.parseInt(s.replace(/[,\s]/g, ""), 10);
const toFloat = (s: string | null): number | null =>
  s == null || s.trim() === "" ? null : Number.parseFloat(s.replace(/[,%\s]/g, ""));

/** RFC4180-ish CSV (mirrors load-polling-places.ts). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* ignore */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** CSV → records keyed by header. The AEC prepends a single-cell banner line; the header is the
 *  first row with more than one field. */
function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => r.some((f) => f.trim() !== ""));
  const hIdx = rows.findIndex((r) => r.length > 1);
  const start = hIdx >= 0 ? hIdx : 0;
  const header = rows[start].map((h) => h.trim());
  return rows.slice(start + 1)
    .filter((r) => r.some((f) => f.trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      return o;
    });
}

/** Value of the `<td headers="<id>" …>value</td>` cell. AEC pages tag every result cell with a
 *  stable `headers` id, so this is robust to layout/whitespace changes. The closing quote in the
 *  pattern keeps `resYes` from matching `resYes0`. */
function cell(html: string, headerId: string): string | null {
  const m = new RegExp(`headers="${headerId}"[^>]*>\\s*([^<]*?)\\s*<`).exec(html);
  return m ? m[1].replace(/&nbsp;/g, " ").trim() : null;
}

async function fetchText(url: string, tries = 3): Promise<string> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(600 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

/** Fetch a page once, cache it to disk, and reuse the cache on later runs (incl. the prod run). */
async function fetchCached(url: string, cachePath: string): Promise<string> {
  if (existsSync(cachePath)) return readFileSync(cachePath, "utf8");
  const text = await fetchText(url);
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, text, "utf8");
  await sleep(150); // polite between live fetches
  return text;
}

type YesNo = { yes: number | null; no: number | null; yesP: number | null; noP: number | null };

/** National results page → per-state Yes/No (keyed by AEC abbrev) + the national total. */
function parseNational(html: string): { states: Record<string, YesNo>; national: YesNo } {
  const states: Record<string, YesNo> = {};
  for (let n = 0; n < 8; n++) {
    const ab = new RegExp(`headers="resStt${n}"[^>]*>[\\s\\S]*?ReferendumStateResults-29581-([A-Za-z]+)`).exec(html);
    if (!ab) continue;
    states[ab[1].trim().toUpperCase()] = {
      yes: toInt(cell(html, `resYes${n}`)),
      no: toInt(cell(html, `resNo${n}`)),
      yesP: toFloat(cell(html, `resYesP${n}`)),
      noP: toFloat(cell(html, `resNoP${n}`)),
    };
  }
  const national: YesNo = {
    yes: toInt(cell(html, "resYes")),
    no: toInt(cell(html, "resNo")),
    yesP: toFloat(cell(html, "resYesP")),
    noP: toFloat(cell(html, "resNoP")),
  };
  return { states, national };
}

/** Division results page → the division's official totals row. */
function parseDivision(html: string): YesNo & { informal: number | null; total: number | null } {
  return {
    yes: toInt(cell(html, "rdYes")),
    no: toInt(cell(html, "rdNo")),
    yesP: toFloat(cell(html, "rdYesP")),
    noP: toFloat(cell(html, "rdNoP")),
    informal: toInt(cell(html, "rdInf")),
    total: toInt(cell(html, "rdTot")),
  };
}

const COLS = [
  "id", "event_id", "title", "level", "division_id", "state_ab", "name", "ced_code", "state_code",
  "enrolment", "ordinary_votes", "absent_votes", "provisional_votes", "prepoll_votes", "postal_votes",
  "total_votes", "turnout_pct", "yes_votes", "no_votes", "informal_votes", "formal_votes", "yes_pct", "no_pct",
];

async function upsertRows(prisma: PrismaService, rows: Record<string, unknown>[]): Promise<void> {
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = slice.map((r) => {
      const ph = COLS.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; });
      return `(${ph.join(",")})`;
    });
    const updates = COLS.filter((c) => c !== "id").map((c) => `${c}=EXCLUDED.${c}`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT INTO geo.referendum_result (${COLS.join(",")}) VALUES ${tuples.join(",")}
       ON CONFLICT (id) DO UPDATE SET ${updates}, updated_at=now()`,
      ...params,
    );
  }
}

async function upsertMeta(prisma: PrismaService): Promise<void> {
  const total = (await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM geo.referendum_result WHERE event_id = $1`, EVENT,
  )) as Array<{ n: number }>;
  await prisma.$executeRawUnsafe(
    `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
     VALUES ('referendum_2023','2023 Voice referendum',$1,$2,$3,$4,'loaded',now())
     ON CONFLICT (key) DO UPDATE SET
       label=EXCLUDED.label, source_url=EXCLUDED.source_url, release_date=EXCLUDED.release_date,
       licence=EXCLUDED.licence, row_count=EXCLUDED.row_count, status='loaded',
       last_ingested=now(), updated_at=now()`,
    NATIONAL_URL,
    "2023 — Voice to Parliament referendum (final results)",
    "AEC © Commonwealth of Australia (CC BY 4.0)",
    total[0]?.n ?? 0,
  );
}

async function main(): Promise<void> {
  if (!existsSync(DIV_CSV) || !existsSync(STATE_CSV)) {
    throw new Error(`Missing turnout CSVs in ${DATA_DIR} (votes-counted-by-division.csv / …by-state.csv)`);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const prisma = app.get(PrismaService);
  try {
    const divRecs = csvRecords(readFileSync(DIV_CSV, "utf8"));
    const stateRecs = csvRecords(readFileSync(STATE_CSV, "utf8"));
    console.log(`Loaded turnout CSVs: ${divRecs.length} divisions, ${stateRecs.length} states`); // eslint-disable-line no-console

    const national = parseNational(await fetchCached(NATIONAL_URL, resolve(DATA_DIR, "national.htm")));

    const rows: Record<string, unknown>[] = [];

    // ── Division rows (turnout CSV + per-division Yes/No page) ──
    console.log(`Fetching ${divRecs.length} division result pages (cached)…`); // eslint-disable-line no-console
    for (const r of divRecs) {
      const id = r.DivisionID;
      const res = parseDivision(await fetchCached(divUrl(id), resolve(DATA_DIR, "divisions", `${id}.htm`)));
      const yes = res.yes, no = res.no;
      rows.push({
        id: `${EVENT}:division:${id}`, event_id: EVENT, title: TITLE, level: "division",
        division_id: Number.parseInt(id, 10), state_ab: r.StateAb, name: r.DivisionNm, ced_code: null, state_code: null,
        enrolment: toInt(r.Enrolment), ordinary_votes: toInt(r.OrdinaryVotes), absent_votes: toInt(r.AbsentVotes),
        provisional_votes: toInt(r.ProvisionalVotes), prepoll_votes: toInt(r.PrePollVotes), postal_votes: toInt(r.PostalVotes),
        total_votes: toInt(r.TotalVotes), turnout_pct: toFloat(r.TotalPercentage),
        yes_votes: yes, no_votes: no, informal_votes: res.informal,
        formal_votes: yes != null && no != null ? yes + no : null, yes_pct: res.yesP, no_pct: res.noP,
      });
    }

    // ── State rows (turnout CSV + national page Yes/No, matched by abbrev) ──
    const sum = (field: string) => stateRecs.reduce((a, r) => a + (toInt(r[field]) ?? 0), 0);
    for (const r of stateRecs) {
      const ab = r.StateAb;
      const yn = national.states[ab];
      const total = toInt(r.TotalVotes);
      const yes = yn?.yes ?? null, no = yn?.no ?? null;
      rows.push({
        id: `${EVENT}:state:${ab}`, event_id: EVENT, title: TITLE, level: "state",
        division_id: null, state_ab: ab, name: r.StateNm, ced_code: null, state_code: null,
        enrolment: toInt(r.Enrolment), ordinary_votes: toInt(r.OrdinaryVotes), absent_votes: toInt(r.AbsentVotes),
        provisional_votes: toInt(r.ProvisionalVotes), prepoll_votes: toInt(r.PrePollVotes), postal_votes: toInt(r.PostalVotes),
        total_votes: total, turnout_pct: toFloat(r.TotalPercentage),
        yes_votes: yes, no_votes: no,
        informal_votes: total != null && yes != null && no != null ? total - yes - no : null,
        formal_votes: yes != null && no != null ? yes + no : null,
        yes_pct: yn?.yesP ?? null, no_pct: yn?.noP ?? null,
      });
    }

    // ── National row (turnout = Σ states; Yes/No from national page) ──
    const natEnrol = sum("Enrolment");
    const natTotal = sum("TotalVotes");
    const nYes = national.national.yes, nNo = national.national.no;
    rows.push({
      id: `${EVENT}:national`, event_id: EVENT, title: TITLE, level: "national",
      division_id: null, state_ab: null, name: "National", ced_code: null, state_code: null,
      enrolment: natEnrol, ordinary_votes: sum("OrdinaryVotes"), absent_votes: sum("AbsentVotes"),
      provisional_votes: sum("ProvisionalVotes"), prepoll_votes: sum("PrePollVotes"), postal_votes: sum("PostalVotes"),
      total_votes: natTotal, turnout_pct: natEnrol ? Math.round((natTotal / natEnrol) * 10000) / 100 : null,
      yes_votes: nYes, no_votes: nNo,
      informal_votes: nYes != null && nNo != null ? natTotal - nYes - nNo : null,
      formal_votes: nYes != null && nNo != null ? nYes + nNo : null,
      yes_pct: national.national.yesP, no_pct: national.national.noP,
    });

    await upsertRows(prisma, rows);
    console.log(`  ✓ upserted ${rows.length} rows → geo.referendum_result`); // eslint-disable-line no-console

    await prisma.$executeRawUnsafe(
      `UPDATE geo.referendum_result t SET ced_code = c.code
         FROM geo.ced c WHERE t.event_id = $1 AND t.level='division' AND lower(t.name)=lower(c.name)`, EVENT,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE geo.referendum_result t SET state_code = s.code
         FROM geo.state s WHERE t.event_id = $1 AND t.level='state' AND lower(t.name)=lower(s.name)`, EVENT,
    );
    const unmatched = (await prisma.$queryRawUnsafe(
      `SELECT name FROM geo.referendum_result WHERE event_id = $1 AND level='division' AND ced_code IS NULL ORDER BY name`, EVENT,
    )) as Array<{ name: string }>;
    console.log(`  ✓ boundary tags resolved; ${unmatched.length} division(s) unmatched to geo.ced${unmatched.length ? `: ${unmatched.map((u) => u.name).join(", ")}` : ""}`); // eslint-disable-line no-console

    await upsertMeta(prisma);
    console.log("  ✓ geo.dataset_meta updated (referendum_2023)"); // eslint-disable-line no-console
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("geo:load-referendum failed:", e); // eslint-disable-line no-console
    process.exit(1);
  });
