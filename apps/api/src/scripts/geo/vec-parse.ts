// Pure parsing + catalogue for the VEC 2022 state-election loader (load-vec-results.ts).
// Side-effect-free (no Nest, no I/O, no process.exit) so it's unit-testable – mirrors
// election-parse.ts for the AEC pipeline. vec-parse.spec.ts pins the parse contract against
// excerpts of the real VEC files. Excluded from the coverage gate (src/scripts), but tested
// for correctness: a shifted column or a missed header row silently loads zeros.
//
// Sources (verified live 2026-07):
//   Primary + informal per voting centre – one BIFF .xls per district from the VEC blob
//     store: '<District> District-Results by Voting Centre.xls'. Banner rows, then a
//     candidate header row ('SURNAME, Given\nParty name\n' per column), then one row per
//     election-day voting centre, an 'Informal Votes' column and a 'Total Votes Polled'
//     column, terminated by a 'Total Ordinary Votes' row. Declaration votes (Absent /
//     Early Vote / Postal / Marked as Voted / Provisional) follow as aggregate rows and
//     are NOT per-centre – they are dropped, so 'fp' values are election-day ordinary
//     votes, comparable with the AEC loader's OrdinaryVotes.
//   Two-candidate-preferred – an HTML table per district on vec.vic.gov.au
//     ('…/<slug>-district-results/<slug>-2cp-results-by-voting-centre'): row 0 candidate
//     names, row 1 'Voting centres' + party names + Mis-sorts/Informal/Total columns,
//     then one row per centre until 'Ordinary votes total'. Narracan's 2022 poll was
//     superseded by the Jan 2023 supplementary election, published under a different URL.

export type VecKind = "fp" | "tcp" | "informal";

/** One geo.booth_result row in source terms – VEC files carry no booth ids, so rows are
 *  keyed (district, centre) and the loader resolves them to geo.polling_place ids. */
export type VecVoteRow = {
  district: string;
  centre: string;
  kind: VecKind;
  partyCode: string;
  candidate: string | null;
  votes: number;
};

export const VEC_2022 = {
  id: "vic-2022",
  jurisdiction: "vic",
  name: "2022 Victorian state election",
  heldOn: "2022-11-26",
  source: "https://www.vec.vic.gov.au/results/state-election-results/2022-state-election-results",
  defaultDir: "data/geo/vec/2022",
} as const;

const BLOB_BASE = "https://itsitecoreblobvecprd01.blob.core.windows.net/public-files/State/Reports";
const RESULTS_BASE = `${VEC_2022.source}/results-by-district`;
const NARRACAN_2CP_URL =
  "https://www.vec.vic.gov.au/results/state-election-results/state-by-elections-timeline/narracan-district-supplementary-election-results/2cp-results-by-voting-centre";

/** ABS SED names carry an upper-house region suffix ('Albert Park (Southern Metropolitan)');
 *  the VEC names districts bare. */
export const districtFromSedName = (sedName: string): string =>
  sedName.replace(/\s*\([^)]*\)\s*$/, "").trim();

export const slugify = (s: string): string =>
  s.toLowerCase().normalize("NFKD").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const primaryXlsUrl = (district: string): string =>
  `${BLOB_BASE}/${encodeURIComponent(`${district} District-Results by Voting Centre.xls`)}`;

export const tcpHtmlUrl = (district: string): string => {
  const slug = slugify(district);
  if (slug === "narracan") return NARRACAN_2CP_URL; // Jan 2023 supplementary election
  return `${RESULTS_BASE}/${slug}-district-results/${slug}-2cp-results-by-voting-centre`;
};

// ── Party codes ─────────────────────────────────────────────────────────────

/** VEC prints full registered party names; map the majors to the AEC-style abbreviations
 *  the heat map's aligned-party sets already use, and derive a stable acronym for the rest.
 *  Blank party (independents / unendorsed) → 'IND', matching election-parse.ts. */
const PARTY_CODES: Record<string, string> = {
  "australian labor party - victorian branch": "ALP",
  "liberal": "LP",
  "the nationals": "NP",
  "australian greens": "GRN",
  "the greens": "GRN",
  "animal justice party": "AJP",
  "pauline hanson's one nation": "ON",
  "shooters, fishers & farmers party (vic)": "SFF",
  "shooters, fishers & farmers vic": "SFF",
  "liberal democrats": "LDP",
  "libertarian": "LDP", // the Liberal Democrats' post-2022 name (Narracan supplementary)
  "legalise cannabis victoria": "LCV",
  "legalise cannabis": "LCV",
  "victorian socialists": "VS",
  "family first victoria": "FFV",
  "freedom party of victoria": "FPV",
  "freedom party": "FPV",
  "fiona patten's reason party": "REAS",
  "derryn hinch's justice party": "DHJP",
  "labour dlp": "DLP",
  "democratic labour party": "DLP",
  "sustainable australia party - clean safe affordable": "SAP",
  "affordable housing now - sustainable australia party": "SAP",
  "transport matters party": "TMP",
  "transport matters": "TMP",
  "health australia party": "HAP",
};

/** Normalise a VEC party label for lookup: collapse whitespace, unify dash characters.
 *  (The VEC uses ' - ' in party names; keep en-dash/em-dash inputs safe anyway.) */
const normParty = (name: string): string =>
  name.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

export function partyCode(name: string | null | undefined): string {
  const norm = normParty(name ?? "");
  if (norm === "") return "IND";
  const known = PARTY_CODES[norm];
  if (known) return known;
  // Stable fallback acronym from significant words: 'Angry Victorians Party' → 'AVP'.
  const initials = norm
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !["of", "the", "and", "for"].includes(w))
    .map((w) => w[0].toUpperCase())
    .join("");
  return initials.slice(0, 6) || "IND";
}

// ── Shared cell helpers ─────────────────────────────────────────────────────

export type Cell = string | number;

const cellStr = (c: Cell | undefined): string => (c == null ? "" : String(c)).trim();

/** VEC count cell → integer (numbers pass through; strings strip separators; blank → 0). */
export function toCount(c: Cell | undefined): number {
  if (typeof c === "number") return Number.isFinite(c) ? Math.trunc(c) : 0;
  const s = cellStr(c).replace(/[,\s]/g, "");
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** 'SURNAME, Given\nParty name\n' header cell → candidate + party (line 1 is the name;
 *  everything after is the party, blank for independents). */
export function parseCandidateCell(cell: string): { candidate: string; party: string } {
  const lines = String(cell).split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  return { candidate: lines[0] ?? "", party: lines.slice(1).filter(Boolean).join(" ") };
}

// ── Primary (first preferences + informal) – the per-district .xls ──────────

export type PrimaryParse = {
  district: string;
  fp: VecVoteRow[];
  informal: VecVoteRow[];
  /** District-total banner figures for cross-checking the load (never per centre). */
  banner: { formal: number | null; informal: number | null };
};

/** Parse one district's 'Results by Voting Centre' sheet (SheetJS header:1 rows).
 *  Only election-day voting-centre rows are kept – declaration aggregates are dropped. */
export function parsePrimarySheet(rows: Cell[][]): PrimaryParse {
  const districtRow = rows.find((r) => /\bDistrict \(Primary\)$/i.test(cellStr(r[0])));
  if (!districtRow) throw new Error("primary sheet: no '<District> District (Primary)' banner row");
  const district = cellStr(districtRow[0]).replace(/\s*District \(Primary\)$/i, "").trim();

  const bannerNum = (re: RegExp): number | null => {
    const row = rows.find((r) => re.test(cellStr(r[0])));
    return row ? toCount(row[2]) : null;
  };
  const banner = { formal: bannerNum(/^FORMAL VOTES:/i), informal: bannerNum(/^INFORMAL VOTES:/i) };

  // Anchored to the whole cell: the banner row prints 'INFORMAL VOTES:' (with a colon),
  // the candidate header cell is exactly 'Informal Votes' (a trailing newline in the sheet).
  const isInformalHeader = (c: Cell | undefined): boolean => /^Informal Votes$/i.test(cellStr(c));
  const headerIdx = rows.findIndex((r) => r.some(isInformalHeader));
  if (headerIdx < 0) throw new Error(`primary sheet (${district}): no candidate header row (no 'Informal Votes' cell)`);
  const header = rows[headerIdx];
  const informalIdx = header.findIndex(isInformalHeader);
  const totalIdx = header.findIndex((c) => /^Total Votes\s*Polled$/i.test(cellStr(c).replace(/\s+/g, " ")));
  const candidateCols: Array<{ idx: number; candidate: string; partyCode: string }> = [];
  for (let i = 0; i < header.length; i++) {
    if (i === informalIdx || (totalIdx >= 0 && i === totalIdx)) continue;
    const raw = cellStr(header[i]);
    if (raw === "") continue;
    const { candidate, party } = parseCandidateCell(String(header[i]));
    if (candidate) candidateCols.push({ idx: i, candidate, partyCode: partyCode(party) });
  }
  if (candidateCols.length === 0) throw new Error(`primary sheet (${district}): header row has no candidate columns`);

  const fpByKey = new Map<string, VecVoteRow>();
  const informal: VecVoteRow[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const label = cellStr(row[1]);
    if (label === "") continue;
    if (/^Total Ordinary Votes$/i.test(label)) break; // declaration aggregates follow
    // First-preference votes, aggregated per (centre, party) as the AEC parser does –
    // two independents in one district both land on 'IND'.
    for (const col of candidateCols) {
      const votes = toCount(row[col.idx]);
      const key = `${label}:${col.partyCode}`;
      const cur = fpByKey.get(key);
      if (cur) cur.votes += votes;
      else fpByKey.set(key, { district, centre: label, kind: "fp", partyCode: col.partyCode, candidate: null, votes });
    }
    informal.push({
      district, centre: label, kind: "informal", partyCode: "INF", candidate: null,
      votes: informalIdx >= 0 ? toCount(row[informalIdx]) : 0,
    });
  }
  if (informal.length === 0) throw new Error(`primary sheet (${district}): no voting-centre rows before 'Total Ordinary Votes'`);
  return { district, fp: [...fpByKey.values()], informal, banner };
}

// ── Two-candidate-preferred – the per-district HTML table ───────────────────

/** Minimal HTML entity decode for VEC table cells (names like O&#39;DWYER). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** First <table> in the page → trimmed text cells (th+td), tags stripped. */
export function htmlTableCells(html: string): string[][] {
  const table = /<table[\s\S]*?<\/table>/i.exec(html)?.[0];
  if (!table) return [];
  const out: string[][] = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells: string[] = [];
    for (const m of tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)) {
      cells.push(decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
    }
    out.push(cells);
  }
  return out;
}

/** Parse one district's 2CP-by-voting-centre page: two 'tcp' rows per election-day centre.
 *  Mis-sorts and the informal column are dropped (informality comes from the primary file);
 *  declaration aggregates after 'Ordinary votes total' are dropped. A candidate with a blank
 *  party header is an independent ('IND') – TCP rows keep the candidate name so an IND v IND
 *  contest can't collapse into one row. */
export function parseTcpHtml(html: string, district: string): VecVoteRow[] {
  const rows = htmlTableCells(html);
  const headerIdx = rows.findIndex((r) => /voting centres/i.test(r[0] ?? ""));
  if (headerIdx < 1) throw new Error(`2CP page (${district}): no 'Voting centres' header row found`);
  const names = rows[headerIdx - 1]; // candidate names sit above the party header
  const header = rows[headerIdx];
  const candidates = [1, 2].map((i) => ({
    col: i,
    candidate: (names[i] ?? "").trim(),
    partyCode: partyCode(header[i] ?? ""),
  }));
  if (!candidates[0].candidate || !candidates[1].candidate) {
    throw new Error(`2CP page (${district}): candidate name row not found above the header`);
  }
  const out: VecVoteRow[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const label = (rows[r][0] ?? "").trim();
    if (label === "" || /^&nbsp;$/.test(label)) continue;
    if (/ordinary votes total/i.test(label)) break; // declaration aggregates follow
    for (const c of candidates) {
      out.push({
        district, centre: label, kind: "tcp", partyCode: c.partyCode,
        candidate: c.candidate, votes: toCount(rows[r][c.col]),
      });
    }
  }
  if (out.length === 0) throw new Error(`2CP page (${district}): no voting-centre rows before 'Ordinary votes total'`);
  return out;
}
