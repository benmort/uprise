// Pure parsing + catalogue for the ABS demographics loader (load-abs.ts). Kept side-effect-free
// (no Nest, no I/O, no process.exit) so it's unit-testable — load-abs.ts imports it for the run,
// and abs-parse.spec.ts exercises the mapping against representative ABS fixtures. Excluded from the
// coverage gate (src/scripts), but tested for correctness because it was authored without the real
// files to hand: a wrong column name silently loads NULLs, so the parse contract is pinned by tests.

export type Level = "sa1" | "sa2" | "sa3" | "sa4";

export type IndicatorDef = {
  key: string;
  name: string;
  category: string;
  unit: string;
  format: string;
  source: string;
  polarity: "advantage" | "neutral" | "disadvantage";
  levels: Level[];
  sort: number;
  description?: string;
};

export type ValueRow = { level: string; code: string; indicator_key: string; value: number | null };

const SEIFA_SOURCE = "ABS SEIFA 2021 (2033.0.55.001)";
const CENSUS_G02 = "ABS Census 2021 · G02";
const CENSUS_G01 = "ABS Census 2021 · G01";
const CENSUS_G37 = "ABS Census 2021 · G37";

// The indicator catalogue seeded into geo.abs_indicator. `polarity` drives the choropleth ramp
// (advantage = high-is-good, disadvantage = low-is-worse, neutral = plain sequential).
export const INDICATORS: IndicatorDef[] = [
  { key: "seifa_irsd_decile", name: "SEIFA disadvantage (IRSD) decile", category: "socioeconomic", unit: "decile", format: "decile", source: SEIFA_SOURCE, polarity: "advantage", levels: ["sa1", "sa2"], sort: 1, description: "Index of Relative Socio-economic Disadvantage — national decile (1 = most disadvantaged)." },
  { key: "seifa_irsad_decile", name: "SEIFA advantage/disadvantage (IRSAD) decile", category: "socioeconomic", unit: "decile", format: "decile", source: SEIFA_SOURCE, polarity: "advantage", levels: ["sa1", "sa2"], sort: 2, description: "Index of Relative Socio-economic Advantage and Disadvantage — national decile." },
  { key: "seifa_ier_decile", name: "SEIFA economic resources (IER) decile", category: "socioeconomic", unit: "decile", format: "decile", source: SEIFA_SOURCE, polarity: "advantage", levels: ["sa1", "sa2"], sort: 3, description: "Index of Economic Resources — national decile." },
  { key: "seifa_ieo_decile", name: "SEIFA education/occupation (IEO) decile", category: "socioeconomic", unit: "decile", format: "decile", source: SEIFA_SOURCE, polarity: "advantage", levels: ["sa1", "sa2"], sort: 4, description: "Index of Education and Occupation — national decile." },
  { key: "seifa_irsd_score", name: "SEIFA disadvantage (IRSD) score", category: "socioeconomic", unit: "ordinal", format: "number", source: SEIFA_SOURCE, polarity: "advantage", levels: ["sa1", "sa2"], sort: 5, description: "IRSD standardised score (mean 1000; higher = less disadvantaged)." },
  { key: "median_age", name: "Median age", category: "demographic", unit: "years", format: "number", source: CENSUS_G02, polarity: "neutral", levels: ["sa1", "sa2", "sa3", "sa4"], sort: 1 },
  { key: "median_household_income_weekly", name: "Median household income (weekly)", category: "socioeconomic", unit: "aud", format: "currency", source: CENSUS_G02, polarity: "advantage", levels: ["sa1", "sa2", "sa3", "sa4"], sort: 10 },
  { key: "median_personal_income_weekly", name: "Median personal income (weekly)", category: "socioeconomic", unit: "aud", format: "currency", source: CENSUS_G02, polarity: "advantage", levels: ["sa1", "sa2", "sa3", "sa4"], sort: 11 },
  { key: "median_family_income_weekly", name: "Median family income (weekly)", category: "socioeconomic", unit: "aud", format: "currency", source: CENSUS_G02, polarity: "advantage", levels: ["sa1", "sa2", "sa3", "sa4"], sort: 12 },
  { key: "median_rent_weekly", name: "Median rent (weekly)", category: "housing", unit: "aud", format: "currency", source: CENSUS_G02, polarity: "neutral", levels: ["sa1", "sa2", "sa3", "sa4"], sort: 20 },
  { key: "median_mortgage_monthly", name: "Median mortgage repayment (monthly)", category: "housing", unit: "aud", format: "currency", source: CENSUS_G02, polarity: "neutral", levels: ["sa1", "sa2", "sa3", "sa4"], sort: 21 },
  { key: "avg_household_size", name: "Average household size", category: "housing", unit: "ratio", format: "number", source: CENSUS_G02, polarity: "neutral", levels: ["sa1", "sa2", "sa3", "sa4"], sort: 22 },
  { key: "avg_persons_per_bedroom", name: "Average persons per bedroom", category: "housing", unit: "ratio", format: "number", source: CENSUS_G02, polarity: "neutral", levels: ["sa1", "sa2", "sa3", "sa4"], sort: 23 },
  // Derived shares (percent 0–100) from G01/G37 — the CALD / First Nations / tenure signals the
  // canvass targeting fit lens uses. Denominators under MIN_SHARE_DENOMINATOR are nulled (ABS
  // small-cell perturbation makes tiny-cell rates meaningless — treat as suppressed).
  { key: "cald_lote_share", name: "Language other than English at home (share)", category: "demographic", unit: "pct", format: "percent", source: CENSUS_G01, polarity: "neutral", levels: ["sa1"], sort: 30, description: "Share of people using a language other than English at home (Census G01)." },
  { key: "indigenous_share", name: "Aboriginal and Torres Strait Islander peoples (share)", category: "demographic", unit: "pct", format: "percent", source: CENSUS_G01, polarity: "neutral", levels: ["sa1"], sort: 31, description: "Share of people identifying as Aboriginal and/or Torres Strait Islander (Census G01)." },
  { key: "age_18_24_share", name: "Young adults 18–24 (est. share)", category: "demographic", unit: "pct", format: "percent", source: CENSUS_G01, polarity: "neutral", levels: ["sa1"], sort: 32, description: "Estimated share aged 18–24: the 20–24 cohort plus two fifths of 15–19 (Census G01 five-year bands don't split at 18)." },
  { key: "renter_share", name: "Renting households (share)", category: "housing", unit: "pct", format: "percent", source: CENSUS_G37, polarity: "neutral", levels: ["sa1"], sort: 24, description: "Share of occupied private dwellings that are rented (Census G37)." },
  { key: "social_housing_share", name: "Social housing (share)", category: "housing", unit: "pct", format: "percent", source: CENSUS_G37, polarity: "neutral", levels: ["sa1"], sort: 25, description: "Share of dwellings rented from a state or territory housing authority (Census G37)." },
];

// Census G02 DataPack: one small CSV per level (just the G02 table, not the whole DataPack).
export const CENSUS_G02_FILES: Record<Level, string> = {
  sa1: "2021Census_G02_AUST_SA1.csv",
  sa2: "2021Census_G02_AUST_SA2.csv",
  sa3: "2021Census_G02_AUST_SA3.csv",
  sa4: "2021Census_G02_AUST_SA4.csv",
};
// indicator key → the ABS G02 short column name.
export const CENSUS_G02_COLUMNS: Record<string, string> = {
  median_age: "Median_age_persons",
  median_mortgage_monthly: "Median_mortgage_repay_monthly",
  median_personal_income_weekly: "Median_tot_prsnl_inc_weekly",
  median_rent_weekly: "Median_rent_weekly",
  median_family_income_weekly: "Median_tot_fam_inc_weekly",
  avg_persons_per_bedroom: "Average_num_psns_per_bedroom",
  median_household_income_weekly: "Median_tot_hhd_inc_weekly",
  avg_household_size: "Average_household_size",
};

// SEIFA 2021 "Indexes" data cubes (.xlsx) — one workbook per level (as ABS ships them). The
// "Table 1" SEIFA Summary sheet holds all four indexes as fixed Score/Decile column pairs, so we
// read by column OFFSET (the sub-headers are just repeated "Score"/"Decile" and can't be matched
// by name). Summary layout: 0 = ASGS code, 1 = name, then per index: Score, Decile —
//   2/3 IRSD · 4/5 IRSAD · 6/7 IER · 8/9 IEO · 10 usual-resident population.
export const SEIFA_FILES: Record<"sa1" | "sa2", string> = {
  sa1: "seifa_sa1_indexes.xlsx",
  sa2: "seifa_sa2_indexes.xlsx",
};
export const SEIFA_SUMMARY_SHEET = "Table 1";
// Offsets of each kept measure RELATIVE to the first index column (IRSD score). The Summary
// lays out, after the code (+ an optional name column): IRSD score,decile · IRSAD score,decile ·
// IER score,decile · IEO score,decile. SA2 has a name column, SA1 doesn't — so the base is
// detected per file rather than hard-coded (see seifaRows).
const SEIFA_REL_COLS: Array<{ key: string; rel: number }> = [
  { key: "seifa_irsd_score", rel: 0 },
  { key: "seifa_irsd_decile", rel: 1 },
  { key: "seifa_irsad_decile", rel: 3 },
  { key: "seifa_ier_decile", rel: 5 },
  { key: "seifa_ieo_decile", rel: 7 },
];

/** RFC4180-ish CSV (mirrors load-referendum.ts / load-polling-places.ts). */
export function parseCsv(text: string): string[][] {
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

/** ABS numeric cell → number | null. Strips $ , spaces; treats blank / "-" / "NP" (not published)
 *  as null so suppressed cells don't become 0. */
export function toNum(s: unknown): number | null {
  if (s === null || s === undefined) return null;
  const str = String(s).replace(/[,\s$]/g, "").trim();
  if (str === "" || str === "-" || str.toUpperCase() === "NP") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

/** The region-code column in a Census DataPack CSV: the header ending `_CODE_2021`, else column 0. */
export function codeColumn(header: string[]): number {
  const i = header.findIndex((h) => /_code_2021$/i.test(h.trim()));
  return i >= 0 ? i : 0;
}

/** Census G02 CSV (one level) → value rows for the mapped measures. */
export function censusRows(level: Level, csv: string): ValueRow[] {
  const rows = parseCsv(csv).filter((r) => r.some((f) => f.trim() !== ""));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const codeAt = codeColumn(header);
  const colIndex: Record<string, number> = {};
  for (const [key, col] of Object.entries(CENSUS_G02_COLUMNS)) {
    const idx = header.findIndex((h) => h.trim().toLowerCase() === col.toLowerCase());
    if (idx >= 0) colIndex[key] = idx;
  }
  const out: ValueRow[] = [];
  for (const r of rows.slice(1)) {
    const code = (r[codeAt] ?? "").trim();
    if (!code) continue;
    for (const [key, idx] of Object.entries(colIndex)) {
      out.push({ level, code, indicator_key: key, value: toNum(r[idx]) });
    }
  }
  return out;
}

// ── Derived share tables (G01 persons, G37 tenure) ──────────────────────────

/** Rates from cells this small are perturbation noise — treat as suppressed. */
export const MIN_SHARE_DENOMINATOR = 10;

export type ShareDef = {
  key: string;
  /** Summed numerator terms; each term is the first matching column × weight (default 1). */
  numerators: Array<{ cols: string[]; weight?: number }>;
  /** First matching column wins. */
  denominator: string[];
};

/** G01 (selected person characteristics) → person-share indicators. Column names verified
 *  against the 2021 short-header DataPack. */
export const CENSUS_G01_FILE = "2021Census_G01_AUST_SA1.csv";
export const G01_SHARES: ShareDef[] = [
  { key: "cald_lote_share", numerators: [{ cols: ["Lang_used_home_Oth_Lang_P", "Lang_spoken_home_Oth_Lang_P"] }], denominator: ["Tot_P_P"] },
  { key: "indigenous_share", numerators: [{ cols: ["Indigenous_P_Tot_P"] }], denominator: ["Tot_P_P"] },
  // 18–24 estimate: whole 20–24 band + 2/5 of the 15–19 band (five-year bands don't split at 18).
  { key: "age_18_24_share", numerators: [{ cols: ["Age_20_24_yr_P"] }, { cols: ["Age_15_19_yr_P"], weight: 0.4 }], denominator: ["Tot_P_P"] },
];

/** G37 (tenure and landlord type by dwelling structure) → dwelling-share indicators. */
export const CENSUS_G37_FILE = "2021Census_G37_AUST_SA1.csv";
export const G37_SHARES: ShareDef[] = [
  { key: "renter_share", numerators: [{ cols: ["R_Tot_Total"] }], denominator: ["Total_Total"] },
  { key: "social_housing_share", numerators: [{ cols: ["R_ST_h_auth_Total"] }], denominator: ["Total_Total"] },
];

/**
 * Census share table → percent (0–100) value rows. Suppression-honest: a denominator under
 * {@link MIN_SHARE_DENOMINATOR} yields null (never a fabricated rate), and an indicator whose
 * numerator/denominator columns are absent from the header is reported in `missing` rather
 * than silently loading nothing.
 */
export function shareRows(
  level: Level,
  csv: string,
  defs: ShareDef[],
): { rows: ValueRow[]; missing: string[] } {
  const parsed = parseCsv(csv).filter((r) => r.some((f) => f.trim() !== ""));
  if (parsed.length < 2) return { rows: [], missing: defs.map((d) => d.key) };
  const header = parsed[0].map((h) => h.trim());
  const codeAt = codeColumn(header);
  const find = (cands: string[]): number =>
    header.findIndex((h) => cands.some((c) => h.toLowerCase() === c.toLowerCase()));

  const resolved: Array<{ key: string; terms: Array<{ idx: number; weight: number }>; denIdx: number }> = [];
  const missing: string[] = [];
  for (const def of defs) {
    const denIdx = find(def.denominator);
    const terms = def.numerators.map((t) => ({ idx: find(t.cols), weight: t.weight ?? 1 }));
    if (denIdx < 0 || terms.some((t) => t.idx < 0)) {
      missing.push(def.key);
      continue;
    }
    resolved.push({ key: def.key, terms, denIdx });
  }

  const rows: ValueRow[] = [];
  for (const r of parsed.slice(1)) {
    const code = (r[codeAt] ?? "").trim();
    if (!code) continue;
    for (const def of resolved) {
      const den = toNum(r[def.denIdx]);
      if (den === null || den < MIN_SHARE_DENOMINATOR) {
        rows.push({ level, code, indicator_key: def.key, value: null });
        continue;
      }
      let num = 0;
      let anyNull = false;
      for (const t of def.terms) {
        const v = toNum(r[t.idx]);
        if (v === null) { anyNull = true; break; }
        num += v * t.weight;
      }
      rows.push({
        level,
        code,
        indicator_key: def.key,
        value: anyNull ? null : Math.max(0, Math.min(100, (num / den) * 100)),
      });
    }
  }
  return { rows, missing };
}

/** SEIFA "Table 1" Summary sheet (rows-as-arrays) → value rows. Data rows are those whose first
 *  cell is a 9-digit (SA2) or 11-digit (SA1) ASGS code, which skips the title/header/footnote rows
 *  with no name matching. The index columns start right after the code, skipping an optional NAME
 *  column (SA2 has one, SA1 doesn't) — detected from the first data row (is col 1 a number or a
 *  name?), so the same reader handles both files. */
export function seifaRows(level: "sa1" | "sa2", sheet: unknown[][]): ValueRow[] {
  const out: ValueRow[] = [];
  let base = -1;
  for (const row of sheet) {
    const code = String(row?.[0] ?? "").trim();
    if (!/^\d{9,11}$/.test(code)) continue;
    if (base < 0) base = toNum(row[1]) !== null ? 1 : 2; // col 1 numeric ⇒ no name column ⇒ scores at col 1
    for (const { key, rel } of SEIFA_REL_COLS) {
      out.push({ level, code, indicator_key: key, value: toNum(row[base + rel]) });
    }
  }
  return out;
}
