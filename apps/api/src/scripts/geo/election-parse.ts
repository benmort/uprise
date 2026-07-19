// Pure parsing + catalogue for the AEC election-results loader (load-election-results.ts).
// Kept side-effect-free (no Nest, no I/O, no process.exit) so it's unit-testable – the loader
// imports it for the run, and election-parse.spec.ts pins the parse contract against
// representative AEC Tally Room fixtures (mirrors demographics/abs-parse.ts). Excluded from
// the coverage gate (src/scripts), but tested for correctness: a wrong column name or a
// missed title row silently loads zeros.

export type BoothKind = "fp" | "tcp" | "tpp" | "informal";

/** One geo.booth_result row in source terms (pollingPlaceId is the raw AEC id, unprefixed). */
export type BoothVoteRow = {
  pollingPlaceId: string;
  kind: BoothKind;
  partyCode: string;
  candidateId: string | null;
  candidate: string | null;
  votes: number;
};

/** One geo.sa1_booth_vote row in source terms (pollingPlaceId unprefixed). */
export type Sa1VoteRow = { sa1Code: string; pollingPlaceId: string; votes: number };

export type ElectionDef = {
  id: string; // geo.election.id, e.g. 'federal-2025'
  jurisdiction: string; // booth id namespace: geo.polling_place.id = '<jurisdiction>:<sourceId>'
  name: string;
  heldOn: string; // ISO date
  eventId: string; // AEC Tally Room event id (in every download filename)
  source: string;
  defaultDir: string; // relative to the repo root
  states: string[]; // per-state first-preference file suffixes
};

// The elections this loader knows how to ingest. Adding a state election later means a new
// entry (jurisdiction 'vic'/'nsw'/…) plus whatever file shapes that commission publishes.
export const ELECTIONS: Record<string, ElectionDef> = {
  "federal-2025": {
    id: "federal-2025",
    jurisdiction: "federal",
    name: "2025 federal election",
    heldOn: "2025-05-03",
    eventId: "31496",
    source: "https://results.aec.gov.au/31496/Website/Downloads/",
    defaultDir: "data/geo/aec/2025",
    states: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
  },
};

export const fpFileName = (eventId: string, state: string): string =>
  `HouseStateFirstPrefsByPollingPlaceDownload-${eventId}-${state}.csv`;
export const tcpFileName = (eventId: string): string =>
  `HouseTcpByCandidateByPollingPlaceDownload-${eventId}.csv`;
export const tppFileName = (eventId: string): string =>
  `HouseTppByPollingPlaceDownload-${eventId}.csv`;

/** The AEC "votes by SA1" attendance file has no fixed name – pick any CSV mentioning SA1. */
export const SA1_FILE_RE = /sa1.*\.csv$/i;

/** Header sentinels: the header row is the first multi-field row containing one of these. */
export const BOOTH_HEADER_RE = /polling.?place.?id/i;
export const SA1_HEADER_RE = /^(pp_?id|sa1)/i;

// ── CSV ─────────────────────────────────────────────────────────────────────

/** RFC4180-ish CSV (mirrors load-referendum.ts / load-polling-places.ts / abs-parse.ts) –
 *  handles quoted fields with commas and doubled quotes; strips a leading BOM. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
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

/** CSV → records keyed by header. The AEC Tally Room downloads prepend a title/banner line
 *  before the header row, so the header is the first row with more than one field where some
 *  field matches `headerRe` – which also handles files with the header on line 1 (the votes-
 *  by-SA1 file has no banner). */
export function csvRecords(text: string, headerRe: RegExp): Record<string, string>[] {
  const rows = parseCsv(text).filter((r) => r.some((f) => f.trim() !== ""));
  const hIdx = rows.findIndex((r) => r.length > 1 && r.some((f) => headerRe.test(f.trim())));
  if (hIdx < 0) return [];
  const header = rows[hIdx].map((h) => h.trim());
  return rows.slice(hIdx + 1)
    .filter((r) => r.some((f) => f.trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      return o;
    });
}

/** AEC count cell → integer | null (strips thousands separators; blank → null, never 0). */
export function toInt(s: string | null | undefined): number | null {
  if (s == null) return null;
  const str = String(s).replace(/[,\s]/g, "");
  if (str === "") return null;
  const n = Number(str);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** First record key matching `re` (headers drift slightly across AEC files/years). */
function keyOf(rec: Record<string, string> | undefined, re: RegExp): string | null {
  if (!rec) return null;
  return Object.keys(rec).find((k) => re.test(k.trim())) ?? null;
}

const party = (ab: string | undefined): string => (ab && ab.trim() !== "" ? ab.trim() : "IND");
const isInformal = (rec: Record<string, string>): boolean =>
  (rec.Surname ?? "").trim().toLowerCase() === "informal";

// ── Row parsers ─────────────────────────────────────────────────────────────

/** First preferences (HouseStateFirstPrefsByPollingPlaceDownload, one file per state):
 *  one row per booth × candidate → aggregated per (booth, party). Ungrouped candidates
 *  (blank PartyAb) fall back to 'IND'; the AEC's informal pseudo-candidate row (Surname
 *  'Informal', blank PartyAb) is dropped so it can't pollute the IND share – fp values
 *  are formal ordinary votes, comparable with TCP. */
export function fpRows(recs: Record<string, string>[]): BoothVoteRow[] {
  const byKey = new Map<string, BoothVoteRow>();
  for (const r of recs) {
    const pp = (r.PollingPlaceID ?? "").trim();
    if (!pp || isInformal(r)) continue;
    const partyCode = party(r.PartyAb);
    const key = `${pp}:${partyCode}`;
    const votes = toInt(r.OrdinaryVotes) ?? 0;
    const cur = byKey.get(key);
    if (cur) cur.votes += votes;
    else byKey.set(key, { pollingPlaceId: pp, kind: "fp", partyCode, candidateId: null, candidate: null, votes });
  }
  return [...byKey.values()];
}

/** The informal pseudo-candidate rows the fp parser drops, kept as their own kind
 *  ('informal', one row per booth) — the numerator of the booth informality share
 *  (informality-risk targeting: informal / (informal + formal)). */
export function informalRows(recs: Record<string, string>[]): BoothVoteRow[] {
  const byBooth = new Map<string, BoothVoteRow>();
  for (const r of recs) {
    const pp = (r.PollingPlaceID ?? "").trim();
    if (!pp || !isInformal(r)) continue;
    const votes = toInt(r.OrdinaryVotes) ?? 0;
    const cur = byBooth.get(pp);
    if (cur) cur.votes += votes;
    else byBooth.set(pp, { pollingPlaceId: pp, kind: "informal", partyCode: "INF", candidateId: null, candidate: null, votes });
  }
  return [...byBooth.values()];
}

/** Two-candidate-preferred (HouseTcpByCandidateByPollingPlaceDownload): two rows per booth,
 *  kept per candidate (a TCP contest can be IND v IND, so the party code alone can't key it). */
export function tcpRows(recs: Record<string, string>[]): BoothVoteRow[] {
  const out: BoothVoteRow[] = [];
  for (const r of recs) {
    const pp = (r.PollingPlaceID ?? "").trim();
    if (!pp || isInformal(r)) continue;
    const name = [r.GivenNm, r.Surname].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
    out.push({
      pollingPlaceId: pp,
      kind: "tcp",
      partyCode: party(r.PartyAb),
      candidateId: (r.CandidateID ?? "").trim() || null,
      candidate: name || null,
      votes: toInt(r.OrdinaryVotes) ?? 0,
    });
  }
  return out;
}

/** Two-party-preferred (HouseTppByPollingPlaceDownload): one row per booth with the
 *  Coalition and ALP vote columns → two booth_result rows ('COAL', 'ALP'). Columns are
 *  matched fuzzily ("Liberal/National Coalition Votes" / "Australian Labor Party Votes")
 *  because the exact wording is a display label, not a stable code. */
export function tppRows(recs: Record<string, string>[]): BoothVoteRow[] {
  if (recs.length === 0) return [];
  const coalKey = keyOf(recs[0], /coalition votes/i);
  const alpKey = keyOf(recs[0], /labor party votes/i);
  if (!coalKey || !alpKey) {
    throw new Error("TPP columns not found (expected 'Liberal/National Coalition Votes' + 'Australian Labor Party Votes')");
  }
  const out: BoothVoteRow[] = [];
  for (const r of recs) {
    const pp = (r.PollingPlaceID ?? "").trim();
    if (!pp) continue;
    out.push({ pollingPlaceId: pp, kind: "tpp", partyCode: "COAL", candidateId: null, candidate: null, votes: toInt(r[coalKey]) ?? 0 });
    out.push({ pollingPlaceId: pp, kind: "tpp", partyCode: "ALP", candidateId: null, candidate: null, votes: toInt(r[alpKey]) ?? 0 });
  }
  return out;
}

/** Votes by SA1 (the AEC attendance crosswalk; columns approx. year, state_ab, div_nm,
 *  SA1_id, pp_id, pp_nm, votes – the SA1 column was 'ccd_id' in older releases, so match
 *  fuzzily). Aggregated per (SA1, booth): an SA1 straddling divisions can repeat a pair.
 *  Rows with no booth id (declaration-vote remainders) or non-positive votes are dropped. */
export function sa1Rows(recs: Record<string, string>[]): Sa1VoteRow[] {
  if (recs.length === 0) return [];
  const sa1Key = keyOf(recs[0], /^(sa1|ccd)/i);
  const ppKey = keyOf(recs[0], /^pp_?id$/i);
  const votesKey = keyOf(recs[0], /^votes?$/i);
  if (!sa1Key || !ppKey || !votesKey) {
    throw new Error("votes-by-SA1 columns not found (expected an SA1/ccd id, pp_id and votes)");
  }
  const byKey = new Map<string, Sa1VoteRow>();
  for (const r of recs) {
    const sa1 = (r[sa1Key] ?? "").trim();
    const pp = (r[ppKey] ?? "").trim();
    const votes = toInt(r[votesKey]) ?? 0;
    if (!sa1 || !pp || votes <= 0) continue;
    const key = `${sa1}|${pp}`;
    const cur = byKey.get(key);
    if (cur) cur.votes += votes;
    else byKey.set(key, { sa1Code: sa1, pollingPlaceId: pp, votes });
  }
  return [...byKey.values()];
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export type CliArgs = { election: string; dir: string | null; help: boolean };

/** Shared flag parsing for the election scripts: --election <id> [--dir <path>] [--help].
 *  Accepts both '--flag value' and '--flag=value'; unknown flags throw so a typo can't
 *  silently run against the default election. */
export function parseArgs(argv: string[], defaultElection = "federal-2025"): CliArgs {
  const out: CliArgs = { election: defaultElection, dir: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline: string | null = null;
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    const value = (): string => {
      if (inline !== null) return inline;
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} requires a value`);
      return v;
    };
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--election") out.election = value();
    else if (a === "--dir") out.dir = value();
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}
